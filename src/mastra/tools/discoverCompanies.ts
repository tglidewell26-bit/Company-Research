import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
  DEFAULT_PERPLEXITY_MODEL,
  hasPerplexityConfig,
  perplexityChat,
} from "./aiClients";

function parseCompaniesFromText(text: string): {
  name: string;
  website: string;
  address: string;
}[] {
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    return [];
  }

  const parsed = JSON.parse(jsonMatch[0]);
  return parsed
    .filter((c: any) => c.name && typeof c.name === "string" && c.name.trim())
    .map((c: any) => ({
      name: c.name.trim(),
      website: (c.website || "").trim(),
      address: (c.address || "").trim(),
    }));
}

function dedupeByNameAndWebsite(
  companies: { name: string; website: string; address: string }[],
): { name: string; website: string; address: string }[] {
  const seen = new Set<string>();
  const output: { name: string; website: string; address: string }[] = [];

  for (const company of companies) {
    const key = `${company.name.toLowerCase()}|${company.website.toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(company);
  }

  return output;
}

export const discoverCompaniesTool = createTool({
  id: "discover-companies",
  description:
    "Uses Perplexity AI to discover biotechnology, pharmaceutical, and CRO companies in the SF to Mountain View territory that are not in the exclusion list.",

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
      `🔎 [discoverCompanies] Batch ${inputData.batchNumber}: Searching with Perplexity model ${DEFAULT_PERPLEXITY_MODEL} (excluding ${inputData.excludedNames.length} known companies)`,
    );

    if (!hasPerplexityConfig()) {
      throw new Error(
        "PERPLEXITY_API_KEY is required for discovery. Add your real key to environment settings.",
      );
    }

    const excludedList = inputData.excludedNames.slice(-300).join(", ");

    const prompt = `You are a biotechnology industry research assistant. Find exactly 5 biotechnology, pharmaceutical, or CRO (Contract Research Organization) companies located in the San Francisco Bay Area between San Francisco and Mountain View, California.

IMPORTANT RULES:
- Each company MUST be a real, currently operating company
- Each company MUST be physically located in: San Francisco, South San Francisco, Daly City, Brisbane, San Bruno, Millbrae, Burlingame, San Mateo, Foster City, Belmont, San Carlos, Redwood City, Menlo Park, Palo Alto, Mountain View, or nearby cities in that corridor
- Do NOT include any of these companies (already known): ${excludedList}
- Focus on discovering lesser-known companies, startups, and mid-size firms

Return ONLY valid JSON array with exactly 5 objects and keys:
- "name"
- "website" (must start with https://)
- "address" (must include city and state)

No markdown. No commentary. JSON only.`;

    const responseText = await perplexityChat(prompt);
    const parsed = parseCompaniesFromText(responseText);
    const unique = dedupeByNameAndWebsite(parsed).slice(0, 5);

    logger?.info(
      `🔎 [discoverCompanies] Batch ${inputData.batchNumber}: Perplexity parsed=${parsed.length}, unique=${unique.length}`,
    );

    return {
      discoveredCompanies: unique,
      rawResponse: responseText,
    };
  },
});
