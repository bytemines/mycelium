/**
 * marketplace-sources — individual marketplace search/fetch implementations
 *
 * Extracted from marketplace.ts to keep functions under 60 lines.
 */
import type { MarketplaceEntry, MarketplaceSearchResult } from "@mycelium/core";
import { MARKETPLACE_SOURCES as MS } from "@mycelium/core";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

// ============================================================================
// npm download counts
// ============================================================================

export async function fetchNpmDownloads(names: string[]): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  if (names.length === 0) return result;
  const fetches = names.slice(0, 20).map(async (name) => {
    try {
      const res = await fetch(`https://api.npmjs.org/downloads/point/last-week/${encodeURIComponent(name)}`);
      if (res.ok) {
        const data = (await res.json()) as { downloads?: number };
        if (data.downloads) result[name] = data.downloads;
      }
    } catch {
      // Non-critical
    }
  });
  await Promise.allSettled(fetches);
  return result;
}

// ============================================================================
// OpenSkills (npm registry)
// ============================================================================

export async function searchOpenSkills(query: string): Promise<MarketplaceSearchResult> {
  const res = await fetch(
    `https://registry.npmjs.org/-/v1/search?text=openskills+${encodeURIComponent(query)}&size=12`
  );
  if (!res.ok) throw new Error(`openskills search failed: ${res.statusText}`);
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
  return { entries, total: entries.length, source: MS.OPENSKILLS };
}

// ============================================================================
// Claude Plugins (local installed_plugins.json v2)
// ============================================================================

export async function listInstalledPlugins(): Promise<MarketplaceEntry[]> {
  try {
    const filePath = path.join(os.homedir(), ".claude", "plugins", "installed_plugins.json");
    const raw = await fs.readFile(filePath, "utf-8");
    const data = JSON.parse(raw) as {
      version?: number;
      plugins?: Record<string, Array<{
        scope: string;
        installPath: string;
        version: string;
        installedAt?: string;
        lastUpdated?: string;
      }>>;
    } | Array<{ name: string; description?: string; version?: string; author?: string }>;

    if (!Array.isArray(data) && data.version === 2 && data.plugins) {
      return parseV2Plugins(data.plugins);
    }

    if (Array.isArray(data)) {
      return data.map((p) => ({
        name: p.name,
        description: p.description || "",
        version: p.version,
        author: p.author,
        installed: true,
        source: MS.CLAUDE_PLUGINS,
        type: "plugin" as const,
      }));
    }

    return [];
  } catch (e) {
    console.warn("Failed to read installed plugins:", e);
    return [];
  }
}

function parseV2Plugins(
  plugins: Record<string, Array<{ scope: string; installPath: string; version: string; installedAt?: string; lastUpdated?: string }>>
): MarketplaceEntry[] {
  const entries: MarketplaceEntry[] = [];
  for (const [key, installs] of Object.entries(plugins)) {
    const atIdx = key.indexOf("@");
    const pluginName = atIdx > 0 ? key.slice(0, atIdx) : key;
    const marketplace = atIdx > 0 ? key.slice(atIdx + 1) : undefined;
    const latest = installs[installs.length - 1];
    if (!latest) continue;
    entries.push({
      name: pluginName,
      description: marketplace ? `From ${marketplace}` : "",
      version: latest.version,
      latestVersion: latest.version,
      installedVersion: latest.version,
      installed: true,
      updatedAt: latest.lastUpdated ? new Date(latest.lastUpdated).toISOString().slice(0, 10) : undefined,
      source: MS.CLAUDE_PLUGINS,
      type: "plugin" as const,
    });
  }
  return entries;
}

export async function searchClaudePlugins(query: string): Promise<MarketplaceSearchResult> {
  const plugins = await listInstalledPlugins();
  const q = query.toLowerCase();
  const entries = plugins.filter(
    (p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)
  );
  return { entries, total: entries.length, source: MS.CLAUDE_PLUGINS };
}

// ============================================================================
// MCP Registry
// ============================================================================

interface McpRegistryServer {
  server: {
    name: string;
    description?: string;
    version?: string;
    repository?: { url?: string; source?: string };
  };
}

const MCP_REGISTRY_URL = "https://registry.modelcontextprotocol.io";

