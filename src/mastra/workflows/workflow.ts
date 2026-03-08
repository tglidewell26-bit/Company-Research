import { createStep, createWorkflow } from "../inngest";
import { z } from "zod";
import { loadExclusionListsTool } from "../tools/loadExclusionLists";
import { geocodeAndValidateTerritoryTool } from "../tools/geocoder";
import { discoverCompaniesTool } from "../tools/discoverCompanies";
import { deduplicateCompaniesTool, isDuplicate } from "../tools/deduplicator";
import { generateOverviewTool } from "../tools/overviewGenerator";
import { writeProspectsTool } from "../tools/writeProspects";
import { appendSheetRows } from "../tools/googleSheets";
import { SHEET_TABS } from "../tools/sheetConfig";

const WORKFLOW_TIMEOUT_MS = 60 * 60 * 1000;

function checkTimeout(startTime: number, stepName: string, logger?: any): void {
  const elapsed = Date.now() - startTime;
  if (elapsed > WORKFLOW_TIMEOUT_MS) {
    const minutes = Math.round(elapsed / 60000);
    const msg = `⛔ [FAILSAFE] Workflow exceeded 1-hour timeout (${minutes} min elapsed) during ${stepName}. Terminating.`;
    logger?.error(msg);
    throw new Error(msg);
  }
}

const companySchema = z.object({
  name: z.string(),
  website: z.string(),
});

const loadExclusionData = createStep({
  id: "load-exclusion-data",
  description:
    "Loads excluded companies and starting list from Google Sheets. Creates a new spreadsheet if none is configured.",

  inputSchema: z.object({}),

  outputSchema: z.object({
    spreadsheetId: z.string(),
    excludedCompanies: z.array(companySchema),
    startingList: z.array(companySchema),
    dontSearch: z.array(companySchema),
    workflowStartTime: z.number(),
  }),

  execute: async ({ mastra }) => {
    const logger = mastra?.getLogger();
    const startTime = Date.now();
    logger?.info("📋 [Step 1] Loading exclusion data from Google Sheets...");
    logger?.info("⏱️ [Step 1] Workflow started with 1-hour failsafe timeout");

    const result = await loadExclusionListsTool.execute({}, { mastra });
    if ("error" in result && result.error) {
      throw new Error(
        `Failed to load exclusion lists: ${JSON.stringify(result)}`,
      );
    }

    const dontSearch = [...result.excludedCompanies];

    logger?.info(
      `📋 [Step 1] Loaded ${result.excludedCompanies.length} ignored companies and ${result.startingList.length} existing companies`,
    );

    return {
      spreadsheetId: result.spreadsheetId,
      excludedCompanies: result.excludedCompanies,
      startingList: result.startingList,
      dontSearch,
      workflowStartTime: startTime,
    };
  },
});

