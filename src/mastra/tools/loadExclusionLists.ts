import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { loadSheet, createSpreadsheet } from "./googleSheets";
import {
  DEFAULT_SPREADSHEET_ID,
  SHEET_TAB_ALIASES,
  SHEET_TABS,
} from "./sheetConfig";

export const loadExclusionListsTool = createTool({
  id: "load-exclusion-lists",
  description:
    "Loads the ignored and existing company tabs from the configured Google Sheet. Creates a new spreadsheet if none is configured.",

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

    let spreadsheetId = process.env.GOOGLE_SHEET_ID || DEFAULT_SPREADSHEET_ID;

    if (!spreadsheetId?.trim()) {
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

    const loadFirstAvailableTab = async (
      aliases: readonly string[],
      kind: string,
    ): Promise<string[][]> => {
      for (const tabName of aliases) {
        try {
          const rows = await loadSheet(spreadsheetId, tabName);
          logger?.info(
            `📋 [loadExclusionLists] Loaded ${rows.length} rows from ${tabName} for ${kind}`,
          );
          return rows;
        } catch {
          logger?.info(
            `📋 [loadExclusionLists] Tab ${tabName} unavailable for ${kind}, trying next alias`,
          );
        }
      }

      logger?.warn(
        `📋 [loadExclusionLists] No available tab found for ${kind}, using empty list`,
      );
      return [];
    };

    const excludedRows = await loadFirstAvailableTab(
      SHEET_TAB_ALIASES.ignoredCompanies,
      SHEET_TABS.ignoredCompanies,
    );

    const startingRows = await loadFirstAvailableTab(
      SHEET_TAB_ALIASES.existingCompanies,
      SHEET_TABS.existingCompanies,
    );

    const parseRows = (rows: string[][]) => {
      const firstCell = rows[0][0]?.toLowerCase() ?? "";
      const hasHeader =
        rows.length > 0 &&
        (firstCell.includes("company") || firstCell === "name") &&
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
