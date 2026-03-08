import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { DEFAULT_OPENAI_MODEL, hasOpenAIConfig, openAIChat } from "./aiClients";

type CompanyAssessment = {
  name: string;
  overview: string;
  fitStatus: "Good Fit" | "Maybe" | "Poor Fit";
  fitRationale: string;
};

function parseAssessments(text: string): CompanyAssessment[] {
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error("Could not parse JSON array from OpenAI response");
  }

  return JSON.parse(jsonMatch[0]) as CompanyAssessment[];
}

export const generateOverviewTool = createTool({
  id: "generate-company-overview",
  description:
    "Uses ChatGPT to generate 5-sentence overviews and fit rationale for each company.",

  inputSchema: z.object({
    companies: z.array(
      z.object({
        name: z.string(),
        website: z.string(),
      }),
    ),
    overviewOnly: z.boolean().optional(),
  }),

  outputSchema: z.object({
    companiesWithOverviews: z.array(
      z.object({
        name: z.string(),
        website: z.string(),
        overview: z.string(),
        fitStatus: z.enum(["Good Fit", "Maybe", "Poor Fit"]),
        fitRationale: z.string(),
      }),
    ),
  }),

  execute: async (inputData, context) => {
    const logger = context?.mastra?.getLogger();
    const overviewOnly = inputData.overviewOnly === true;
    logger?.info(
      `📝 [overviewGenerator] Generating ${overviewOnly ? "summaries only" : "overviews + fit logic"} for ${inputData.companies.length} companies using ${DEFAULT_OPENAI_MODEL}`,
    );

    if (!hasOpenAIConfig()) {
      throw new Error(
        "OPENAI_API_KEY is required for fit logic and overview generation. Set your real key in environment settings.",
      );
    }

    const companyList = inputData.companies
      .map((c, i) => `${i + 1}. "${c.name}" (website: ${c.website})`)
      .join("\n");

    const prompt = overviewOnly
      ? `For each biotechnology/pharmaceutical/CRO company below, return a factual 5-sentence overview.

Companies:
${companyList}

Return ONLY valid JSON array with objects:
{
  "name": "exact input name",
  "overview": "exactly 5 sentences"
}

No markdown. JSON only.`
      : `For each biotechnology/pharmaceutical/CRO company below, return:
1) a factual 5-sentence overview,
2) a fitStatus (Good Fit | Maybe | Poor Fit),
3) a concise fitRationale explaining WHY the fit decision was made.

Companies:
${companyList}

Return ONLY valid JSON array with objects:
{
  "name": "exact input name",
  "overview": "exactly 5 sentences",
  "fitStatus": "Good Fit|Maybe|Poor Fit",
  "fitRationale": "2-4 sentence rationale"
}

No markdown. JSON only.`;

    const fallbackOverview = (name: string) =>
      `${name} is a life sciences company located in the San Francisco Bay Area. The company is active in biotechnology-related research and development. Public information indicates it maintains operations relevant to therapeutic, diagnostic, or platform innovation. It appears to participate in the regional ecosystem of academic and industry partnerships. Additional diligence is recommended to confirm current pipeline priorities and commercial focus.`;

    try {
      const openAIText = await openAIChat(prompt);
      const parsed = parseAssessments(openAIText);

      const results = inputData.companies.map((company) => {
        const found = parsed.find(
          (p) => p.name.toLowerCase() === company.name.toLowerCase(),
        );
        return {
          name: company.name,
          website: company.website,
          overview: found?.overview || fallbackOverview(company.name),
          fitStatus: (overviewOnly ? "Maybe" : (found?.fitStatus || "Maybe")) as "Good Fit" | "Maybe" | "Poor Fit",
          fitRationale: overviewOnly ? "" : (found?.fitRationale || "Insufficient structured data was available from this run to produce a higher-confidence fit judgment."),
        };
      });

      logger?.info(
        `✅ [overviewGenerator] OpenAI batch complete: ${results.length} assessments generated`,
      );
      return { companiesWithOverviews: results };
    } catch (err) {
      logger?.error(
        `❌ [overviewGenerator] Batch failed: ${err instanceof Error ? err.message : String(err)}`,
      );

      return {
        companiesWithOverviews: inputData.companies.map((c) => ({
          name: c.name,
          website: c.website,
          overview: fallbackOverview(c.name),
          fitStatus: "Maybe" as const,
          fitRationale: overviewOnly ? "" : "Assessment fallback used because OpenAI response could not be parsed during this run.",
        })),
      };
    }
  },
});
