/**
 * Marketplace — search and install skills/MCPs from multiple sources
 */
import type {
  MarketplaceEntry,
  MarketplaceEntryType,
  MarketplaceSearchResult,
  MarketplaceSource,
} from "@mycelish/core";
import { MARKETPLACE_SOURCES as MS } from "@mycelish/core";
import { deduplicateEntries } from "./marketplace-deduplicator.js";
import {
  getRegistryEntry,
  parseRegistryEntry,
} from "./mcp-registry.js";
import { loadMarketplaceRegistry } from "./marketplace-registry.js";
import {
  KNOWN_SEARCHERS,
  listInstalledPlugins,
  enrichPluginsWithLatestVersions,
  fetchAnthropicSkillsList,
  fetchMcpServers,
  mcpServerToEntry,
  fetchGlamaServers,
  glamaServerToEntry,
  parseGitHubUrl,
  searchGitHubRepo,
  installGitHubRepoItem,
  fetchGitHubRepoItems,
  enrichWithGitHubStars,
  enrichWithNpmDownloads,
} from "./marketplace-sources.js";
import type { CacheOptions } from "./marketplace-cache.js";
import { getTracer } from "./global-tracer.js";
import { cachedFetch } from "./marketplace-cache.js";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { MYCELIUM_HOME } from "./fs-helpers.js";
import { loadStateManifest, saveStateManifest, sectionForType, ITEM_SECTIONS } from "./manifest-state.js";
import type { ItemConfig } from "./manifest-state.js";
import { computeContentHash } from "./content-hash.js";
import {
  POPULAR_ITEMS_LIMIT,
  ENRICHMENT_OVERALL_TIMEOUT,
  BATCH_HASH,
  TIMEOUT_GITHUB,
} from "./marketplace-constants.js";

// Re-export so existing consumers don't break
export { computeContentHash } from "./content-hash.js";

const MYCELIUM_DIR = path.join(MYCELIUM_HOME, "global");

// Re-export for backward compatibility
export { listInstalledPlugins } from "./marketplace-sources.js";

// ============================================================================
// Unified search
// ============================================================================

export async function searchMarketplace(
  query: string,
  source?: MarketplaceSource,
  options?: CacheOptions,
): Promise<MarketplaceEntry[]> {
  const registry = await loadMarketplaceRegistry();
  const enabledSources = source
    ? [source]
    : Object.entries(registry)
        .filter(([, config]) => config.enabled)
        .map(([name]) => name);

  const log = getTracer().createTrace("marketplace");
  log.info({ scope: "search", op: "start", msg: `q="${query}" sources=${enabledSources.length}` });
  const t0 = Date.now();

  const searches = enabledSources.map((s) => {
    if (KNOWN_SEARCHERS[s]) return KNOWN_SEARCHERS[s](query, options);
    // Dynamic GitHub marketplace: parse URL from registry config
    const config = registry[s];
    if (config?.url) {
      const gh = parseGitHubUrl(config.url);
      if (gh) return searchGitHubRepo(gh.owner, gh.repo, query, s, options);
    }
    return null;
  }).filter((p): p is Promise<MarketplaceSearchResult> => p !== null);

  const results = await Promise.allSettled(searches);
  const filtered = results
    .filter((r): r is PromiseFulfilledResult<MarketplaceSearchResult> => r.status === "fulfilled")
    .map((r) => r.value)
    .filter((r) => r.entries.length > 0);

  const total = filtered.reduce((n, r) => n + r.entries.length, 0);
  log.info({ scope: "search", op: "done", dur: Date.now() - t0, msg: `${total} entries from ${filtered.length} sources` });

  return normalizeAndEnrich(filtered);
}

// ============================================================================
// Shared Enrichment Pipeline
// ============================================================================

async function normalizeAndEnrich(results: MarketplaceSearchResult[]): Promise<MarketplaceEntry[]> {
  const enriched = await enrichWithInstalledStatus(results);
  const allEntries = deduplicateEntries(enriched);
  await Promise.allSettled([enrichWithGitHubStars(allEntries), enrichWithNpmDownloads(allEntries)]);
  return enrichWithLatestHashes(allEntries);
}

// ============================================================================
// Install
// ============================================================================

interface InstallResult {
  success: boolean;
  path?: string;
  error?: string;
  version?: string;
  contentHash?: string;
  newComponents?: string[];
  removedComponents?: string[];
}

