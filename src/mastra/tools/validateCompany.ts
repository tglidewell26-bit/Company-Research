import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { hasPerplexityConfig, perplexityChat } from "./aiClients";

async function companyExistsByPerplexity(
  name: string,
  website: string,
): Promise<boolean> {
  const prompt = `Determine if this life sciences company appears to currently exist and operate.
Company name: ${name}
Website: ${website || "unknown"}

Return ONLY JSON like {"exists": true} or {"exists": false}.`;

  const text = await perplexityChat(prompt);
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return false;
  }

  const parsed = JSON.parse(jsonMatch[0]);
  return Boolean(parsed?.exists);
}

export const validateCompanyWebsiteTool = createTool({
  id: "validate-company-website",
  description:
    "Validates whether a company website is alive by performing an HTTP check.",

  inputSchema: z.object({
    companies: z.array(
      z.object({
        name: z.string(),
        website: z.string(),
      }),
    ),
  }),

  outputSchema: z.object({
    validCompanies: z.array(
      z.object({
        name: z.string(),
        website: z.string(),
        websiteAlive: z.boolean(),
        companyExists: z.boolean(),
      }),
    ),
    invalidCount: z.number(),
  }),

  execute: async (inputData, context) => {
    const logger = context?.mastra?.getLogger();
    logger?.info(
      `🔍 [validateCompanyWebsite] Validating ${inputData.companies.length} companies`,
    );

    const results = [];
    let invalidCount = 0;
    const usePerplexity = hasPerplexityConfig();

    if (!usePerplexity) {
      throw new Error(
        "PERPLEXITY_API_KEY is required for company existence validation. Set your real key in environment settings.",
      );
    }

    for (const company of inputData.companies) {
      let websiteAlive = false;
      let companyExists = true;
      let url = company.website;

      if (url && !url.startsWith("http")) {
        url = "https://" + url;
      }

      if (url) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 8000);
          const response = await fetch(url, {
            method: "HEAD",
            signal: controller.signal,
            redirect: "follow",
          });
          clearTimeout(timeout);
          websiteAlive = response.status < 400;
        } catch {
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 8000);
            const response = await fetch(url, {
              method: "GET",
              signal: controller.signal,
              redirect: "follow",
            });
            clearTimeout(timeout);
            websiteAlive = response.status < 400;
          } catch {
            websiteAlive = false;
          }
        }
      }

      try {
        companyExists = await companyExistsByPerplexity(
          company.name,
          url || "",
        );
      } catch (err) {
        logger?.warn(
          `⚠️ [validateCompanyWebsite] ${company.name} - Perplexity validation failed, defaulting to false: ${err instanceof Error ? err.message : String(err)}`,
        );
        companyExists = false;
      }

      if (!websiteAlive || !companyExists) {
        invalidCount++;
        logger?.info(
          `❌ [validateCompanyWebsite] ${company.name} - invalid (websiteAlive=${websiteAlive}, companyExists=${companyExists})`,
        );
      } else {
        logger?.info(
          `✅ [validateCompanyWebsite] ${company.name} - valid (websiteAlive=${websiteAlive}, companyExists=${companyExists})`,
        );
      }

      results.push({
        name: company.name,
        website: company.website,
        websiteAlive,
        companyExists,
      });
    }

    logger?.info(
      `🔍 [validateCompanyWebsite] Validation complete: ${results.length - invalidCount} valid, ${invalidCount} invalid`,
    );

    return {
      validCompanies: results,
      invalidCount,
    };
  },
});