export async function fetchMcpServers(query: string): Promise<McpRegistryServer[]> {
  const url = query
    ? `${MCP_REGISTRY_URL}/v0.1/servers?q=${encodeURIComponent(query)}&limit=20`
    : `${MCP_REGISTRY_URL}/v0.1/servers?limit=20`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`MCP Registry failed: ${res.statusText}`);
  const data = (await res.json()) as { servers: McpRegistryServer[] };
  return data.servers || [];
}

export function mcpServerToEntry(s: McpRegistryServer): MarketplaceEntry {
  const srv = s.server;
  return {
    name: srv.name,
    description: srv.description || "",
    version: srv.version,
    latestVersion: srv.version,
    source: MS.MCP_REGISTRY,
    type: "mcp" as const,
  };
}

export async function searchMcpRegistry(query: string): Promise<MarketplaceSearchResult> {
  const servers = await fetchMcpServers(query);
  const entries = servers.map(mcpServerToEntry);
  return { entries, total: entries.length, source: MS.MCP_REGISTRY };
}

// ============================================================================
// Anthropic Skills (GitHub)
// ============================================================================

export async function fetchAnthropicSkillsList(): Promise<string[]> {
  const res = await fetch(
    "https://api.github.com/repos/anthropics/skills/git/trees/main?recursive=1",
    { headers: { Accept: "application/vnd.github.v3+json" } }
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { tree: { path: string; type: string }[] };
  const skills: string[] = [];
  for (const t of data.tree) {
    if (t.type === "blob" && t.path.endsWith("/SKILL.md") && t.path.startsWith("skills/")) {
      const parts = t.path.split("/");
      if (parts.length === 3) skills.push(parts[1]);
    }
  }
  return skills;
}

export async function searchAnthropicSkills(query: string): Promise<MarketplaceSearchResult> {
  const allSkills = await fetchAnthropicSkillsList();
  const q = query.toLowerCase();
  const filtered = q ? allSkills.filter(s => s.toLowerCase().includes(q)) : allSkills;
  const entries: MarketplaceEntry[] = filtered.map(name => ({
    name,
    description: `Official Anthropic skill: ${name}`,
    author: "anthropics",
    source: MS.ANTHROPIC_SKILLS,
    type: "skill" as const,
  }));
  return { entries, total: entries.length, source: MS.ANTHROPIC_SKILLS };
}

// ============================================================================
// ClawHub
// ============================================================================

export interface ClawHubResult {
  slug: string;
  displayName: string;
  summary: string;
  version?: string;
  updatedAt?: number;
  score?: number;
}

export async function searchClawHub(query: string): Promise<MarketplaceSearchResult> {
  const res = await fetch(
    `https://clawhub.ai/api/v1/search?q=${encodeURIComponent(query)}&limit=12`,
    { headers: { Accept: "application/json" } }
  );
  if (!res.ok) throw new Error(`ClawHub search failed: ${res.statusText}`);
  const data = (await res.json()) as { results: ClawHubResult[] };
  const entries: MarketplaceEntry[] = (data.results || []).map((item) => ({
    name: item.slug,
    description: item.summary || item.displayName || "",
    version: item.version,
    latestVersion: item.version,
    updatedAt: item.updatedAt ? new Date(item.updatedAt).toISOString().slice(0, 10) : undefined,
    source: MS.CLAWHUB,
    type: "skill" as const,
  }));
  return { entries, total: entries.length, source: MS.CLAWHUB };
}

// ============================================================================
// SkillsMP (disabled — needs API key)
// ============================================================================

export async function searchSkillsmp(_query: string): Promise<MarketplaceSearchResult> {
  return { entries: [], total: 0, source: MS.SKILLSMP };
}

// ============================================================================
// Searcher map
// ============================================================================

export const KNOWN_SEARCHERS: Record<
  string,
  (q: string) => Promise<MarketplaceSearchResult>
> = {
  [MS.SKILLSMP]: searchSkillsmp,
  [MS.OPENSKILLS]: searchOpenSkills,
  [MS.CLAUDE_PLUGINS]: searchClaudePlugins,
  [MS.MCP_REGISTRY]: searchMcpRegistry,
  [MS.ANTHROPIC_SKILLS]: searchAnthropicSkills,
  [MS.CLAWHUB]: searchClawHub,
};
