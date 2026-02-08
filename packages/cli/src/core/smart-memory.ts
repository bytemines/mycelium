/**
 * Smart Memory Module
 * Compresses, deduplicates, and intelligently syncs memory across tools
 */

import type { CompressOptions } from "@mycelium/core";

const KEY_INSIGHT_PATTERN = /^[-*]\s*(Bug|Fix|Pattern|Important|Note|Key|Critical|Rule|Lesson|Remember):/i;

/**
 * Compress memory content to fit within line limits.
 * Prioritizes: headers > key insights > recent content > verbose details
 */
export function compressMemory(content: string, options: CompressOptions): string {
  const { maxLines, preserveHeaders = true } = options;
  const lines = content.split("\n");

  if (lines.length <= maxLines) return content;

  const headers: string[] = [];
  const keyInsights: string[] = [];
  const other: string[] = [];

  for (const line of lines) {
    if (line.startsWith("#")) {
      headers.push(line);
    } else if (KEY_INSIGHT_PATTERN.test(line)) {
      keyInsights.push(line);
    } else {
      other.push(line);
    }
  }

  const result: string[] = [];
  if (preserveHeaders) result.push(...headers);
  result.push(...keyInsights);

  const remaining = maxLines - result.length;
  if (remaining > 0) {
    result.push(...other.slice(-remaining));
  }

  return result.slice(0, maxLines).join("\n");
}

/**
 * Extract key insights from session content
 */
export function extractKeyInsights(content: string): string {
  const lines = content.split("\n");
  const insights = lines.filter(line =>
    KEY_INSIGHT_PATTERN.test(line) ||
    line.match(/^[-*]\s*.*(always|never|important|critical|remember|note:)/i)
  );
  return insights.join("\n");
}

/**
 * Merge multiple memory files with deduplication
 */
export function mergeMemoryFiles(
  files: Array<{ scope: string; content: string }>
): string {
  const seen = new Set<string>();
  const sections: string[] = [];

  for (const file of files) {
    const lines = file.content.split("\n");
    const uniqueLines: string[] = [];

    for (const line of lines) {
      const normalized = line.trim().toLowerCase();
      if (normalized === "" || normalized.startsWith("#")) {
        uniqueLines.push(line);
        continue;
      }
      if (!seen.has(normalized)) {
        seen.add(normalized);
        uniqueLines.push(line);
      }
    }

    sections.push(`<!-- SCOPE: ${file.scope} -->\n${uniqueLines.join("\n")}`);
  }

  return sections.join("\n\n");
}
