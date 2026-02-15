/**
 * Marketplace — search and install skills/MCPs from multiple sources
 */
import type {
  MarketplaceEntry,
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
import { loadStateManifest, saveStateManifest, sectionForType } from "./manifest-state.js";
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
      } catch {
        // Sync failure shouldn't break the install
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
  if (!manifest?.skills) return new Map();
  const map = new Map<string, { source: string; version?: string; contentHash?: string }>();
  let needsSave = false;

  for (const [name, cfg] of Object.entries(manifest.skills)) {
    if (cfg.state === "enabled") {
      // Backfill: compute contentHash for items that have none, or migrate short hashes
      const needsBackfill = !cfg.version && (!cfg.contentHash || cfg.contentHash.length < 12);
      if (needsBackfill) {
        const hash = await backfillContentHash(name, cfg);
        if (hash) {
          cfg.contentHash = hash;
          needsSave = true;
        }
      }
      map.set(name, { source: cfg.source ?? "", version: cfg.version, contentHash: cfg.contentHash });
    }
  }

  if (needsSave) {
    await saveStateManifest(MYCELIUM_HOME, manifest).catch(() => {});
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
      const info = installed.get(e.name);
      if (!info) return e;
      const installedVersion = info.version ?? (info.contentHash ? `#${info.contentHash}` : undefined);
      return { ...e, installed: true, installedVersion };
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
        } catch {
          // Non-critical — skip (includes abort)
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

export async function updateSkill(
  name: string,
  source: MarketplaceSource
): Promise<{ success: boolean; path?: string; error?: string }> {
  const entry: MarketplaceEntry = { name, description: "", source, type: "skill" };
  return installFromMarketplace(entry);
}
