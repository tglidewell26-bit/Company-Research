export const DEFAULT_SPREADSHEET_ID =
  "1khSAu8FDWpAXbXZBUVxu2JLFh6zlE9TOyrfU8ahnSvI";

export const SHEET_TABS = {
  ignoredCompanies: "Ignored Companies",
  existingCompanies: "Existing Companies",
  results: "Results",
  runLog: "Run Log",
} as const;

export const SHEET_TAB_ALIASES = {
  ignoredCompanies: [SHEET_TABS.ignoredCompanies, "excludedCompanies"],
  existingCompanies: [SHEET_TABS.existingCompanies, "startingList"],
  results: [SHEET_TABS.results, "prospectDiscovery"],
} as const;
