/**
 * Marketplace — search and install skills/MCPs from multiple sources
 */
import type {
  MarketplaceEntry,
  MarketplaceSearchResult,
  MarketplaceSource,
} from "@mycelish/core";
import { MARKETPLACE_SOURCES as MS } from "@mycelish/core";
import {
  getRegistryEntry,
  parseRegistryEntry,
} from "./mcp-registry.js";
import { loadMarketplaceRegistry } from "./marketplace-registry.js";
import {
  KNOWN_SEARCHERS,
  listInstalledPlugins,
  fetchAnthropicSkillsList,
  fetchMcpServers,
  mcpServerToEntry,
  fetchNpmDownloads,
  parseGitHubUrl,
  searchGitHubRepo,
  installGitHubRepoItem,
  type ClawHubResult,
} from "./marketplace-sources.js";
import type { CacheOptions } from "./marketplace-cache.js";
import { getTracer } from "./global-tracer.js";
import { cachedFetch } from "./marketplace-cache.js";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { MYCELIUM_HOME } from "./fs-helpers.js";
import { loadStateManifest, saveStateManifest } from "./manifest-state.js";

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
): Promise<MarketplaceSearchResult[]> {
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

  return enrichWithInstalledStatus(filtered);
}

// ============================================================================
// Install
// ============================================================================

