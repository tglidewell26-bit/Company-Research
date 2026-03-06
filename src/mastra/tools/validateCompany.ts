import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export const validateCompanyWebsiteTool = createTool({
  id: "validate-company-website",
  description:
    "Validates whether a company website is alive by performing an HTTP check. Returns true if the site responds with a status code below 400.",

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

    for (const company of inputData.companies) {
      let websiteAlive = false;
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

      if (!websiteAlive) {
        invalidCount++;
        logger?.info(
          `❌ [validateCompanyWebsite] ${company.name} - website unreachable: ${url}`,
        );
      } else {
        logger?.info(
          `✅ [validateCompanyWebsite] ${company.name} - website alive: ${url}`,
        );
      }

      results.push({
        name: company.name,
        website: company.website,
        websiteAlive,
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