export async function installFromMarketplace(
  entry: MarketplaceEntry
): Promise<InstallResult> {
  try {
    let result: InstallResult;
    switch (entry.source) {
      case MS.CLAUDE_PLUGINS:
        result = await installClaudePlugin(entry); break;
      case MS.MCP_REGISTRY:
        result = await installMcpRegistry(entry); break;
      case MS.ANTHROPIC_SKILLS:
        result = await installAnthropicSkill(entry); break;
      default: {
        // Try dynamic GitHub marketplace
        const reg = await loadMarketplaceRegistry();
        const config = reg[entry.source];
        if (config?.url) {
          const gh = parseGitHubUrl(config.url);
          if (gh) {
            // Plugin type: install all components from the repo
            if (entry.type === "plugin") {
              result = await installPlugin(gh.owner, gh.repo, entry);
              break;
            }
            result = await installGitHubRepoItem(gh.owner, gh.repo, entry);
            break;
          }
        }
        return { success: false, error: `Unknown source: ${entry.source}` };
      }
    }
    // MCP registry registers in manifest inside installMcpRegistry() directly
    // Skip "plugin" type — installPlugin() already registers individual components
    if (result.success && entry.source !== MS.MCP_REGISTRY && entry.type !== "plugin") {
      await registerItemInManifest(entry.name, entry.source, result.version, result.contentHash, entry.type);
    }
    // Auto-sync to push installed item into tool directories
    if (result.success) {
      try {
        await autoSync();
      } catch (err) {
        const log = getTracer().createTrace("marketplace");
        log.warn({ scope: "install", op: "auto-sync", msg: `Post-install sync failed: ${err instanceof Error ? err.message : String(err)}` });
      }
    }
    return result;
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function installClaudePlugin(entry: MarketplaceEntry) {
  const cacheDir = path.join(os.homedir(), ".claude", "plugins", "cache");
  const src = path.join(cacheDir, entry.name);
  const dest = path.join(MYCELIUM_DIR, "skills", entry.name);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.symlink(src, dest);
  return { success: true, path: dest, version: entry.version };
}

async function installMcpRegistry(entry: MarketplaceEntry) {
  const registryEntry = await getRegistryEntry(entry.name);
  if (!registryEntry) throw new Error(`Entry not found: ${entry.name}`);
  const config = parseRegistryEntry(registryEntry);
  const mcpsPath = path.join(MYCELIUM_DIR, "mcps.yaml");
  const yamlLine = `\n${entry.name}:\n  command: ${config.command}\n  args: [${(config.args || []).map((a) => `"${a}"`).join(", ")}]\n  enabled: true\n`;
  await fs.appendFile(mcpsPath, yamlLine, "utf-8");
  // MCP registry entries store version in manifest directly
  await registerItemInManifest(entry.name, entry.source, entry.version, undefined, "mcp");
  return { success: true, path: mcpsPath, version: entry.version };
}

async function installAnthropicSkill(entry: MarketplaceEntry) {
  const rawUrl = `https://raw.githubusercontent.com/anthropics/skills/main/skills/${encodeURIComponent(entry.name)}/SKILL.md`;
  const ghRes = await fetch(rawUrl);
  if (!ghRes.ok) throw new Error(`Download failed: ${ghRes.statusText}`);
  const content = await ghRes.text();
  const dir = path.join(MYCELIUM_DIR, "skills", entry.name);
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, "SKILL.md");
  await fs.writeFile(filePath, content, "utf-8");
  return { success: true, path: filePath, contentHash: computeContentHash(content) };
}

// ============================================================================
// Popular / Browse
// ============================================================================

export async function getPopularSkills(options?: CacheOptions): Promise<MarketplaceEntry[]> {
  const results: MarketplaceSearchResult[] = [];

  const fetchers: Array<{ name: string; fn: () => Promise<void> }> = [
    {
      name: "anthropic-skills",
      fn: () => fetchPopularSource({
        source: MS.ANTHROPIC_SKILLS,
        fetch: async () => {
          const skills = await fetchAnthropicSkillsList(options);
          return skills.map(name => ({
            name,
            description: `Official Anthropic skill: ${name}`,
            author: "anthropics",
            source: MS.ANTHROPIC_SKILLS,
            type: "skill" as const,
            url: `https://github.com/anthropics/skills/tree/main/skills/${name}`,
          }));
        },
      }, results),
    },
    {
      name: "claude-plugins",
      fn: () => fetchPopularSource({
        source: MS.CLAUDE_PLUGINS,
        fetch: async () => {
          const plugins = await listInstalledPlugins();
          if (plugins.length > 0) await enrichPluginsWithLatestVersions(plugins);
          return plugins;
        },
      }, results),
    },
    {
      name: "mcp-registry",
      fn: () => fetchPopularSource({
        source: MS.MCP_REGISTRY,
        fetch: async () => {
          const servers = await cachedFetch("mcp-registry", () => fetchMcpServers(""), options);
          return servers.map(mcpServerToEntry);
        },
      }, results),
    },
    {
      name: "glama",
      fn: () => fetchPopularSource({
        source: MS.GLAMA,
        fetch: async () => {
          const servers = await cachedFetch("glama", () => fetchGlamaServers(""), options);
          return servers.map(glamaServerToEntry);
        },
      }, results),
    },
  ];

  // Add dynamic GitHub marketplaces
  const registry = await loadMarketplaceRegistry();
  for (const [name, config] of Object.entries(registry)) {
    if (KNOWN_SEARCHERS[name] || !config.enabled || !config.url) continue;
    const gh = parseGitHubUrl(config.url);
    if (gh) {
      fetchers.push({
        name,
        fn: async () => {
          const r = await searchGitHubRepo(gh.owner, gh.repo, "", name, options);
          if (r.entries.length > 0) results.push(r);
        },
      });
    }
  }

  const log = getTracer().createTrace("marketplace");
  const t0 = Date.now();
  const settled = await Promise.allSettled(fetchers.map(f => f.fn()));
  for (let i = 0; i < settled.length; i++) {
    if (settled[i].status === "rejected") {
      log.warn({ scope: "popular", op: "fetch-failed", item: fetchers[i].name, msg: String((settled[i] as PromiseRejectedResult).reason) });
    }
  }
  log.info({ scope: "popular", op: "done", dur: Date.now() - t0, msg: `${results.reduce((n, r) => n + r.entries.length, 0)} entries` });

  return normalizeAndEnrich(results);
}

/** Config-driven popular fetcher — collapses 4 near-identical functions. */
async function fetchPopularSource(
  config: {
    source: string;
    fetch: () => Promise<MarketplaceEntry[]>;
  },
  results: MarketplaceSearchResult[],
): Promise<void> {
  const entries = await config.fetch();
  if (entries.length > 0) {
    const sliced = entries.slice(0, POPULAR_ITEMS_LIMIT);
    results.push({ entries: sliced, total: entries.length, source: config.source });
  }
}

// ============================================================================
// Plugin Install (all components from a GitHub repo)
// ============================================================================

async function installPlugin(
  owner: string,
  repo: string,
  entry: MarketplaceEntry,
): Promise<{ success: boolean; path?: string; error?: string }> {
  const items = await fetchGitHubRepoItems(owner, repo);
  if (items.length === 0) {
    return { success: false, error: `No installable items found in ${owner}/${repo}` };
  }

  const results = await Promise.allSettled(
    items.map(item =>
      installGitHubRepoItem(owner, repo, {
        name: item.name,
        description: item.description || "",
        source: entry.source,
        type: item.type,
        url: `https://github.com/${owner}/${repo}/tree/main/${item.path}`,
      })
    )
  );

  const succeeded = results.filter(r => r.status === "fulfilled" && r.value.success).length;
  const failed = results.length - succeeded;

  // Register each installed item in manifest
  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const r = results[idx];
    const contentHash = r.status === "fulfilled" ? r.value.contentHash : undefined;
    await registerItemInManifest(item.name, entry.source, undefined, contentHash, item.type);
  }

  if (failed > 0) {
    return { success: true, error: `Installed ${succeeded}/${results.length} components (${failed} failed)` };
  }
  return { success: true, path: `${succeeded} components installed from ${owner}/${repo}` };
}

