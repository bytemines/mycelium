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
  searchRegistry,
  getRegistryEntry,
  parseRegistryEntry,
} from "./mcp-registry.js";
import { loadMarketplaceRegistry } from "./marketplace-registry.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

const MYCELIUM_DIR = path.join(os.homedir(), ".mycelium", "global");

async function searchSkillsmp(
  query: string
): Promise<MarketplaceSearchResult> {
  const res = await fetch(
    `https://skillsmp.com/api/v1/skills/search?q=${encodeURIComponent(query)}`
  );
  if (!res.ok) throw new Error(`skillsmp search failed: ${res.statusText}`);
  const data = (await res.json()) as {
    skills: { name: string; description: string; author: string; downloads: number }[];
  };
  const entries: MarketplaceEntry[] = data.skills.map((s) => ({
    name: s.name,
    description: s.description,
    author: s.author,
    downloads: s.downloads,
    source: MS.SKILLSMP,
    type: "skill" as const,
  }));
  return { entries, total: entries.length, source: MS.SKILLSMP };
}

async function searchOpenSkills(
  query: string
): Promise<MarketplaceSearchResult> {
  const res = await fetch(
    `https://registry.npmjs.org/-/v1/search?text=openskills+${encodeURIComponent(query)}&size=10`
  );
  if (!res.ok) throw new Error(`openskills search failed: ${res.statusText}`);
  const data = (await res.json()) as {
    objects: { package: { name: string; description: string; author?: { name: string }; version: string } }[];
  };
  const entries: MarketplaceEntry[] = data.objects.map((o) => ({
    name: o.package.name,
    description: o.package.description || "",
    author: o.package.author?.name,
    version: o.package.version,
    source: MS.OPENSKILLS,
    type: "skill" as const,
  }));
  return { entries, total: entries.length, source: MS.OPENSKILLS };
}

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

async function searchMcpRegistry(
  query: string
): Promise<MarketplaceSearchResult> {
  const results = await searchRegistry(query);
  const entries: MarketplaceEntry[] = results.map((r) => ({
    name: r.name,
    description: r.description || "",
    source: MS.MCP_REGISTRY,
    type: "mcp" as const,
  }));
  return { entries, total: entries.length, source: MS.MCP_REGISTRY };
}

async function searchAnthropicSkills(
  query: string
): Promise<MarketplaceSearchResult> {
  // Search Anthropic's official skills repo via GitHub API
  const res = await fetch(
    `https://api.github.com/search/code?q=${encodeURIComponent(query)}+filename:SKILL.md+repo:anthropics/skills`,
    { headers: { Accept: "application/vnd.github.v3+json" } }
  );
  if (!res.ok) {
    // Fallback: list top-level directories as skills
    const treeRes = await fetch(
      "https://api.github.com/repos/anthropics/skills/git/trees/main",
      { headers: { Accept: "application/vnd.github.v3+json" } }
    );
    if (!treeRes.ok) return { entries: [], total: 0, source: MS.ANTHROPIC_SKILLS };
    const tree = (await treeRes.json()) as { tree: { path: string; type: string }[] };
    const q = query.toLowerCase();
    const dirs = tree.tree
      .filter(t => t.type === "tree" && t.path.toLowerCase().includes(q))
      .map(t => ({
        name: t.path,
        description: `Official Anthropic skill: ${t.path}`,
        author: "anthropics",
        source: MS.ANTHROPIC_SKILLS,
        type: "skill" as const,
      }));
    return { entries: dirs, total: dirs.length, source: MS.ANTHROPIC_SKILLS };
  }
  const data = (await res.json()) as {
    items: { path: string; repository: { full_name: string } }[];
  };
  const entries: MarketplaceEntry[] = data.items.map((item) => {
    const skillDir = path.dirname(item.path);
    const name = skillDir === "." ? path.basename(item.path, ".md") : skillDir.split("/").pop() || item.path;
    return {
      name,
      description: `Official Anthropic skill from ${item.path}`,
      author: "anthropics",
      source: MS.ANTHROPIC_SKILLS,
      type: "skill" as const,
    };
  });
  // Deduplicate by name
  const seen = new Set<string>();
  const unique = entries.filter(e => {
    if (seen.has(e.name)) return false;
    seen.add(e.name);
    return true;
  });
  return { entries: unique, total: unique.length, source: MS.ANTHROPIC_SKILLS };
}

