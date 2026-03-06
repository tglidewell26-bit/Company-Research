import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { loadSheet, createSpreadsheet } from "./googleSheets";

export const loadExclusionListsTool = createTool({
  id: "load-exclusion-lists",
  description:
    "Loads the excludedCompanies and startingList tabs from the configured Google Sheet. Creates a new spreadsheet if none is configured.",

  inputSchema: z.object({}),

  outputSchema: z.object({
    spreadsheetId: z.string(),
    excludedCompanies: z.array(
      z.object({
        name: z.string(),
        website: z.string(),
      }),
    ),
    startingList: z.array(
      z.object({
        name: z.string(),
        website: z.string(),
      }),
    ),
  }),

  execute: async (_inputData, context) => {
    const logger = context?.mastra?.getLogger();
    logger?.info("📋 [loadExclusionLists] Starting to load exclusion data");

    let spreadsheetId = process.env.GOOGLE_SHEET_ID;

    if (!spreadsheetId) {
      logger?.info(
        "📋 [loadExclusionLists] No GOOGLE_SHEET_ID set, creating new spreadsheet",
      );
      spreadsheetId = await createSpreadsheet(
        "Territory Intelligence - Biotech Prospecting",
      );
      logger?.info(
        `📋 [loadExclusionLists] Created spreadsheet: ${spreadsheetId}`,
      );
    }

    let excludedRows: string[][] = [];
    try {
      excludedRows = await loadSheet(spreadsheetId, "excludedCompanies");
      logger?.info(
        `📋 [loadExclusionLists] Loaded ${excludedRows.length} rows from excludedCompanies`,
      );
    } catch (err) {
      logger?.warn(
        "📋 [loadExclusionLists] Could not load excludedCompanies tab, using empty list",
      );
    }

    let startingRows: string[][] = [];
    try {
      startingRows = await loadSheet(spreadsheetId, "startingList");
      logger?.info(
        `📋 [loadExclusionLists] Loaded ${startingRows.length} rows from startingList`,
      );
    } catch (err) {
      logger?.warn(
        "📋 [loadExclusionLists] Could not load startingList tab, using empty list",
      );
    }

    const parseRows = (rows: string[][]) => {
      const hasHeader =
        rows.length > 0 &&
        rows[0][0]?.toLowerCase().includes("company") &&
        rows[0].length >= 2;
      const dataRows = hasHeader ? rows.slice(1) : rows;
      return dataRows
        .filter((row) => row[0]?.trim())
        .map((row) => ({
          name: row[0]?.trim() || "",
          website: row[1]?.trim() || "",
        }));
    };

    const excludedCompanies = parseRows(excludedRows);
    const startingList = parseRows(startingRows);

    logger?.info(
      `📋 [loadExclusionLists] Parsed ${excludedCompanies.length} excluded companies and ${startingList.length} starting list companies`,
    );

    return { spreadsheetId, excludedCompanies, startingList };
  },
});