const deduplicateStartingList = createStep({
  id: "deduplicate-starting-list",
  description:
    "Removes ignored companies from the existing list and deduplicates the remaining companies using fuzzy name matching (92% threshold). Runs before website validation to reduce the number of companies to check.",

  inputSchema: z.object({
    spreadsheetId: z.string(),
    excludedCompanies: z.array(companySchema),
    startingList: z.array(companySchema),
    dontSearch: z.array(companySchema),
    workflowStartTime: z.number(),
  }),

  outputSchema: z.object({
    spreadsheetId: z.string(),
    excludedCompanies: z.array(companySchema),
    startingList: z.array(companySchema),
    dontSearch: z.array(companySchema),
    ignoredRemoved: z.number(),
    duplicatesRemoved: z.number(),
    workflowStartTime: z.number(),
  }),

  execute: async ({ inputData, mastra }) => {
    const logger = mastra?.getLogger();
    checkTimeout(inputData.workflowStartTime, "Step 1b - Deduplication", logger);
    const originalCount = inputData.startingList.length;
    logger?.info(
      `🧹 [Step 1b] Deduplicating ${originalCount} existing companies...`,
    );

    let filtered = [...inputData.startingList];
    let ignoredRemoved = 0;
    const ignoredMatches: { name: string; matchedWith: string }[] = [];

    for (let i = filtered.length - 1; i >= 0; i--) {
      for (const ignored of inputData.excludedCompanies) {
        if (isDuplicate(filtered[i].name, ignored.name, 92)) {
          ignoredMatches.push({
            name: filtered[i].name,
            matchedWith: ignored.name,
          });
          filtered.splice(i, 1);
          ignoredRemoved++;
          break;
        }
      }
    }

    for (const match of ignoredMatches) {
      logger?.info(
        `🚫 [Step 1b] Removed ignored company: "${match.name}" (matched ignored: "${match.matchedWith}")`,
      );
    }

    logger?.info(
      `🚫 [Step 1b] Removed ${ignoredRemoved} companies matching the ignored list`,
    );

    const unique: { name: string; website: string }[] = [];
    let duplicatesRemoved = 0;
    const dupMatches: { name: string; matchedWith: string }[] = [];

    for (const company of filtered) {
      let isDup = false;
      for (const accepted of unique) {
        if (isDuplicate(company.name, accepted.name, 92)) {
          dupMatches.push({
            name: company.name,
            matchedWith: accepted.name,
          });
          isDup = true;
          duplicatesRemoved++;
          break;
        }
      }
      if (!isDup) {
        unique.push(company);
      }
    }

    for (const match of dupMatches) {
      logger?.info(
        `🔄 [Step 1b] Removed duplicate: "${match.name}" (matched: "${match.matchedWith}")`,
      );
    }

    logger?.info(
      `🧹 [Step 1b] Deduplication complete: ${originalCount} → ${unique.length} companies (${ignoredRemoved} ignored, ${duplicatesRemoved} duplicates removed)`,
    );

    return {
      spreadsheetId: inputData.spreadsheetId,
      excludedCompanies: inputData.excludedCompanies,
      startingList: unique,
      dontSearch: inputData.dontSearch,
      ignoredRemoved,
      duplicatesRemoved,
      workflowStartTime: inputData.workflowStartTime,
    };
  },
});

const validateStartingList = createStep({
  id: "validate-starting-list",
  description:
    "Uses the Existing Companies tab as a pre-validated in-territory list and adds it directly to dontSearch.",

  inputSchema: z.object({
    spreadsheetId: z.string(),
    excludedCompanies: z.array(companySchema),
    startingList: z.array(companySchema),
    dontSearch: z.array(companySchema),
    ignoredRemoved: z.number(),
    duplicatesRemoved: z.number(),
    workflowStartTime: z.number(),
  }),

  outputSchema: z.object({
    spreadsheetId: z.string(),
    validatedStartingList: z.array(companySchema),
    dontSearch: z.array(companySchema),
    invalidCount: z.number(),
    workflowStartTime: z.number(),
  }),

  execute: async ({ inputData, mastra }) => {
    const logger = mastra?.getLogger();
    checkTimeout(inputData.workflowStartTime, "Step 2 - Validation", logger);
    logger?.info(
      `🔍 [Step 2] Using ${inputData.startingList.length} existing companies as pre-validated`,
    );

    const validatedStartingList = inputData.startingList.filter((c) =>
      c.name?.trim(),
    );

    const validatedDontSearch = [
      ...inputData.excludedCompanies,
      ...validatedStartingList,
    ];

    logger?.info(
      `🔍 [Step 2] Added ${validatedStartingList.length} existing companies to dontSearch without website/geocode re-validation`,
    );

    return {
      spreadsheetId: inputData.spreadsheetId,
      validatedStartingList,
      dontSearch: validatedDontSearch,
      invalidCount: 0,
      workflowStartTime: inputData.workflowStartTime,
    };
  },
});