// ============================================================================
// Auto-Sync
// ============================================================================

async function autoSync(): Promise<void> {
  const { ALL_TOOL_IDS } = await import("@mycelish/core");
  const { syncAll } = await import("../commands/sync.js");
  const enabledTools: Record<string, { enabled: boolean }> = Object.fromEntries(
    ALL_TOOL_IDS.map((id: string) => [id, { enabled: true }])
  );
  await syncAll(process.cwd(), enabledTools);
}

// ============================================================================
// Manifest Registration
// ============================================================================

async function registerItemInManifest(name: string, source: string, version?: string, contentHash?: string, itemType?: string): Promise<void> {
  const manifestDir = MYCELIUM_HOME;
  const manifest = await loadStateManifest(manifestDir) ?? { version: "1.0.0" };
  const sectionKey = (itemType && sectionForType(itemType)) || "skills";
  if (!manifest[sectionKey]) (manifest as unknown as Record<string, unknown>)[sectionKey] = {};
  const section = manifest[sectionKey] as Record<string, ItemConfig>;
  const entry: ItemConfig = { state: "enabled", source };
  if (version) entry.version = version;
  if (contentHash) entry.contentHash = contentHash;
  section[name] = entry;
  await saveStateManifest(manifestDir, manifest);
}

// ============================================================================
// Installed Status Enrichment
// ============================================================================

