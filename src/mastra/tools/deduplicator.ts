import { createTool } from "@mastra/core/tools";
import { z } from "zod";

function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\b(inc|llc|ltd|corp|corporation|company|co|pharmaceuticals|pharma|therapeutics|biosciences|biotech|biotechnology)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1,
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

function similarityRatio(a: string, b: string): number {
  const normA = normalizeCompanyName(a);
  const normB = normalizeCompanyName(b);

  if (normA === normB) return 100;
  if (normA.length === 0 || normB.length === 0) return 0;

  const distance = levenshteinDistance(normA, normB);
  const maxLen = Math.max(normA.length, normB.length);
  return ((maxLen - distance) / maxLen) * 100;
}

export function isDuplicate(a: string, b: string, threshold = 92): boolean {
  return similarityRatio(a, b) >= threshold;
}

export function deduplicateList(
  newCompanies: { name: string; website: string }[],
  existingCompanies: { name: string; website: string }[],
  threshold = 92,
): {
  unique: { name: string; website: string }[];
  duplicates: { name: string; matchedWith: string }[];
} {
  const unique: { name: string; website: string }[] = [];
  const duplicates: { name: string; matchedWith: string }[] = [];

  for (const newCo of newCompanies) {
    let isDup = false;

    for (const existing of existingCompanies) {
      if (similarityRatio(newCo.name, existing.name) >= threshold) {
        duplicates.push({ name: newCo.name, matchedWith: existing.name });
        isDup = true;
        break;
      }
    }

    if (!isDup) {
      for (const accepted of unique) {
        if (similarityRatio(newCo.name, accepted.name) >= threshold) {
          duplicates.push({ name: newCo.name, matchedWith: accepted.name });
          isDup = true;
          break;
        }
      }
    }

    if (!isDup) {
      unique.push(newCo);
    }
  }

  return { unique, duplicates };
}

export const deduplicateCompaniesTool = createTool({
  id: "deduplicate-companies",
  description:
    "Deduplicates a list of newly discovered companies against an existing list using fuzzy name matching with a 92% similarity threshold.",

  inputSchema: z.object({
    newCompanies: z.array(
      z.object({ name: z.string(), website: z.string() }),
    ),
    existingCompanies: z.array(
      z.object({ name: z.string(), website: z.string() }),
    ),
  }),

  outputSchema: z.object({
    uniqueCompanies: z.array(
      z.object({ name: z.string(), website: z.string() }),
    ),
    duplicatesRemoved: z.number(),
    duplicateDetails: z.array(
      z.object({ name: z.string(), matchedWith: z.string() }),
    ),
  }),

  execute: async (inputData, context) => {
    const logger = context?.mastra?.getLogger();
    logger?.info(
      `🔄 [deduplicator] Deduplicating ${inputData.newCompanies.length} new companies against ${inputData.existingCompanies.length} existing`,
    );

    const { unique, duplicates } = deduplicateList(
      inputData.newCompanies,
      inputData.existingCompanies,
    );

    logger?.info(
      `🔄 [deduplicator] Result: ${unique.length} unique, ${duplicates.length} duplicates removed`,
    );

    for (const dup of duplicates) {
      logger?.info(
        `🔄 [deduplicator] Duplicate: "${dup.name}" matched with "${dup.matchedWith}"`,
      );
    }

    return {
      uniqueCompanies: unique,
      duplicatesRemoved: duplicates.length,
      duplicateDetails: duplicates,
    };
  },
});