const runDiscoveryLoop = createStep({
  id: "run-discovery-loop",
  description:
    "Iteratively discovers new biotech companies using AI search, deduplicates results, and validates territory. Stops after 3 consecutive iterations with no new companies.",

  inputSchema: z.object({
    spreadsheetId: z.string(),
    validatedStartingList: z.array(companySchema),
    dontSearch: z.array(companySchema),
    invalidCount: z.number(),
    workflowStartTime: z.number(),
  }),

  outputSchema: z.object({
    spreadsheetId: z.string(),
    existingCompanies: z.array(
      z.object({
        name: z.string(),
        website: z.string(),
      }),
    ),
    newCompanies: z.array(
      z.object({
        name: z.string(),
        website: z.string(),
      }),
    ),
    totalIterations: z.number(),
    totalDuplicatesRemoved: z.number(),
    totalOutOfTerritory: z.number(),
    workflowStartTime: z.number(),
  }),

  execute: async ({ inputData, mastra }) => {
    const logger = mastra?.getLogger();
    checkTimeout(inputData.workflowStartTime, "Step 3 - Discovery start", logger);
    logger?.info("🔄 [Step 3] Starting discovery loop...");

    let dontSearch = [...inputData.dontSearch];
    const allDiscovered: { name: string; website: string }[] = [];
    let zeroRounds = 0;
    let iteration = 0;
    let totalDuplicatesRemoved = 0;
    let totalOutOfTerritory = 0;
    const maxIterations = parseInt(
      process.env.MAX_DISCOVERY_ITERATIONS || "10",
      10,
    );

    while (zeroRounds < 3 && iteration < maxIterations) {
      iteration++;
      checkTimeout(inputData.workflowStartTime, `Step 3 - Discovery iteration ${iteration}`, logger);
      logger?.info(
        `\n🔄 [Step 3] === Iteration ${iteration} (${zeroRounds} consecutive zero rounds) ===`,
      );

      const excludedNames = dontSearch.map((c) => c.name);

      const discoveryResult = await discoverCompaniesTool.execute(
        { excludedNames, batchNumber: iteration },
        { mastra },
      );
      if ("error" in discoveryResult && discoveryResult.error) {
        logger?.warn(
          `⚠️ [Step 3] Discovery failed in iteration ${iteration}, skipping`,
        );
        zeroRounds++;
        continue;
      }

      const discovered = discoveryResult.discoveredCompanies;
      logger?.info(
        `🔎 [Step 3] Iteration ${iteration}: AI discovery returned ${discovered.length} companies`,
      );

      if (discovered.length === 0) {
        zeroRounds++;
        logger?.info(
          `🔎 [Step 3] Iteration ${iteration}: No companies returned, zero round ${zeroRounds}/3`,
        );
        continue;
      }

      const dedupeResult = await deduplicateCompaniesTool.execute(
        {
          newCompanies: discovered.map((c) => ({
            name: c.name,
            website: c.website,
          })),
          existingCompanies: dontSearch,
        },
        { mastra },
      );
      if ("error" in dedupeResult && dedupeResult.error) {
        logger?.warn(
          `⚠️ [Step 3] Deduplication failed in iteration ${iteration}`,
        );
        zeroRounds++;
        continue;
      }

      totalDuplicatesRemoved += dedupeResult.duplicatesRemoved;
      logger?.info(
        `🔄 [Step 3] Iteration ${iteration}: ${dedupeResult.duplicatesRemoved} duplicates removed, ${dedupeResult.uniqueCompanies.length} unique`,
      );

      if (dedupeResult.uniqueCompanies.length === 0) {
        zeroRounds++;
        logger?.info(
          `🔄 [Step 3] Iteration ${iteration}: All duplicates, zero round ${zeroRounds}/3`,
        );
        continue;
      }

      const geoResult = await geocodeAndValidateTerritoryTool.execute(
        {
          companies: dedupeResult.uniqueCompanies.map((c) => ({
            name: c.name,
            website: c.website,
            address: discovered.find((d) => d.name === c.name)?.address,
          })),
        },
        { mastra },
      );
      if ("error" in geoResult && geoResult.error) {
        logger?.warn(`⚠️ [Step 3] Geocoding failed in iteration ${iteration}`);
        zeroRounds++;
        continue;
      }

      totalOutOfTerritory += geoResult.outOfTerritoryCount;
      const validCompanies = geoResult.validCompanies
        .filter((c) => c.inTerritory)
        .map((c) => ({ name: c.name, website: c.website }));

      logger?.info(
        `📍 [Step 3] Iteration ${iteration}: ${validCompanies.length} companies validated in territory`,
      );

      if (validCompanies.length > 0) {
        allDiscovered.push(...validCompanies);
        dontSearch.push(...validCompanies);
        zeroRounds = 0;
        logger?.info(
          `✅ [Step 3] Iteration ${iteration}: Added ${validCompanies.length} new companies (total: ${allDiscovered.length})`,
        );
      } else {
        zeroRounds++;
        logger?.info(
          `🔄 [Step 3] Iteration ${iteration}: No valid companies, zero round ${zeroRounds}/3`,
        );
      }

      await new Promise((r) => setTimeout(r, 500));
    }

    logger?.info(
      `\n🏁 [Step 3] Discovery loop complete after ${iteration} iterations`,
    );
    logger?.info(
      `🏁 [Step 3] Existing companies: ${inputData.validatedStartingList.length}, Newly discovered: ${allDiscovered.length}`,
    );
    logger?.info(
      `🏁 [Step 3] Total duplicates removed: ${totalDuplicatesRemoved}`,
    );
    logger?.info(`🏁 [Step 3] Total out of territory: ${totalOutOfTerritory}`);

    return {
      spreadsheetId: inputData.spreadsheetId,
      existingCompanies: inputData.validatedStartingList,
      newCompanies: allDiscovered,
      totalIterations: iteration,
      totalDuplicatesRemoved,
      totalOutOfTerritory,
      workflowStartTime: inputData.workflowStartTime,
    };
  },
});

