import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { writeSheet } from "./googleSheets";

function getDateStampedTabName(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  return `Results ${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

export const writeProspectsTool = createTool({
  id: "write-prospects-to-sheet",
  description:
    "Writes qualified companies with ChatGPT-generated overviews and fit rationale to a new date-stamped Results tab in the original spreadsheet.",

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
    const tabName = getDateStampedTabName();
    logger?.info(
      `📊 [writeProspects] Writing ${inputData.companies.length} companies to tab "${tabName}"`,
    );

    const header = ["Company Name", "Company Website", "Overview", "Notes"];
    const rows = inputData.companies.map((company) => [
      company.name,
      company.website,
      company.overview,
      `[${company.fitStatus}] ${company.fitRationale}`,
    ]);

    const data = [header, ...rows];

    await writeSheet(inputData.spreadsheetId, tabName, data);

    const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${inputData.spreadsheetId}`;

    logger?.info(
      `✅ [writeProspects] Successfully wrote ${rows.length} companies to tab "${tabName}"`,
    );
    logger?.info(`📊 [writeProspects] Sheet URL: ${spreadsheetUrl}`);

    return {
      rowsWritten: rows.length,
      spreadsheetUrl,
    };
  },
});