async function getInstalledItems(): Promise<Map<string, { source: string; version?: string; contentHash?: string }>> {
  const manifest = await loadStateManifest(MYCELIUM_HOME);
  if (!manifest) return new Map();
  const map = new Map<string, { source: string; version?: string; contentHash?: string }>();
  let needsSave = false;

  for (const { key } of ITEM_SECTIONS) {
    const section = manifest[key];
    if (!section || typeof section !== "object" || Array.isArray(section)) continue;
    for (const [name, cfg] of Object.entries(section as Record<string, ItemConfig>)) {
      if (cfg.state !== "enabled") continue;
      // Backfill: compute contentHash for skills that have none, or migrate short hashes
      if (key === "skills") {
        const needsBackfill = !cfg.version && (!cfg.contentHash || cfg.contentHash.length < 12);
        if (needsBackfill) {
          const hash = await backfillContentHash(name, cfg);
          if (hash) {
            cfg.contentHash = hash;
            needsSave = true;
          }
        }
      }
      map.set(name, { source: cfg.source ?? "", version: cfg.version, contentHash: cfg.contentHash });
    }
  }

  if (needsSave) {
    await saveStateManifest(MYCELIUM_HOME, manifest).catch((err) => {
      const log = getTracer().createTrace("marketplace");
      log.warn({ scope: "manifest", op: "backfill-save", msg: `Failed to save backfilled hashes: ${err instanceof Error ? err.message : String(err)}` });
    });
  }

  return map;
}

/** Backfill: compute content hash from already-installed item files */
async function backfillContentHash(name: string, cfg?: ItemConfig): Promise<string | undefined> {
  // Try all item type paths — skills use dir/SKILL.md, agents/commands use flat .md
  const candidates = [
    path.join(MYCELIUM_DIR, "skills", name, "SKILL.md"),
    path.join(MYCELIUM_DIR, "agents", `${name}.md`),
    path.join(MYCELIUM_DIR, "commands", `${name}.md`),
  ];
  // Plugin-origin items live in the plugin cache, not in ~/.mycelium/global/
  if (cfg?.pluginOrigin?.cachePath) {
    candidates.unshift(
      path.join(cfg.pluginOrigin.cachePath, "skills", name, "SKILL.md"),
      path.join(cfg.pluginOrigin.cachePath, "agents", `${name}.md`),
      path.join(cfg.pluginOrigin.cachePath, "commands", `${name}.md`),
    );
  }
  for (const p of candidates) {
    try {
      const content = await fs.readFile(p, "utf-8");
      return computeContentHash(content);
    } catch {
      // Try next path
    }
  }
  return undefined;
}

// ============================================================================
// Mycelium Self-Update Check
// ============================================================================