const generateOverviewsStep = createStep({
  id: "generate-overviews",
  description:
    "Generates summaries for existing companies and fit assessments for newly discovered companies. Poor Fit new companies are excluded.",

  inputSchema: z.object({
    spreadsheetId: z.string(),
    existingCompanies: z.array(companySchema),
    newCompanies: z.array(companySchema),
    totalIterations: z.number(),
    totalDuplicatesRemoved: z.number(),
    totalOutOfTerritory: z.number(),
    workflowStartTime: z.number(),
  }),

  outputSchema: z.object({
    spreadsheetId: z.string(),
    companiesWithOverviews: z.array(
      z.object({
        name: z.string(),
        website: z.string(),
        overview: z.string(),
        fitStatus: z.enum(["Good Fit", "Maybe", "Poor Fit"]),
        fitRationale: z.string(),
      }),
    ),
    stats: z.object({
      totalIterations: z.number(),
      totalDuplicatesRemoved: z.number(),
      totalOutOfTerritory: z.number(),
      totalDiscovered: z.number(),
      existingCount: z.number(),
      newCount: z.number(),
      poorFitExcluded: z.number(),
    }),
    workflowStartTime: z.number(),
  }),

  execute: async ({ inputData, mastra }) => {
    const logger = mastra?.getLogger();
    checkTimeout(inputData.workflowStartTime, "Step 4 - Overview generation start", logger);
    logger?.info(
      `📝 [Step 4] Processing ${inputData.existingCompanies.length} existing (summary only) + ${inputData.newCompanies.length} new (fit assessment) companies`,
    );

    const batchSize = 5;
    const allResults: {
      name: string;
      website: string;
      overview: string;
      fitStatus: "Good Fit" | "Maybe" | "Poor Fit";
      fitRationale: string;
    }[] = [];
    let poorFitExcluded = 0;

    // --- Pass 1: Existing companies — summary only, all kept ---
    if (inputData.existingCompanies.length > 0) {
      const existingBatches = Math.ceil(inputData.existingCompanies.length / batchSize);
      logger?.info(`📝 [Step 4] Pass 1: ${inputData.existingCompanies.length} existing companies in ${existingBatches} batches`);

      for (let i = 0; i < inputData.existingCompanies.length; i += batchSize) {
        checkTimeout(inputData.workflowStartTime, `Step 4 - Existing batch ${Math.floor(i / batchSize) + 1}/${existingBatches}`, logger);
        const batch = inputData.existingCompanies.slice(i, i + batchSize);

        const result = await generateOverviewTool.execute({ companies: batch, overviewOnly: true }, { mastra });
        allResults.push(...result.companiesWithOverviews.map((c) => ({ ...c, fitRationale: "" })));
        logger?.info(`✅ [Step 4] Existing batch ${Math.floor(i / batchSize) + 1}/${existingBatches}: wrote ${batch.length} summaries`);
      }
    }

    // --- Pass 2: New companies — fit assessment, Poor Fit excluded ---
    if (inputData.newCompanies.length > 0) {
      const newBatches = Math.ceil(inputData.newCompanies.length / batchSize);
      logger?.info(`📝 [Step 4] Pass 2: ${inputData.newCompanies.length} new companies in ${newBatches} batches (Poor Fit excluded)`);

      for (let i = 0; i < inputData.newCompanies.length; i += batchSize) {
        checkTimeout(inputData.workflowStartTime, `Step 4 - New batch ${Math.floor(i / batchSize) + 1}/${newBatches}`, logger);
        const batch = inputData.newCompanies.slice(i, i + batchSize);

        const result = await generateOverviewTool.execute({ companies: batch }, { mastra });

        for (const c of result.companiesWithOverviews) {
          if (c.fitStatus === "Poor Fit") {
            poorFitExcluded++;
            logger?.info(`🚫 [Step 4] Excluded Poor Fit: "${c.name}"`);
          } else {
            allResults.push(c);
          }
        }
        logger?.info(`✅ [Step 4] New batch ${Math.floor(i / batchSize) + 1}/${newBatches}: kept ${result.companiesWithOverviews.filter(c => c.fitStatus !== "Poor Fit").length}, excluded ${result.companiesWithOverviews.filter(c => c.fitStatus === "Poor Fit").length}`);
      }
    }

    logger?.info(
      `✅ [Step 4] Complete: ${allResults.length} companies total (${inputData.existingCompanies.length} existing + ${allResults.length - inputData.existingCompanies.length} new), ${poorFitExcluded} Poor Fit excluded`,
    );

    return {
      spreadsheetId: inputData.spreadsheetId,
      companiesWithOverviews: allResults,
      stats: {
        totalIterations: inputData.totalIterations,
        totalDuplicatesRemoved: inputData.totalDuplicatesRemoved,
        totalOutOfTerritory: inputData.totalOutOfTerritory,
        totalDiscovered: allResults.length,
        existingCount: inputData.existingCompanies.length,
        newCount: inputData.newCompanies.length,
        poorFitExcluded,
      },
      workflowStartTime: inputData.workflowStartTime,
    };
  },
});