export async function installFromMarketplace(
  entry: MarketplaceEntry
): Promise<{ success: boolean; path?: string; error?: string }> {
  try {
    let result: { success: boolean; path?: string; error?: string };
    switch (entry.source) {
      case MS.SKILLSMP:
        return { success: false, error: "SkillsMP requires an API key. Configure it in settings." };
      case MS.OPENSKILLS:
        result = await installOpenSkill(entry); break;
      case MS.CLAUDE_PLUGINS:
        result = await installClaudePlugin(entry); break;
      case MS.MCP_REGISTRY:
        result = await installMcpRegistry(entry); break;
      case MS.ANTHROPIC_SKILLS:
        result = await installAnthropicSkill(entry); break;
      case MS.CLAWHUB:
        result = await installClawHub(entry); break;
      default: {
        // Try dynamic GitHub marketplace
        const reg = await loadMarketplaceRegistry();
        const config = reg[entry.source];
        if (config?.url) {
          const gh = parseGitHubUrl(config.url);
          if (gh) {
            result = await installGitHubRepoItem(gh.owner, gh.repo, entry);
            break;
          }
        }
        return { success: false, error: `Unknown source: ${entry.source}` };
      }
    }
    if (result.success && entry.source !== MS.MCP_REGISTRY) {
      await registerSkillInManifest(entry.name, entry.source);
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

async function installOpenSkill(entry: MarketplaceEntry) {
  const dir = path.join(MYCELIUM_DIR, "skills", entry.name);
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, "SKILL.md");
  await fs.writeFile(filePath, `# ${entry.name}\n\n${entry.description}\n\n> Installed from openskills registry\n`, "utf-8");
  return { success: true, path: filePath };
}

async function installClaudePlugin(entry: MarketplaceEntry) {
  const cacheDir = path.join(os.homedir(), ".claude", "plugins", "cache");
  const src = path.join(cacheDir, entry.name);
  const dest = path.join(MYCELIUM_DIR, "skills", entry.name);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.symlink(src, dest);
  return { success: true, path: dest };
}

async function installMcpRegistry(entry: MarketplaceEntry) {
  const registryEntry = await getRegistryEntry(entry.name);
  if (!registryEntry) throw new Error(`Entry not found: ${entry.name}`);
  const config = parseRegistryEntry(registryEntry);
  const mcpsPath = path.join(MYCELIUM_DIR, "mcps.yaml");
  const yamlLine = `\n${entry.name}:\n  command: ${config.command}\n  args: [${(config.args || []).map((a) => `"${a}"`).join(", ")}]\n  enabled: true\n`;
  await fs.appendFile(mcpsPath, yamlLine, "utf-8");
  return { success: true, path: mcpsPath };
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
  return { success: true, path: filePath };
}

async function installClawHub(entry: MarketplaceEntry) {
  const res = await fetch(
    `https://clawhub.ai/api/v1/download/${encodeURIComponent(entry.name)}`,
    { headers: { Accept: "application/json" } }
  );
  if (!res.ok) throw new Error(`Download failed: ${res.statusText}`);
  const content = await res.text();
  const dir = path.join(MYCELIUM_DIR, "skills", entry.name);
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, "SKILL.md");
  await fs.writeFile(filePath, content, "utf-8");
  return { success: true, path: filePath };
}

// ============================================================================
// Popular / Browse
// ============================================================================

export async function getPopularSkills(options?: CacheOptions): Promise<MarketplaceSearchResult[]> {
  const results: MarketplaceSearchResult[] = [];

  const fetchers: Array<{ name: string; fn: () => Promise<void> }> = [
    { name: "anthropic-skills", fn: () => fetchPopularAnthropicSkills(results, options) },
    { name: "claude-plugins", fn: () => fetchPopularClaudePlugins(results) },
    { name: "mcp-registry", fn: () => fetchPopularMcpServers(results, options) },
    { name: "openskills", fn: () => fetchPopularOpenSkills(results, options) },
    { name: "clawhub", fn: () => fetchPopularClawHub(results, options) },
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

  return enrichWithInstalledStatus(results);
}

async function fetchPopularAnthropicSkills(results: MarketplaceSearchResult[], options?: CacheOptions) {
  const skills = await fetchAnthropicSkillsList(options);
  if (skills.length > 0) {
    const entries: MarketplaceEntry[] = skills.slice(0, 12).map(name => ({
      name,
      description: `Official Anthropic skill: ${name}`,
      author: "anthropics",
      source: MS.ANTHROPIC_SKILLS,
      type: "skill" as const,
    }));
    results.push({ entries, total: entries.length, source: MS.ANTHROPIC_SKILLS });
  }
}

async function fetchPopularClaudePlugins(results: MarketplaceSearchResult[]) {
  const plugins = await listInstalledPlugins();
  if (plugins.length > 0) {
    results.push({ entries: plugins.slice(0, 12), total: plugins.length, source: MS.CLAUDE_PLUGINS });
  }
}

async function fetchPopularMcpServers(results: MarketplaceSearchResult[], options?: CacheOptions) {
  const servers = await cachedFetch("mcp-registry", () => fetchMcpServers(""), options);
  if (servers.length > 0) {
    const entries = servers.slice(0, 12).map(mcpServerToEntry);
    results.push({ entries, total: entries.length, source: MS.MCP_REGISTRY });
  }
}

async function fetchPopularOpenSkills(results: MarketplaceSearchResult[], options?: CacheOptions) {
  const data = await cachedFetch("openskills", async () => {
    const res = await fetch("https://registry.npmjs.org/-/v1/search?text=openskills&size=12");
    if (!res.ok) throw new Error(`openskills browse failed: ${res.statusText}`);
    return (await res.json()) as {
      objects: { package: { name: string; description: string; author?: { name: string }; version: string } }[];
    };
  }, options);
  const names = data.objects.map(o => o.package.name);
  const downloads = await fetchNpmDownloads(names);
  const entries: MarketplaceEntry[] = data.objects.map((o) => ({
    name: o.package.name,
    description: o.package.description || "",
    author: o.package.author?.name,
    version: o.package.version,
    latestVersion: o.package.version,
    downloads: downloads[o.package.name],
    source: MS.OPENSKILLS,
    type: "skill" as const,
  }));
  results.push({ entries, total: entries.length, source: MS.OPENSKILLS });
}

async function fetchPopularClawHub(results: MarketplaceSearchResult[], options?: CacheOptions) {
  const data = await cachedFetch("clawhub-popular", async () => {
    const queries = ["code", "git", "test", "debug"];
    const allItems: ClawHubResult[] = [];
    const seen = new Set<string>();
    for (const q of queries) {
      try {
        const res = await fetch(`https://clawhub.ai/api/v1/search?q=${q}&limit=6`,
          { headers: { Accept: "application/json" } });
        if (!res.ok) continue;
        const d = (await res.json()) as { results: ClawHubResult[] };
        for (const item of d.results || []) {
          if (!seen.has(item.slug)) {
            seen.add(item.slug);
            allItems.push(item);
          }
        }
      } catch { /* skip */ }
      if (allItems.length >= 12) break;
    }
    return allItems;
  }, options);
  if (data.length > 0) {
    const entries: MarketplaceEntry[] = data.slice(0, 12).map((item) => ({
      name: item.slug,
      description: item.summary || item.displayName || "",
      version: item.version,
      latestVersion: item.version,
      updatedAt: item.updatedAt ? new Date(item.updatedAt).toISOString().slice(0, 10) : undefined,
      source: MS.CLAWHUB,
      type: "skill" as const,
    }));
    results.push({ entries, total: entries.length, source: MS.CLAWHUB });
  }
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

async function registerSkillInManifest(name: string, source: string): Promise<void> {
  const manifestDir = MYCELIUM_HOME;
  const manifest = await loadStateManifest(manifestDir) ?? { version: "1.0.0" };
  if (!manifest.skills) manifest.skills = {};
  manifest.skills[name] = { state: "enabled", source };
  await saveStateManifest(manifestDir, manifest);
}

// ============================================================================
// Installed Status Enrichment
// ============================================================================

async function getInstalledSkillNames(): Promise<Set<string>> {
  const manifest = await loadStateManifest(MYCELIUM_HOME);
  if (!manifest?.skills) return new Set();
  return new Set(
    Object.entries(manifest.skills)
      .filter(([, cfg]) => cfg.state === "enabled")
      .map(([name]) => name)
  );
}

async function enrichWithInstalledStatus(results: MarketplaceSearchResult[]): Promise<MarketplaceSearchResult[]> {
  const installed = await getInstalledSkillNames();
  if (installed.size === 0) return results;
  return results.map(r => ({
    ...r,
    entries: r.entries.map(e => installed.has(e.name) ? { ...e, installed: true } : e),
  }));
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
