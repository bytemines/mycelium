/**
 * Marketplace — search and install skills/MCPs from multiple sources
 */
import type {
  MarketplaceEntry,
  MarketplaceSearchResult,
  MarketplaceSource,
} from "@mycelium/core";
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
    source: "skillsmp",
    type: "skill" as const,
  }));
  return { entries, total: entries.length, source: "skillsmp" };
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
    source: "openskills",
    type: "skill" as const,
  }));
  return { entries, total: entries.length, source: "openskills" };
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
  return { entries, total: entries.length, source: "claude-plugins" };
}

async function searchMcpRegistry(
  query: string
): Promise<MarketplaceSearchResult> {
  const results = await searchRegistry(query);
  const entries: MarketplaceEntry[] = results.map((r) => ({
    name: r.name,
    description: r.description || "",
    source: "mcp-registry",
    type: "mcp" as const,
  }));
  return { entries, total: entries.length, source: "mcp-registry" };
}

const KNOWN_SEARCHERS: Record<
  string,
  (q: string) => Promise<MarketplaceSearchResult>
> = {
  skillsmp: searchSkillsmp,
  openskills: searchOpenSkills,
  "claude-plugins": searchClaudePlugins,
  "mcp-registry": searchMcpRegistry,
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
      case "skillsmp": {
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
      case "openskills": {
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
      case "claude-plugins": {
        const cacheDir = path.join(os.homedir(), ".claude", "plugins", "cache");
        const src = path.join(cacheDir, entry.name);
        const dest = path.join(MYCELIUM_DIR, "skills", entry.name);
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.symlink(src, dest);
        return { success: true, path: dest };
      }
      case "mcp-registry": {
        const registryEntry = await getRegistryEntry(entry.name);
        if (!registryEntry) throw new Error(`Entry not found: ${entry.name}`);
        const config = parseRegistryEntry(registryEntry);
        const mcpsPath = path.join(MYCELIUM_DIR, "mcps.yaml");
        const yamlLine = `\n${entry.name}:\n  command: ${config.command}\n  args: [${(config.args || []).map((a) => `"${a}"`).join(", ")}]\n  enabled: true\n`;
        await fs.appendFile(mcpsPath, yamlLine, "utf-8");
        return { success: true, path: mcpsPath };
      }
      default:
        return { success: false, error: `Unknown source: ${entry.source}` };
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
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
      source: "claude-plugins" as const,
      type: "skill" as const,
    }));
  } catch {
    return [];
  }
}