const writeResultsStep = createStep({
  id: "write-results",
  description:
    "Writes all qualified companies with overviews to the Results tab in Google Sheets and appends run stats to Run Log.",

  inputSchema: z.object({
    spreadsheetId: z.string(),
    companiesWithOverviews: z.array(
      z.object({
        name: z.string(),
        website: z.string(),
        overview: z.string(),
        fitStatus: z.enum(["Good Fit", "Maybe", "Poor Fit"]),
        fitRationale: z.string(),
      }),
    ),
    stats: z.object({
      totalIterations: z.number(),
      totalDuplicatesRemoved: z.number(),
      totalOutOfTerritory: z.number(),
      totalDiscovered: z.number(),
      existingCount: z.number(),
      newCount: z.number(),
      poorFitExcluded: z.number(),
    }),
    workflowStartTime: z.number(),
  }),

  outputSchema: z.object({
    summary: z.string(),
    spreadsheetUrl: z.string(),
    rowsWritten: z.number(),
    success: z.boolean(),
  }),

  execute: async ({ inputData, mastra }) => {
    const logger = mastra?.getLogger();
    checkTimeout(inputData.workflowStartTime, "Step 5 - Write results", logger);
    logger?.info(
      `📊 [Step 5] Writing ${inputData.companiesWithOverviews.length} companies to Google Sheet...`,
    );

    if (inputData.companiesWithOverviews.length === 0) {
      const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${inputData.spreadsheetId}`;
      logger?.info(
        "📊 [Step 5] No companies to write, discovery produced no results",
      );

      await appendSheetRows(inputData.spreadsheetId, SHEET_TABS.runLog, [
        [
          new Date().toISOString(),
          inputData.spreadsheetId,
          String(inputData.stats.totalIterations),
          String(inputData.stats.totalDiscovered),
          String(inputData.stats.totalDuplicatesRemoved),
          String(inputData.stats.totalOutOfTerritory),
          "0",
          "Discovery completed but no companies were qualified for output.",
        ],
      ]);

      return {
        summary:
          "Discovery completed but no new companies were found in the territory.",
        spreadsheetUrl,
        rowsWritten: 0,
        success: true,
      };
    }

    const writeResult = await writeProspectsTool.execute(
      {
        spreadsheetId: inputData.spreadsheetId,
        companies: inputData.companiesWithOverviews,
      },
      { mastra },
    );
    if ("error" in writeResult && writeResult.error) {
      throw new Error(
        `Failed to write prospects: ${JSON.stringify(writeResult)}`,
      );
    }

    const summary = `Territory Intelligence Discovery Complete!
- Iterations: ${inputData.stats.totalIterations}
- Existing companies (summaries): ${inputData.stats.existingCount}
- New companies discovered: ${inputData.stats.newCount}
- New companies excluded (Poor Fit): ${inputData.stats.poorFitExcluded}
- Duplicates removed: ${inputData.stats.totalDuplicatesRemoved}
- Out of territory: ${inputData.stats.totalOutOfTerritory}
- Total rows written to sheet: ${writeResult.rowsWritten}
- Sheet URL: ${writeResult.spreadsheetUrl}`;

    await appendSheetRows(inputData.spreadsheetId, SHEET_TABS.runLog, [
      [
        new Date().toISOString(),
        inputData.spreadsheetId,
        String(inputData.stats.totalIterations),
        String(inputData.stats.totalDiscovered),
        String(inputData.stats.totalDuplicatesRemoved),
        String(inputData.stats.totalOutOfTerritory),
        String(writeResult.rowsWritten),
        summary,
      ],
    ]);

    logger?.info(`\n${summary}`);

    return {
      summary,
      spreadsheetUrl: writeResult.spreadsheetUrl,
      rowsWritten: writeResult.rowsWritten,
      success: true,
    };
  },
});

export const territoryDiscoveryWorkflow = createWorkflow({
  id: "territory-discovery-workflow",

  inputSchema: z.object({}) as any,

  outputSchema: z.object({
    summary: z.string(),
    spreadsheetUrl: z.string(),
    rowsWritten: z.number(),
    success: z.boolean(),
  }),
})
  .then(loadExclusionData as any)
  .then(deduplicateStartingList as any)
  .then(validateStartingList as any)
  .then(runDiscoveryLoop as any)
  .then(generateOverviewsStep as any)
  .then(writeResultsStep as any)
  .commit();