async function searchClawHub(
  query: string
): Promise<MarketplaceSearchResult> {
  const res = await fetch(
    `https://clawhub.ai/api/v1/search?q=${encodeURIComponent(query)}&limit=12`,
    { headers: { Accept: "application/json" } }
  );
  if (!res.ok) throw new Error(`ClawHub search failed: ${res.statusText}`);
  const data = (await res.json()) as {
    items: { name: string; description: string; author?: string; type?: string; downloads?: number; stars?: number; version?: string }[];
  };
  const entries: MarketplaceEntry[] = data.items.map((item) => ({
    name: item.name,
    description: item.description || "",
    author: item.author,
    downloads: item.downloads,
    stars: item.stars,
    version: item.version,
    latestVersion: item.version,
    source: MS.CLAWHUB,
    type: (item.type as MarketplaceEntry["type"]) || "skill",
  }));
  return { entries, total: entries.length, source: MS.CLAWHUB };
}

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
    .map((r) => r.value);
}

export async function installFromMarketplace(
  entry: MarketplaceEntry
): Promise<{ success: boolean; path?: string; error?: string }> {
  try {
    switch (entry.source) {
      case MS.SKILLSMP: {
        const res = await fetch(
          `https://skillsmp.com/api/v1/skills/${encodeURIComponent(entry.name)}/download`
        );
        if (!res.ok) throw new Error(`Download failed: ${res.statusText}`);
        const content = await res.text();
        const dir = path.join(MYCELIUM_DIR, "skills", entry.name);
        await fs.mkdir(dir, { recursive: true });
        const filePath = path.join(dir, "SKILL.md");
        await fs.writeFile(filePath, content, "utf-8");
        return { success: true, path: filePath };
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
        // Download SKILL.md from Anthropic's GitHub repo
        const rawUrl = `https://raw.githubusercontent.com/anthropics/skills/main/${encodeURIComponent(entry.name)}/SKILL.md`;
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

export async function getPopularSkills(): Promise<MarketplaceSearchResult[]> {
  const results: MarketplaceSearchResult[] = [];

  // SkillsMP popular
  try {
    const res = await fetch("https://skillsmp.com/api/v1/skills/search?q=&sort=downloads&limit=12");
    if (res.ok) {
      const data = (await res.json()) as {
        skills: { name: string; description: string; author: string; downloads: number; stars?: number; category?: string; version?: string }[];
      };
      const entries: MarketplaceEntry[] = data.skills.map((s) => ({
        name: s.name,
        description: s.description,
        author: s.author,
        downloads: s.downloads,
        stars: s.stars,
        category: s.category,
        version: s.version,
        latestVersion: s.version,
        source: MS.SKILLSMP,
        type: "skill" as const,
      }));
      results.push({ entries, total: entries.length, source: MS.SKILLSMP });
    }
  } catch (e) { console.warn("SkillsMP popular fetch failed:", e); }

  // Anthropic skills (list all from repo tree)
  try {
    const treeRes = await fetch(
      "https://api.github.com/repos/anthropics/skills/git/trees/main",
      { headers: { Accept: "application/vnd.github.v3+json" } }
    );
    if (treeRes.ok) {
      const tree = (await treeRes.json()) as { tree: { path: string; type: string }[] };
      const entries: MarketplaceEntry[] = tree.tree
        .filter((t) => t.type === "tree" && !t.path.startsWith("."))
        .slice(0, 12)
        .map((t) => ({
          name: t.path,
          description: `Official Anthropic skill: ${t.path}`,
          author: "anthropics",
          source: MS.ANTHROPIC_SKILLS,
          type: "skill" as const,
        }));
      results.push({ entries, total: entries.length, source: MS.ANTHROPIC_SKILLS });
    }
  } catch (e) { console.warn("Anthropic skills fetch failed:", e); }

  // Claude plugins (local installed)
  try {
    const plugins = await listInstalledPlugins();
    if (plugins.length > 0) {
      results.push({ entries: plugins.slice(0, 6), total: plugins.length, source: MS.CLAUDE_PLUGINS });
    }
  } catch (e) { console.warn("Claude plugins list failed:", e); }

  // MCP Registry popular
  try {
    const mcpResults = await searchRegistry("");
    if (mcpResults.length > 0) {
      const entries: MarketplaceEntry[] = mcpResults.slice(0, 12).map((r) => ({
        name: r.name,
        description: r.description || "",
        source: MS.MCP_REGISTRY,
        type: "mcp" as const,
      }));
      results.push({ entries, total: entries.length, source: MS.MCP_REGISTRY });
    }
  } catch (e) { console.warn("MCP Registry popular fetch failed:", e); }

  // OpenSkills popular (npm)
  try {
    const res = await fetch("https://registry.npmjs.org/-/v1/search?text=openskills&size=12");
    if (res.ok) {
      const data = (await res.json()) as {
        objects: { package: { name: string; description: string; author?: { name: string }; version: string }; score?: { detail?: { popularity?: number } } }[];
      };
      const entries: MarketplaceEntry[] = data.objects.map((o) => ({
        name: o.package.name,
        description: o.package.description || "",
        author: o.package.author?.name,
        version: o.package.version,
        latestVersion: o.package.version,
        source: MS.OPENSKILLS,
        type: "skill" as const,
      }));
      results.push({ entries, total: entries.length, source: MS.OPENSKILLS });
    }
  } catch (e) { console.warn("OpenSkills popular fetch failed:", e); }

  // ClawHub popular
  try {
    const res = await fetch("https://clawhub.ai/api/v1/search?q=&sort=popular&limit=12",
      { headers: { Accept: "application/json" } });
    if (res.ok) {
      const data = (await res.json()) as {
        items: { name: string; description: string; author?: string; type?: string; downloads?: number; stars?: number; version?: string }[];
      };
      const entries: MarketplaceEntry[] = data.items.map((item) => ({
        name: item.name,
        description: item.description || "",
        author: item.author,
        downloads: item.downloads,
        stars: item.stars,
        version: item.version,
        latestVersion: item.version,
        source: MS.CLAWHUB,
        type: (item.type as MarketplaceEntry["type"]) || "skill",
      }));
      results.push({ entries, total: entries.length, source: MS.CLAWHUB });
    }
  } catch (e) { console.warn("ClawHub popular fetch failed:", e); }

  return results;
}

export async function updateSkill(
  name: string,
  source: MarketplaceSource
): Promise<{ success: boolean; path?: string; error?: string }> {
  // Re-download skill to get latest version (same as install, overwrites existing)
  const entry: MarketplaceEntry = {
    name,
    description: "",
    source,
    type: "skill",
  };
  return installFromMarketplace(entry);
}

export async function listInstalledPlugins(): Promise<MarketplaceEntry[]> {
  try {
    const filePath = path.join(
      os.homedir(),
      ".claude",
      "plugins",
      "installed_plugins.json"
    );
    const raw = await fs.readFile(filePath, "utf-8");
    const plugins = JSON.parse(raw) as {
      name: string;
      description?: string;
      version?: string;
      author?: string;
    }[];
    return plugins.map((p) => ({
      name: p.name,
      description: p.description || "",
      version: p.version,
      author: p.author,
      source: MS.CLAUDE_PLUGINS,
      type: "skill" as const,
    }));
  } catch (e) {
    console.warn("Failed to read installed plugins:", e);
    return [];
  }
}
