import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { GoogleGenAI } from "@google/genai";

function getGeminiClient() {
  return new GoogleGenAI({
    apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY!,
    httpOptions: {
      apiVersion: "",
      baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL!,
    },
  });
}

export const discoverCompaniesTool = createTool({
  id: "discover-companies",
  description:
    "Uses Gemini AI to discover biotechnology, pharmaceutical, and CRO companies located in the San Francisco to Mountain View territory that are not in the provided exclusion list.",

  inputSchema: z.object({
    excludedNames: z.array(z.string()),
    batchNumber: z.number(),
  }),

  outputSchema: z.object({
    discoveredCompanies: z.array(
      z.object({
        name: z.string(),
        website: z.string(),
        address: z.string(),
      }),
    ),
    rawResponse: z.string(),
  }),

  execute: async (inputData, context) => {
    const logger = context?.mastra?.getLogger();
    logger?.info(
      `🔎 [discoverCompanies] Batch ${inputData.batchNumber}: Searching for companies (excluding ${inputData.excludedNames.length} known companies)`,
    );

    const excludedList = inputData.excludedNames.slice(-200).join(", ");

    const prompt = `You are a biotechnology industry research assistant. Find exactly 5 biotechnology, pharmaceutical, or CRO (Contract Research Organization) companies located in the San Francisco Bay Area between San Francisco and Mountain View, California.

IMPORTANT RULES:
- Each company MUST be a real, currently operating company
- Each company MUST be physically located in the territory: San Francisco, South San Francisco, Daly City, Brisbane, San Bruno, Millbrae, Burlingame, San Mateo, Foster City, Belmont, San Carlos, Redwood City, Menlo Park, Palo Alto, Mountain View, or surrounding cities
- Do NOT include any of these companies (they are already known): ${excludedList}
- Focus on discovering lesser-known companies, startups, and mid-size firms
- For batch ${inputData.batchNumber}, try to find companies that are less well-known

Return ONLY a JSON array with exactly 5 objects. Each object must have:
- "name": the company's official name
- "website": the company's website URL (must start with https://)
- "address": the company's physical address including city and state

Return ONLY the JSON array, no other text. Example format:
[{"name":"Example Biotech","website":"https://example.com","address":"123 Main St, South San Francisco, CA 94080"}]`;

    try {
      const ai = getGeminiClient();
      const result = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
      });

      const responseText = result.text || "";
      logger?.info(
        `🔎 [discoverCompanies] Batch ${inputData.batchNumber}: Got response from Gemini`,
      );

      let companies: { name: string; website: string; address: string }[] = [];

      try {
        const jsonMatch = responseText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          companies = parsed
            .filter(
              (c: any) =>
                c.name && typeof c.name === "string" && c.name.trim(),
            )
            .map((c: any) => ({
              name: c.name.trim(),
              website: (c.website || "").trim(),
              address: (c.address || "").trim(),
            }));
        }
      } catch (parseErr) {
        logger?.warn(
          `⚠️ [discoverCompanies] Batch ${inputData.batchNumber}: Failed to parse JSON response`,
        );
      }

      logger?.info(
        `🔎 [discoverCompanies] Batch ${inputData.batchNumber}: Discovered ${companies.length} companies`,
      );

      return {
        discoveredCompanies: companies,
        rawResponse: responseText,
      };
    } catch (err) {
      logger?.error(
        `❌ [discoverCompanies] Batch ${inputData.batchNumber}: Error: ${err instanceof Error ? err.message : String(err)}`,
      );
      return {
        discoveredCompanies: [],
        rawResponse: `Error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  },
});
