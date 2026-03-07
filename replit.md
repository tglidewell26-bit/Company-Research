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
1b. **Deduplicate Starting List** - Removes companies matching the ignored list, then self-deduplicates using fuzzy name matching (92% threshold) to reduce the list before expensive website checks
2. **Validate Starting List** - Checks websites and territory for starting list companies
3. **Discovery Loop** - Up to 20 iterations by default (configurable via `MAX_DISCOVERY_ITERATIONS`) of AI discovery → dedup → geocode validation
4. **Generate Overviews** - Batch ChatGPT calls for 5-sentence overviews + fit rationale
5. **Write Results** - Writes companies with overviews to Results tab and appends run metrics to Run Log

## Configuration

- **Trigger**: Manual via Playground "Test Automation" button (cron registered for button support, defaults to Monday 8AM Pacific)
- **Territory Bounding Box**: lat 37.35-37.81, lon -122.55 to -121.85
- **Max Iterations**: 20 by default (override with `MAX_DISCOVERY_ITERATIONS`)
- **Overview Batch Size**: 10 companies per ChatGPT call
- **Geocoder Delay**: 600ms between requests (Nominatim rate limit)
- **Fuzzy Match Threshold**: 92%

## Environment Variables

- `GOOGLE_SHEET_ID` - Optional; defaults to `1khSAu8FDWpAXbXZBUVxu2JLFh6zlE9TOyrfU8ahnSvI`
- `MAX_DISCOVERY_ITERATIONS` - Optional; defaults to `20`
- `PERPLEXITY_API_KEY` / `PERPLEXITY_MODEL` - Required for discovery and existence checks (`sonar-pro` default)
- `OPENAI_API_KEY` / `OPENAI_MODEL` - Required for fit logic and overview generation (`gpt-5.4` default)

## Important Notes

- Discovery and validation require Perplexity credentials; overview + fit logic require OpenAI credentials.
- `OPENAI_MODEL` defaults to `gpt-5.4` and `PERPLEXITY_MODEL` defaults to `sonar-pro` if not set.
- Workflow is manual-trigger only; run from the Playground tab or via API call
- Inngest dev server has ~2 min step timeout; steps are designed to complete within this limit
- In production (Inngest Cloud), step timeouts are much higher
