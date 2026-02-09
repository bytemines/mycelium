/**
 * Marketplace — search and install skills/MCPs from multiple sources
 */
import type {
  MarketplaceEntry,
  MarketplaceSearchResult,
  MarketplaceSource,
} from "@mycelsh/core";
import { MARKETPLACE_SOURCES as MS } from "@mycelsh/core";
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
  type ClawHubResult,
} from "./marketplace-sources.js";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { MYCELIUM_HOME } from "./fs-helpers.js";

const MYCELIUM_DIR = path.join(MYCELIUM_HOME, "global");

// Re-export for backward compatibility
export { listInstalledPlugins } from "./marketplace-sources.js";

// ============================================================================
// Unified search
// ============================================================================

export async function searchMarketplace(
  query: string,
  source?: MarketplaceSource
): Promise<MarketplaceSearchResult[]> {
  const registry = await loadMarketplaceRegistry();
  const enabledSources = source
    ? [source]
    : Object.entries(registry)
        .filter(([, config]) => config.enabled)
        .map(([name]) => name);

  const searches = enabledSources
    .filter((s) => KNOWN_SEARCHERS[s])
    .map((s) => KNOWN_SEARCHERS[s](query));

  const results = await Promise.allSettled(searches);
  return results
    .filter((r): r is PromiseFulfilledResult<MarketplaceSearchResult> => r.status === "fulfilled")
    .map((r) => r.value)
    .filter((r) => r.entries.length > 0);
}

// ============================================================================
// Install
// ============================================================================

export async function installFromMarketplace(
  entry: MarketplaceEntry
): Promise<{ success: boolean; path?: string; error?: string }> {
  try {
    switch (entry.source) {
      case MS.SKILLSMP:
        return { success: false, error: "SkillsMP requires an API key. Configure it in settings." };
      case MS.OPENSKILLS:
        return await installOpenSkill(entry);
      case MS.CLAUDE_PLUGINS:
        return await installClaudePlugin(entry);
      case MS.MCP_REGISTRY:
        return await installMcpRegistry(entry);
      case MS.ANTHROPIC_SKILLS:
        return await installAnthropicSkill(entry);
      case MS.CLAWHUB:
        return await installClawHub(entry);
      default:
        return { success: false, error: `Unknown source: ${entry.source}` };
    }
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

export async function getPopularSkills(): Promise<MarketplaceSearchResult[]> {
  const results: MarketplaceSearchResult[] = [];

  const fetchers: Array<{ name: string; fn: () => Promise<void> }> = [
    { name: "anthropic-skills", fn: () => fetchPopularAnthropicSkills(results) },
    { name: "claude-plugins", fn: () => fetchPopularClaudePlugins(results) },
    { name: "mcp-registry", fn: () => fetchPopularMcpServers(results) },
    { name: "openskills", fn: () => fetchPopularOpenSkills(results) },
    { name: "clawhub", fn: () => fetchPopularClawHub(results) },
  ];

  const settled = await Promise.allSettled(fetchers.map(f => f.fn()));
  for (let i = 0; i < settled.length; i++) {
    if (settled[i].status === "rejected") {
      console.warn(`${fetchers[i].name} popular fetch failed:`, (settled[i] as PromiseRejectedResult).reason);
    }
  }

  return results;
}

async function fetchPopularAnthropicSkills(results: MarketplaceSearchResult[]) {
  const skills = await fetchAnthropicSkillsList();
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

async function fetchPopularMcpServers(results: MarketplaceSearchResult[]) {
  const servers = await fetchMcpServers("");
  if (servers.length > 0) {
    const entries = servers.slice(0, 12).map(mcpServerToEntry);
    results.push({ entries, total: entries.length, source: MS.MCP_REGISTRY });
  }
}

async function fetchPopularOpenSkills(results: MarketplaceSearchResult[]) {
  const res = await fetch("https://registry.npmjs.org/-/v1/search?text=openskills&size=12");
  if (!res.ok) return;
  const data = (await res.json()) as {
    objects: { package: { name: string; description: string; author?: { name: string }; version: string } }[];
  };
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

async function fetchPopularClawHub(results: MarketplaceSearchResult[]) {
  const queries = ["code", "git", "test", "debug"];
  const allItems: ClawHubResult[] = [];
  const seen = new Set<string>();
  for (const q of queries) {
    try {
      const res = await fetch(`https://clawhub.ai/api/v1/search?q=${q}&limit=6`,
        { headers: { Accept: "application/json" } });
      if (!res.ok) continue;
      const data = (await res.json()) as { results: ClawHubResult[] };
      for (const item of data.results || []) {
        if (!seen.has(item.slug)) {
          seen.add(item.slug);
          allItems.push(item);
        }
      }
    } catch { /* skip */ }
    if (allItems.length >= 12) break;
  }
  if (allItems.length > 0) {
    const entries: MarketplaceEntry[] = allItems.slice(0, 12).map((item) => ({
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
// Update
// ============================================================================

export async function updateSkill(
  name: string,
  source: MarketplaceSource
): Promise<{ success: boolean; path?: string; error?: string }> {
  const entry: MarketplaceEntry = { name, description: "", source, type: "skill" };
  return installFromMarketplace(entry);
}