export async function checkMyceliumUpdate(): Promise<{ current: string; latest: string; hasUpdate: boolean } | null> {
  try {
    const pkgPath = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "..", "package.json");
    const pkgContent = await fs.readFile(pkgPath, "utf-8");
    const pkg = JSON.parse(pkgContent) as { version: string };
    const current = pkg.version;

    const res = await fetch("https://registry.npmjs.org/@mycelish/cli/latest", {
      signal: AbortSignal.timeout(TIMEOUT_GITHUB),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { version: string };
    return { current, latest: data.version, hasUpdate: data.version !== current };
  } catch {
    return null;
  }
}

async function enrichWithInstalledStatus(results: MarketplaceSearchResult[]): Promise<MarketplaceSearchResult[]> {
  const installed = await getInstalledItems();
  if (installed.size === 0) return results;
  return results.map(r => ({
    ...r,
    entries: r.entries.map(e => {
      // Direct match: item name exists in manifest
      const info = installed.get(e.name);
      if (info) {
        const installedVersion = info.version ?? (info.contentHash ? `#${info.contentHash}` : undefined);
        return { ...e, installed: true, installedVersion };
      }
      // Plugin bundle: mark as installed if all non-plugin siblings from the same source are installed
      if (e.type === "plugin") {
        const siblings = r.entries.filter(s => s.type !== "plugin" && s.source === e.source);
        if (siblings.length > 0 && siblings.every(s => installed.has(s.name))) {
          return { ...e, installed: true };
        }
      }
      return e;
    }),
  }));
}

// ============================================================================
// Latest Hash Enrichment (for versionless sources)
// ============================================================================

async function enrichWithLatestHashes(entries: MarketplaceEntry[]): Promise<MarketplaceEntry[]> {
  const needsHash = entries.filter(e => e.installed && !e.latestVersion && e.url);
  if (needsHash.length === 0) return entries;

  const hashMap = new Map<string, string>();
  // Overall timeout: cap total enrichment at 15s regardless of item count
  const overallController = new AbortController();
  const overallTimeout = setTimeout(() => overallController.abort(), ENRICHMENT_OVERALL_TIMEOUT);

  try {
    const BATCH_SIZE = BATCH_HASH;
    for (let i = 0; i < needsHash.length; i += BATCH_SIZE) {
      if (overallController.signal.aborted) break;
      const batch = needsHash.slice(i, i + BATCH_SIZE).map(async (e) => {
        try {
          let rawUrl = e.url!;
          if (rawUrl.includes("github.com") && rawUrl.includes("/tree/main/")) {
            rawUrl = rawUrl.replace("github.com", "raw.githubusercontent.com").replace("/tree/main/", "/main/");
            if (e.type === "skill" && !rawUrl.endsWith(".md")) {
              rawUrl += "/SKILL.md";
            }
          }
          const res = await fetch(rawUrl, { signal: overallController.signal });
          if (res.ok) {
            const content = await res.text();
            hashMap.set(e.name, `#${computeContentHash(content)}`);
          }
        } catch (err) {
          // Non-critical — skip (includes AbortError from overall timeout)
          if (err instanceof Error && err.name !== "AbortError") {
            const log = getTracer().createTrace("marketplace");
            log.warn({ scope: "enrich", op: "hash-fetch", item: e.name, msg: `Hash fetch failed: ${err.message}` });
          }
        }
      });
      await Promise.allSettled(batch);
    }
  } finally {
    clearTimeout(overallTimeout);
  }

  if (hashMap.size === 0) return entries;
  return entries.map(e => {
    const hash = hashMap.get(e.name);
    return hash ? { ...e, latestVersion: hash } : e;
  });
}

// ============================================================================
// Check for Updates
// ============================================================================

export async function checkForUpdates(): Promise<{ name: string; source: string; type: string; installedVersion: string; latestVersion: string }[]> {
  const installed = await getInstalledItems();
  if (installed.size === 0) return [];

  // Search all sources to get latest versions
  const results = await searchMarketplace("");
  const updates: { name: string; source: string; type: string; installedVersion: string; latestVersion: string }[] = [];

  for (const entry of results) {
    const info = installed.get(entry.name);
    if (!info) continue;
    const installedVersion = info.version ?? (info.contentHash ? `#${info.contentHash}` : undefined);
    if (!installedVersion || !entry.latestVersion) continue;
    if (installedVersion !== entry.latestVersion) {
      updates.push({
        name: entry.name,
        source: entry.source,
        type: entry.type,
        installedVersion,
        latestVersion: entry.latestVersion,
      });
    }
  }
  return updates;
}

// ============================================================================
// Update
// ============================================================================

export async function updateItem(
  name: string,
  source: MarketplaceSource,
  type?: MarketplaceEntryType,
  url?: string
): Promise<{ success: boolean; path?: string; error?: string; newComponents?: string[]; removedComponents?: string[] }> {
  // Force-refresh cache so we pick up newly added items in the source repo
  const results = await searchMarketplace(name, undefined, { forceRefresh: true });
  const match = results.find(e => e.name === name && e.source === source);
  if (match) {
    type ??= match.type;
    url ??= match.url;
  }
  const entry: MarketplaceEntry = { name, description: "", source, type: type ?? "skill", url };
  const result = await installFromMarketplace(entry);

  // After updating any component, sync ALL components from the same source
  // This ensures new items added to the repo get installed automatically
  // and items removed from the repo get cleaned up
  if (result.success) {
    const allSourceEntries = await searchMarketplace("", source, { forceRefresh: true });
    const { added, removed } = await syncSourceComponents(source, allSourceEntries);
    if (added.length > 0 || removed.length > 0) {
      const parts = [result.path];
      if (added.length > 0) parts.push(`+${added.length} new: ${added.join(", ")}`);
      if (removed.length > 0) parts.push(`-${removed.length} removed: ${removed.join(", ")}`);
      result.path = parts.join(" | ");
      result.newComponents = added;
      result.removedComponents = removed;
    }
  }

  return result;
}

/**
 * Sync components from a source: install new items, remove deleted items.
 * Called during updates to keep plugins in sync with their repos.
 */
async function syncSourceComponents(
  source: MarketplaceSource,
  allEntries: MarketplaceEntry[]
): Promise<{ added: string[]; removed: string[] }> {
  const log = getTracer().createTrace("marketplace");

  // Guard: if search returned empty results, skip removal to prevent data loss
  // (could be an API/cache failure rather than all items being deleted)
  if (allEntries.length === 0) {
    log.warn({ scope: "sync", op: "skip", msg: `Empty results for source ${source}, skipping sync to prevent data loss` });
    return { added: [], removed: [] };
  }

  const installed = await getInstalledItems();
  const sourceEntries = allEntries.filter(e => e.source === source && e.type !== "plugin");
  const sourceItemNames = new Set(sourceEntries.map(e => e.name));
  const added: string[] = [];
  const removed: string[] = [];

  // Install new components not yet installed
  for (const entry of sourceEntries) {
    if (!installed.has(entry.name)) {
      try {
        const res = await installFromMarketplace(entry);
        if (res.success) added.push(entry.name);
      } catch (err) {
        log.warn({ scope: "sync", op: "install-failed", item: entry.name, msg: `Failed to install: ${err instanceof Error ? err.message : String(err)}` });
      }
    }
  }

  // Remove components that were deleted from the source repo
  for (const [itemName, info] of installed) {
    if (info.source === source && !sourceItemNames.has(itemName)) {
      try {
        await removeItemFromSource(itemName, log);
        removed.push(itemName);
      } catch (err) {
        log.warn({ scope: "sync", op: "remove-failed", item: itemName, msg: `Failed to remove: ${err instanceof Error ? err.message : String(err)}` });
      }
    }
  }

  return { added, removed };
}

/**
 * Remove an item installed from a marketplace source.
 * Marks as deleted in manifest and purges files from global dir.
 * This is a core-layer helper to avoid importing from commands/.
 */
async function removeItemFromSource(
  name: string,
  log: ReturnType<ReturnType<typeof getTracer>["createTrace"]>,
): Promise<void> {
  const manifest = await loadStateManifest(MYCELIUM_HOME);
  if (!manifest) return;

  // Mark as deleted in manifest
  for (const { key } of ITEM_SECTIONS) {
    const section = manifest[key] as Record<string, ItemConfig> | undefined;
    if (section?.[name]) {
      section[name].state = "deleted";
    }
  }
  await saveStateManifest(MYCELIUM_HOME, manifest);

  // Purge files from global dir
  const DIR_NAMES = ["skills", "mcps", "agents", "commands", "rules", "hooks"];
  for (const dirName of DIR_NAMES) {
    const dirPath = path.join(MYCELIUM_DIR, dirName, name);
    try {
      await fs.rm(dirPath, { recursive: true, force: true });
    } catch {
      // Directory doesn't exist, fine
    }
    for (const ext of [".md", ".yaml", ".yml"]) {
      try {
        await fs.unlink(path.join(MYCELIUM_DIR, dirName, `${name}${ext}`));
      } catch {
        // File doesn't exist, fine
      }
    }
  }

  log.info({ scope: "sync", op: "removed", item: name, msg: `Removed ${name} from manifest and files` });
}

/** @deprecated Use updateItem instead */
export const updateSkill = updateItem;
