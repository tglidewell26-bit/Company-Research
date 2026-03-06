import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { writeSheet } from "./googleSheets";

export const writeProspectsTool = createTool({
  id: "write-prospects-to-sheet",
  description:
    "Writes the qualified companies with overviews to the prospectDiscovery tab in the Google Sheet.",

  inputSchema: z.object({
    spreadsheetId: z.string(),
    companies: z.array(
      z.object({
        name: z.string(),
        website: z.string(),
        overview: z.string(),
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
      "Discovered by Territory Intelligence Automation",
    ]);

    const data = [header, ...rows];

    await writeSheet(inputData.spreadsheetId, "prospectDiscovery", data);

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
