# Territory Intelligence Automation

## Overview
A Mastra-based automation that discovers, validates, and qualifies biotech, pharmaceutical, and CRO companies in the San Francisco to Mountain View, CA territory. Results are written to a Google Sheet.

## Architecture
- **Framework**: Mastra 1.0 with Inngest for workflow orchestration
- **AI**: Gemini 2.5 Flash via Replit AI Integrations (@google/genai for tools, @ai-sdk/google for agent)
- **Data**: Google Sheets (via googleapis + Replit Google Sheets connector)
- **Geocoding**: OpenStreetMap Nominatim (free, no API key)

## Key Files
- `src/mastra/index.ts` - Main Mastra instance, registers agent + workflow + cron trigger
- `src/mastra/agents/agent.ts` - Territory intelligence agent (Gemini 2.0 Flash)
- `src/mastra/workflows/workflow.ts` - 5-step discovery workflow
- `src/mastra/tools/` - All automation tools:
  - `googleSheets.ts` - Google Sheets OAuth client
  - `loadExclusionLists.ts` - Load exclusion/starting lists from Sheet
  - `discoverCompanies.ts` - AI-powered company discovery (Gemini)
  - `validateCompany.ts` - Website availability checker
  - `geocoder.ts` - Nominatim geocoding with territory bounding box validation
  - `deduplicator.ts` - Fuzzy matching deduplication (92% threshold)
  - `overviewGenerator.ts` - Batch AI overview generation (Gemini)
  - `writeProspects.ts` - Write results to prospectDiscovery tab
- `src/mastra/inngest/` - Inngest client and workflow registration
- `tests/testCronAutomation.ts` - Manual trigger for testing

## Workflow Pipeline
1. **Load Exclusion Data** - Reads excludedCompanies and startingList from Google Sheets
2. **Validate Starting List** - Checks websites and territory for starting list companies
3. **Discovery Loop** - Up to 7 iterations of AI discovery → dedup → geocode validation
4. **Generate Overviews** - Batch Gemini calls for 5-sentence company overviews
5. **Write Results** - Writes companies with overviews to prospectDiscovery tab

## Configuration
- **Cron**: `0 15 * * 1` (Monday 3PM UTC / 8AM Pacific)
- **Territory Bounding Box**: lat 37.35-37.81, lon -122.55 to -121.85
- **Max Iterations**: 7 (to stay within Inngest step timeout)
- **Overview Batch Size**: 10 companies per Gemini call
- **Geocoder Delay**: 600ms between requests (Nominatim rate limit)
- **Fuzzy Match Threshold**: 92%

## Environment Variables
- `AI_INTEGRATIONS_GEMINI_BASE_URL` / `AI_INTEGRATIONS_GEMINI_API_KEY` - Replit AI Integrations
- `GOOGLE_SHEET_ID` - Optional; if not set, creates a new spreadsheet each run
- `SCHEDULE_CRON_EXPRESSION` - Optional; overrides default cron schedule

## Important Notes
- `@ai-sdk/google` v3 is incompatible with `ai@5.x` (spec v3 vs v5), so tools use `@google/genai` directly for Gemini calls
- The agent uses `@ai-sdk/google` with `createGoogleGenerativeAI` which works for `.generate()` calls
- Inngest dev server has ~2 min step timeout; steps are designed to complete within this limit
- In production (Inngest Cloud), step timeouts are much higher
