/**
 * Marketplace — search and install skills/MCPs from multiple sources
 */
import type {
  MarketplaceEntry,
  MarketplaceSearchResult,
  MarketplaceSource,
} from "@mycelium/core";
import { MARKETPLACE_SOURCES as MS } from "@mycelium/core";
import {
  getRegistryEntry,
  parseRegistryEntry,
} from "./mcp-registry.js";
import { loadMarketplaceRegistry } from "./marketplace-registry.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

const MYCELIUM_DIR = path.join(os.homedir(), ".mycelium", "global");
const MCP_REGISTRY_URL = "https://registry.modelcontextprotocol.io";

// ============================================================================
// Helper: fetch npm weekly downloads for a list of packages
// ============================================================================

async function fetchNpmDownloads(names: string[]): Promise<Record<string, number>> {
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
// Source: OpenSkills (npm registry)
// ============================================================================

async function searchOpenSkills(
  query: string
): Promise<MarketplaceSearchResult> {
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
// Source: Claude Plugins (local installed_plugins.json v2)
// ============================================================================

async function searchClaudePlugins(
  query: string
): Promise<MarketplaceSearchResult> {
  const plugins = await listInstalledPlugins();
  const q = query.toLowerCase();
  const entries = plugins.filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q)
  );
  return { entries, total: entries.length, source: MS.CLAUDE_PLUGINS };
}

// ============================================================================
// Source: MCP Registry (official registry.modelcontextprotocol.io)
// ============================================================================

interface McpRegistryServer {
  server: {
    name: string;
    description?: string;
    version?: string;
    repository?: { url?: string; source?: string };
  };
}

async function fetchMcpServers(query: string): Promise<McpRegistryServer[]> {
  const url = query
    ? `${MCP_REGISTRY_URL}/v0.1/servers?q=${encodeURIComponent(query)}&limit=20`
    : `${MCP_REGISTRY_URL}/v0.1/servers?limit=20`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`MCP Registry failed: ${res.statusText}`);
  const data = (await res.json()) as { servers: McpRegistryServer[] };
  return data.servers || [];
}

