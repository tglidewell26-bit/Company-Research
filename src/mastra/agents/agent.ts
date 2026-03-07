import { Agent } from "@mastra/core/agent";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { discoverCompaniesTool } from "../tools/discoverCompanies";
import { generateOverviewTool } from "../tools/overviewGenerator";
import { loadExclusionListsTool } from "../tools/loadExclusionLists";
import { validateCompanyWebsiteTool } from "../tools/validateCompany";
import { geocodeAndValidateTerritoryTool } from "../tools/geocoder";
import { deduplicateCompaniesTool } from "../tools/deduplicator";
import { writeProspectsTool } from "../tools/writeProspects";

const google = createGoogleGenerativeAI({
  baseURL: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
});

export const territoryIntelligenceAgent = new Agent({
  name: "Territory Intelligence Agent",
  id: "territoryIntelligenceAgent",

  instructions: `You are a Territory Intelligence Agent specialized in discovering and qualifying biotechnology, pharmaceutical, and CRO companies in the San Francisco to Mountain View, California territory.

Your primary responsibilities:
1. Load exclusion lists from Google Sheets to know which companies are already tracked
2. Discover new biotech companies in the territory using AI-powered search
3. Validate discovered companies (website checks, territory verification)
4. Remove duplicate entries using fuzzy name matching
5. Generate professional company overviews
6. Write qualified prospects to the Google Sheet

Territory boundaries:
- Geographic area: San Francisco to Mountain View, CA
- Includes: San Francisco, South San Francisco, Daly City, Brisbane, San Bruno, Millbrae, Burlingame, San Mateo, Foster City, Belmont, San Carlos, Redwood City, Menlo Park, Palo Alto, Mountain View
- Bounding box: lat 37.371991094843196-37.80937112865491, lon -122.50734140121014 to -122.00197621196642

When discovering companies:
- Focus on real, currently operating companies
- Include startups, mid-size firms, and established companies
- Cover biotech, pharma, CRO, and related life sciences
- Avoid companies already in the exclusion list

Always be thorough, accurate, and professional in your analysis.`,

  model: google("gemini-2.0-flash"),

  tools: {
    discoverCompaniesTool,
    generateOverviewTool,
    loadExclusionListsTool,
    validateCompanyWebsiteTool,
    geocodeAndValidateTerritoryTool,
    deduplicateCompaniesTool,
    writeProspectsTool,
  },
});
