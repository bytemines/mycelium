/**
 * Marketplace deduplication — flatten and deduplicate results from multiple sources.
 * Groups by name (case-insensitive), keeps highest-priority source, merges best metadata.
 */
import type { MarketplaceEntry, MarketplaceSearchResult } from "@mycelish/core";
import { MARKETPLACE_SOURCES as MS } from "@mycelish/core";

/** Source priority — lower index = higher priority */
const SOURCE_PRIORITY: string[] = [
  MS.ANTHROPIC_SKILLS,
  MS.CLAUDE_PLUGINS,
  MS.MCP_REGISTRY,
  MS.OPENSKILLS,
  // Everything else (custom GitHub repos) falls after these
];

function sourcePriority(source: string): number {
  const idx = SOURCE_PRIORITY.indexOf(source);
  return idx >= 0 ? idx : SOURCE_PRIORITY.length;
}

/**
 * Flatten all MarketplaceSearchResult[] into a single deduplicated MarketplaceEntry[].
 * For duplicates (same name, case-insensitive):
 * - Keep entry from highest-priority source
 * - Merge best metadata: max stars, max downloads, latest version, best description
 */
export function deduplicateEntries(results: MarketplaceSearchResult[]): MarketplaceEntry[] {
  const allEntries = results.flatMap(r => r.entries);
  const groups = new Map<string, MarketplaceEntry[]>();

  for (const entry of allEntries) {
    const key = entry.name.toLowerCase();
    const group = groups.get(key);
    if (group) {
      group.push(entry);
    } else {
      groups.set(key, [entry]);
    }
  }

  const deduplicated: MarketplaceEntry[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      deduplicated.push(group[0]);
      continue;
    }
    // Sort by source priority (best first)
    group.sort((a, b) => sourcePriority(a.source) - sourcePriority(b.source));
    const best = { ...group[0] };

    // Merge best metadata from all duplicates
    for (const entry of group) {
      if (entry.stars != null && (best.stars == null || entry.stars > best.stars)) {
        best.stars = entry.stars;
      }
      if (entry.downloads != null && (best.downloads == null || entry.downloads > best.downloads)) {
        best.downloads = entry.downloads;
      }
      if (entry.latestVersion && !best.latestVersion) {
        best.latestVersion = entry.latestVersion;
      }
      if (entry.version && !best.version) {
        best.version = entry.version;
      }
      if (entry.description && entry.description.length > (best.description?.length ?? 0)) {
        best.description = entry.description;
      }
      if (entry.author && !best.author) {
        best.author = entry.author;
      }
      if (entry.url && !best.url) {
        best.url = entry.url;
      }
      if (entry.installed) {
        best.installed = true;
      }
      if (entry.installedVersion && !best.installedVersion) {
        best.installedVersion = entry.installedVersion;
      }
    }

    deduplicated.push(best);
  }

  // Sort by source priority, then by name
  deduplicated.sort((a, b) => {
    const pa = sourcePriority(a.source);
    const pb = sourcePriority(b.source);
    if (pa !== pb) return pa - pb;
    return a.name.localeCompare(b.name);
  });

  return deduplicated;
}