function mcpServerToEntry(s: McpRegistryServer): MarketplaceEntry {
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

async function searchMcpRegistry(
  query: string
): Promise<MarketplaceSearchResult> {
  const servers = await fetchMcpServers(query);
  const entries = servers.map(mcpServerToEntry);
  return { entries, total: entries.length, source: MS.MCP_REGISTRY };
}

// ============================================================================
// Source: Anthropic Skills (GitHub repo anthropics/skills)
// ============================================================================

async function fetchAnthropicSkillsList(): Promise<string[]> {
  // Skills live under skills/ directory
  const res = await fetch(
    "https://api.github.com/repos/anthropics/skills/git/trees/main?recursive=1",
    { headers: { Accept: "application/vnd.github.v3+json" } }
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { tree: { path: string; type: string }[] };
  const skills: string[] = [];
  for (const t of data.tree) {
    // Match: skills/{name}/SKILL.md
    if (t.type === "blob" && t.path.endsWith("/SKILL.md") && t.path.startsWith("skills/")) {
      const parts = t.path.split("/");
      if (parts.length === 3) {
        skills.push(parts[1]);
      }
    }
  }
  return skills;
}

async function searchAnthropicSkills(
  query: string
): Promise<MarketplaceSearchResult> {
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
// Source: ClawHub (clawhub.ai)
// ============================================================================

interface ClawHubResult {
  slug: string;
  displayName: string;
  summary: string;
  version?: string;
  updatedAt?: number;
  score?: number;
}

async function searchClawHub(
  query: string
): Promise<MarketplaceSearchResult> {
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
// Source: SkillsMP (requires API key — disabled for now)
// ============================================================================

async function searchSkillsmp(
  _query: string
): Promise<MarketplaceSearchResult> {
  // SkillsMP requires an API key (Authorization: Bearer sk_live_xxx)
  // Until API key support is added, return empty results
  return { entries: [], total: 0, source: MS.SKILLSMP };
}

// ============================================================================
// Unified search
// ============================================================================

const KNOWN_SEARCHERS: Record<
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
      case MS.SKILLSMP: {
        return { success: false, error: "SkillsMP requires an API key. Configure it in settings." };
      }
      case MS.OPENSKILLS: {
        const dir = path.join(MYCELIUM_DIR, "skills", entry.name);
        await fs.mkdir(dir, { recursive: true });
        const filePath = path.join(dir, "SKILL.md");
        await fs.writeFile(
          filePath,
          `# ${entry.name}\n\n${entry.description}\n\n> Installed from openskills registry\n`,
          "utf-8"
        );
        return { success: true, path: filePath };
      }
      case MS.CLAUDE_PLUGINS: {
        const cacheDir = path.join(os.homedir(), ".claude", "plugins", "cache");
        const src = path.join(cacheDir, entry.name);
        const dest = path.join(MYCELIUM_DIR, "skills", entry.name);
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.symlink(src, dest);
        return { success: true, path: dest };
      }
      case MS.MCP_REGISTRY: {
        const registryEntry = await getRegistryEntry(entry.name);
        if (!registryEntry) throw new Error(`Entry not found: ${entry.name}`);
        const config = parseRegistryEntry(registryEntry);
        const mcpsPath = path.join(MYCELIUM_DIR, "mcps.yaml");
        const yamlLine = `\n${entry.name}:\n  command: ${config.command}\n  args: [${(config.args || []).map((a) => `"${a}"`).join(", ")}]\n  enabled: true\n`;
        await fs.appendFile(mcpsPath, yamlLine, "utf-8");
        return { success: true, path: mcpsPath };
      }
      case MS.ANTHROPIC_SKILLS: {
        // Skills are under skills/{name}/SKILL.md
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
      case MS.CLAWHUB: {
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
      default:
        return { success: false, error: `Unknown source: ${entry.source}` };
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ============================================================================
// Popular / Browse
// ============================================================================

export async function getPopularSkills(): Promise<MarketplaceSearchResult[]> {
  const results: MarketplaceSearchResult[] = [];

  const fetchers: Array<{ name: string; fn: () => Promise<void> }> = [
    // Anthropic skills
    {
      name: "anthropic-skills",
      fn: async () => {
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
      },
    },
    // Claude plugins (local)
    {
      name: "claude-plugins",
      fn: async () => {
        const plugins = await listInstalledPlugins();
        if (plugins.length > 0) {
          results.push({ entries: plugins.slice(0, 12), total: plugins.length, source: MS.CLAUDE_PLUGINS });
        }
      },
    },
    // MCP Registry
    {
      name: "mcp-registry",
      fn: async () => {
        const servers = await fetchMcpServers("");
        if (servers.length > 0) {
          const entries = servers.slice(0, 12).map(mcpServerToEntry);
          results.push({ entries, total: entries.length, source: MS.MCP_REGISTRY });
        }
      },
    },
    // OpenSkills (npm)
    {
      name: "openskills",
      fn: async () => {
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
      },
    },
    // ClawHub (requires search terms — aggregate broad queries for popular view)
    {
      name: "clawhub",
      fn: async () => {
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
      },
    },
  ];

  // Run all in parallel, swallow individual failures
  const settled = await Promise.allSettled(fetchers.map(f => f.fn()));
  for (let i = 0; i < settled.length; i++) {
    if (settled[i].status === "rejected") {
      console.warn(`${fetchers[i].name} popular fetch failed:`, (settled[i] as PromiseRejectedResult).reason);
    }
  }

  return results;
}

// ============================================================================
// Update
// ============================================================================

export async function updateSkill(
  name: string,
  source: MarketplaceSource
): Promise<{ success: boolean; path?: string; error?: string }> {
  const entry: MarketplaceEntry = {
    name,
    description: "",
    source,
    type: "skill",
  };
  return installFromMarketplace(entry);
}

// ============================================================================
// Claude Plugins reader (v2 format)
// ============================================================================

export async function listInstalledPlugins(): Promise<MarketplaceEntry[]> {
  try {
    const filePath = path.join(
      os.homedir(),
      ".claude",
      "plugins",
      "installed_plugins.json"
    );
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
      // v1 fallback: array
    } | Array<{ name: string; description?: string; version?: string; author?: string }>;

    // v2 format: { version: 2, plugins: { "name@marketplace": [...] } }
    if (!Array.isArray(data) && data.version === 2 && data.plugins) {
      const entries: MarketplaceEntry[] = [];
      for (const [key, installs] of Object.entries(data.plugins)) {
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

    // v1 fallback: plain array
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
