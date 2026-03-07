import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { writeSheet } from "./googleSheets";
import { SHEET_TAB_ALIASES, SHEET_TABS } from "./sheetConfig";

export const writeProspectsTool = createTool({
  id: "write-prospects-to-sheet",
  description:
    "Writes qualified companies with ChatGPT-generated overviews and fit rationale to Results and legacy prospectDiscovery tabs.",

  inputSchema: z.object({
    spreadsheetId: z.string(),
    companies: z.array(
      z.object({
        name: z.string(),
        website: z.string(),
        overview: z.string(),
        fitStatus: z.enum(["Good Fit", "Maybe", "Poor Fit"]),
        fitRationale: z.string(),
      }),
    ),
  }),

  outputSchema: z.object({
    rowsWritten: z.number(),
    spreadsheetUrl: z.string(),
  }),

  execute: async (inputData, context) => {
    const logger = context?.mastra?.getLogger();
    logger?.info(
      `📊 [writeProspects] Writing ${inputData.companies.length} companies to Google Sheet`,
    );

    const header = ["Company Name", "Company Website", "Overview", "Notes"];
    const rows = inputData.companies.map((company) => [
      company.name,
      company.website,
      company.overview,
      `[${company.fitStatus}] ${company.fitRationale}`,
    ]);

    const data = [header, ...rows];

    await writeSheet(inputData.spreadsheetId, SHEET_TABS.results, data);

    for (const aliasTab of SHEET_TAB_ALIASES.results) {
      if (aliasTab !== SHEET_TABS.results) {
        await writeSheet(inputData.spreadsheetId, aliasTab, data);
        logger?.info(
          `📊 [writeProspects] Mirrored output to legacy tab: ${aliasTab}`,
        );
      }
    }

    const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${inputData.spreadsheetId}`;

    logger?.info(
      `✅ [writeProspects] Successfully wrote ${rows.length} companies to sheet`,
    );
    logger?.info(`📊 [writeProspects] Sheet URL: ${spreadsheetUrl}`);

    return {
      rowsWritten: rows.length,
      spreadsheetUrl,
    };
  },
});
