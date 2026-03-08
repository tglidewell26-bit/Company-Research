# Territory Intelligence Automation

## Overview

A Mastra-based automation that discovers, validates, and qualifies biotech, pharmaceutical, and CRO companies in the San Francisco to Mountain View, CA territory. Results are written to a Google Sheet.

## Architecture

- **Framework**: Mastra 1.0 with Inngest for workflow orchestration
- **AI**: Perplexity-first discovery/validation with OpenAI (ChatGPT) for fit logic and overview generation
- **Data**: Google Sheets (via googleapis + Replit Google Sheets connector)
- **Geocoding**: OpenStreetMap Nominatim (free, no API key)

## Key Files

- `src/mastra/index.ts` - Main Mastra instance, registers agent + workflow + cron trigger
- `src/mastra/agents/agent.ts` - Territory intelligence agent (Gemini 2.0 Flash)
- `src/mastra/workflows/workflow.ts` - 5-step discovery workflow
- `src/mastra/tools/` - All automation tools:
  - `googleSheets.ts` - Google Sheets OAuth client
  - `loadExclusionLists.ts` - Load exclusion/starting lists from Sheet
  - `discoverCompanies.ts` - AI-powered company discovery (Perplexity)
  - `validateCompany.ts` - Website availability checker
  - `geocoder.ts` - Nominatim geocoding with territory bounding box validation
  - `deduplicator.ts` - Fuzzy matching deduplication (92% threshold)
  - `overviewGenerator.ts` - Batch ChatGPT overview + fit rationale generation
  - `writeProspects.ts` - Write results to Results tab
- `src/mastra/inngest/` - Inngest client and workflow registration
- `tests/testCronAutomation.ts` - Manual trigger for testing

## Workflow Pipeline

1. **Load Exclusion Data** - Reads Ignored Companies and Existing Companies from Google Sheets (with legacy tab aliases)
2. **Use Existing List** - Treats Existing Companies as already validated and in territory; adds directly to dontSearch
3. **Discovery Loop** - Up to 10 iterations by default (configurable via `MAX_DISCOVERY_ITERATIONS`) of AI discovery (5 companies per Perplexity call) → dedup → geocode validation
4. **Generate Overviews** - ChatGPT calls in batches of 5 companies for 5-sentence overviews + fit rationale
5. **Write Results** - Writes companies with overviews to a new date-stamped tab (e.g., "Results 2026-03-07 08:00") and appends run metrics to Run Log

## Configuration

- **Cron**: `0 15 * * 1` (Monday 3PM UTC / 8AM Pacific)
- **Territory Bounding Box**: lat 37.371991094843196-37.80937112865491, lon -122.50734140121014 to -122.00197621196642
- **Max Iterations**: 10 by default (override with `MAX_DISCOVERY_ITERATIONS`)
- **Overview Batch Size**: 5 companies per ChatGPT call
- **Geocoder Delay**: 600ms between requests (Nominatim rate limit)
- **Fuzzy Match Threshold**: 92%
- **Global Timeout**: 1 hour failsafe — workflow throws error and stops if exceeded

## Environment Variables

- `GOOGLE_SHEET_ID` - Set to `1qSkNpGmIdXRiU9gLafMYxgaBWBv4DanVc5dU6xZaseQ`
- `MAX_DISCOVERY_ITERATIONS` - Optional; defaults to `10`
- `PERPLEXITY_API_KEY` / `PERPLEXITY_MODEL` - Required for discovery (`sonar-pro` default)
- `OPENAI_API_KEY` / `OPENAI_MODEL` - Required for fit logic and overview generation (`gpt-5.4` default)
- `SCHEDULE_CRON_EXPRESSION` - Optional; overrides default cron schedule

## Important Notes

- Discovery requires Perplexity credentials; overview + fit logic require OpenAI credentials.
- Existing Companies are treated as pre-validated and are not re-checked for website/geocode before discovery.
- `OPENAI_MODEL` defaults to `gpt-5.4` and `PERPLEXITY_MODEL` defaults to `sonar-pro` if not set.
- Inngest dev server has ~2 min step timeout; steps are designed to complete within this limit
- In production (Inngest Cloud), step timeouts are much higher
- Production run script (`scripts/run.sh`) allocates 4 GB heap memory via `NODE_OPTIONS`
- 1-hour global failsafe timeout: start time is passed through all workflow steps; if any step exceeds 1 hour from workflow start, it throws and stops
