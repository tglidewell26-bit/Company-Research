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

export const generateOverviewTool = createTool({
  id: "generate-company-overview",
  description:
    "Generates a 5-sentence company overview using Gemini AI for a qualified biotech company.",

  inputSchema: z.object({
    companies: z.array(
      z.object({
        name: z.string(),
        website: z.string(),
      }),
    ),
  }),

  outputSchema: z.object({
    companiesWithOverviews: z.array(
      z.object({
        name: z.string(),
        website: z.string(),
        overview: z.string(),
      }),
    ),
  }),

  execute: async (inputData, context) => {
    const logger = context?.mastra?.getLogger();
    logger?.info(
      `📝 [overviewGenerator] Generating overviews for ${inputData.companies.length} companies`,
    );

    const ai = getGeminiClient();

    const companyList = inputData.companies
      .map((c, i) => `${i + 1}. "${c.name}" (website: ${c.website})`)
      .join("\n");

    const prompt = `Generate a professional 5-sentence company overview for each of the following biotechnology, pharmaceutical, or CRO companies in the San Francisco Bay Area.

Companies:
${companyList}

For each company, the overview should cover:
1. What the company does (core business focus)
2. Their key technology or platform
3. Their therapeutic areas or research focus
4. Their location and any notable partnerships
5. Their significance in the biotech industry

Return ONLY a JSON array where each element has "name" (exact company name as provided) and "overview" (exactly 5 sentences in a single paragraph). Be factual and professional. Example format:
[{"name": "Company A", "overview": "Sentence 1. Sentence 2. Sentence 3. Sentence 4. Sentence 5."}]

Return valid JSON only, no markdown formatting.`;

    try {
      const result = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
      });

      const text = (result.text || "").trim();
      const jsonMatch = text.match(/\[[\s\S]*\]/);

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as Array<{
          name: string;
          overview: string;
        }>;

        const results = inputData.companies.map((company) => {
          const found = parsed.find(
            (p) => p.name.toLowerCase() === company.name.toLowerCase(),
          );
          return {
            name: company.name,
            website: company.website,
            overview:
              found?.overview ||
              `${company.name} is a life sciences company located in the San Francisco Bay Area.`,
          };
        });

        logger?.info(
          `✅ [overviewGenerator] Batch complete: ${results.length} overviews generated`,
        );
        return { companiesWithOverviews: results };
      }

      throw new Error("Could not parse JSON from Gemini response");
    } catch (err) {
      logger?.error(
        `❌ [overviewGenerator] Batch failed: ${err instanceof Error ? err.message : String(err)}`,
      );

      return {
        companiesWithOverviews: inputData.companies.map((c) => ({
          name: c.name,
          website: c.website,
          overview: `${c.name} is a life sciences company located in the San Francisco Bay Area.`,
        })),
      };
    }
  },
});
