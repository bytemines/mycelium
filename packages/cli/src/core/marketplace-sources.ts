/**
 * marketplace-sources — individual marketplace search/fetch implementations
 *
 * Extracted from marketplace.ts to keep functions under 60 lines.
 */
import type { MarketplaceEntry, MarketplaceSearchResult } from "@mycelish/core";
import { MARKETPLACE_SOURCES as MS } from "@mycelish/core";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { cachedFetch, type CacheOptions } from "./marketplace-cache.js";
import { computeContentHash } from "./content-hash.js";
import {
  MARKETPLACE_FETCH_LIMIT,
  TIMEOUT_GITHUB,
  TIMEOUT_UNGH,
  TIMEOUT_NPM,
  TIMEOUT_GLAMA,
  BATCH_NPM,
  BATCH_GITHUB,
} from "./marketplace-constants.js";

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
    };

    if (data.version === 2 && data.plugins) {
      return parseV2Plugins(data.plugins);
    }

    return [];
  } catch (e: unknown) {
    if (e && typeof e === "object" && (e as { code?: string }).code !== "ENOENT") {
      // Non-critical warning — skip logging to avoid noise
    }
    return [];
  }
}

/** Pure parser — no filtering. Visibility policy is handled by getLivePluginState. */
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
      installedVersion: latest.version,
      installed: true,
      updatedAt: latest.lastUpdated ? new Date(latest.lastUpdated).toISOString().slice(0, 10) : undefined,
      source: MS.CLAUDE_PLUGINS,
      type: "plugin" as const,
      category: marketplace,
    });
  }
  return entries;
}

export async function searchClaudePlugins(query: string): Promise<MarketplaceSearchResult> {
  const plugins = await listInstalledPlugins();
  await enrichPluginsWithLatestVersions(plugins);
  const q = query.toLowerCase();
  const entries = plugins.filter(
    (p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)
  );
  return { entries, total: entries.length, source: MS.CLAUDE_PLUGINS };
}

/**
 * Enrich installed plugins with latest versions from their marketplace repos.
 * Reads known_marketplaces.json → fetches marketplace.json from GitHub → extracts latest versions.
 */
export async function enrichPluginsWithLatestVersions(plugins: MarketplaceEntry[]): Promise<void> {
  try {
    const knownPath = path.join(os.homedir(), ".claude", "plugins", "known_marketplaces.json");
    const raw = await fs.readFile(knownPath, "utf-8");
    const known = JSON.parse(raw) as Record<string, {
      source?: { source?: string; repo?: string };
    }>;

    // Build a map: marketplace name → GitHub owner/repo
    const repoMap = new Map<string, { owner: string; repo: string }>();
    for (const [name, info] of Object.entries(known)) {
      if (info.source?.source === "github" && info.source.repo) {
        const parts = info.source.repo.split("/");
        if (parts.length === 2) repoMap.set(name, { owner: parts[0], repo: parts[1] });
      }
    }
    if (repoMap.size === 0) return;

    // Fetch marketplace.json from each GitHub repo (cached)
    // Track per-marketplace: plugin name → { version, url }
    interface PluginMeta { version?: string; url?: string }
    const marketplacePlugins = new Map<string, Map<string, PluginMeta>>();
    const fetches = [...repoMap.entries()].map(async ([marketplace, { owner, repo }]) => {
      try {
        const data = await cachedFetch(`plugin-meta-${marketplace}`, async () => {
          const headers: Record<string, string> = {};
          const ghToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
          if (ghToken) headers.Authorization = `Bearer ${ghToken}`;
          const res = await fetch(
            `https://raw.githubusercontent.com/${owner}/${repo}/main/.claude-plugin/marketplace.json`,
            { headers, signal: AbortSignal.timeout(TIMEOUT_GITHUB) },
          );
          if (!res.ok) return { plugins: [] as Array<{ name: string; version?: string; source?: { url?: string } }> };
          return (await res.json()) as { plugins?: Array<{ name: string; version?: string; source?: { source?: string; url?: string } }> };
        });
        const meta = new Map<string, PluginMeta>();
        for (const p of data.plugins ?? []) {
          if (!p.name) continue;
          // Extract the actual plugin repo URL from the source field
          let pluginUrl: string | undefined;
          if (p.source?.url) {
            pluginUrl = p.source.url.replace(/\.git$/, "");
          }
          meta.set(p.name, { version: p.version, url: pluginUrl });
        }
        marketplacePlugins.set(marketplace, meta);
      } catch {
        // Non-critical
      }
    });
    await Promise.allSettled(fetches);

    // Enrich entries with latest versions and correct plugin URLs
    for (const plugin of plugins) {
      const mpName = plugin.category;
      const mpMeta = mpName ? marketplacePlugins.get(mpName) : undefined;
      const meta = mpMeta?.get(plugin.name)
        ?? [...marketplacePlugins.values()].find(m => m.has(plugin.name))?.get(plugin.name);
      if (meta?.version) plugin.latestVersion = meta.version;
      // Use the actual plugin repo URL, not the marketplace repo
      if (!plugin.url && meta?.url) {
        plugin.url = meta.url;
      }
      // Fallback: marketplace repo if no per-plugin URL
      if (!plugin.url && mpName && repoMap.has(mpName)) {
        const { owner, repo } = repoMap.get(mpName)!;
        plugin.url = `https://github.com/${owner}/${repo}`;
      }
    }
  } catch {
    // known_marketplaces.json missing or unreadable — skip
  }
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
    websiteUrl?: string;
    packages?: { registryType?: string; identifier?: string }[];
  };
}

const MCP_REGISTRY_URL = "https://registry.modelcontextprotocol.io";

export async function fetchMcpServers(query: string): Promise<McpRegistryServer[]> {
  const url = query
    ? `${MCP_REGISTRY_URL}/v0.1/servers?search=${encodeURIComponent(query)}&limit=${MARKETPLACE_FETCH_LIMIT}`
    : `${MCP_REGISTRY_URL}/v0.1/servers?limit=${MARKETPLACE_FETCH_LIMIT}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`MCP Registry failed: ${res.statusText}`);
  const data = (await res.json()) as { servers: McpRegistryServer[] };
  return data.servers || [];
}

export function mcpServerToEntry(s: McpRegistryServer): MarketplaceEntry {
  const srv = s.server;
  const url = srv.repository?.url || srv.websiteUrl || undefined;
  const npmPkg = srv.packages?.find(p => p.registryType === "npm")?.identifier;
  return {
    name: srv.name,
    description: srv.description || "",
    version: srv.version,
    latestVersion: srv.version,
    source: MS.MCP_REGISTRY,
    type: "mcp" as const,
    url,
    npmPackage: npmPkg,
  };
}

export async function searchMcpRegistry(query: string, options?: CacheOptions): Promise<MarketplaceSearchResult> {
  const servers = query
    ? await fetchMcpServers(query)  // user search: live
    : await cachedFetch("mcp-registry", () => fetchMcpServers(""), options);  // browse: cached
  const entries = servers.map(mcpServerToEntry);
  return { entries, total: entries.length, source: MS.MCP_REGISTRY };
}

// ============================================================================
// Glama MCP Registry (https://glama.ai/api/mcp/v1/servers)
// ============================================================================

interface GlamaServer {
  id: string;
  name: string;
  namespace?: string;
  slug?: string;
  description?: string;
  repository?: { url?: string };
  url?: string;
  attributes?: string[];
  spdxLicense?: { name?: string };
}

const GLAMA_API = "https://glama.ai/api/mcp/v1/servers";

export async function fetchGlamaServers(query: string): Promise<GlamaServer[]> {
  const params = new URLSearchParams({ limit: String(MARKETPLACE_FETCH_LIMIT) });
  if (query) params.set("query", query);
  const res = await fetch(`${GLAMA_API}?${params}`, { signal: AbortSignal.timeout(TIMEOUT_GLAMA) });
  if (!res.ok) throw new Error(`Glama API failed: ${res.statusText}`);
  const data = (await res.json()) as { servers: GlamaServer[] };
  return data.servers || [];
}

export function glamaServerToEntry(s: GlamaServer): MarketplaceEntry {
  return {
    name: s.name,
    description: s.description || "",
    source: MS.GLAMA,
    type: "mcp" as const,
    url: s.repository?.url || s.url || undefined,
  };
}

export async function searchGlama(query: string, options?: CacheOptions): Promise<MarketplaceSearchResult> {
  const servers = query
    ? await fetchGlamaServers(query)
    : await cachedFetch("glama", () => fetchGlamaServers(""), options);
  const entries = servers.map(glamaServerToEntry);
  return { entries, total: entries.length, source: MS.GLAMA };
}

// ============================================================================
// GitHub tree (uses cachedFetch for L1+L2 caching)
// ============================================================================

async function fetchGitHubTree(owner: string, repo: string, options?: CacheOptions): Promise<{ path: string; type: string }[]> {
  return cachedFetch(`github-${owner}-${repo}`, async () => {
    const headers: Record<string, string> = { Accept: "application/vnd.github.v3+json" };
    const ghToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    if (ghToken) headers.Authorization = `Bearer ${ghToken}`;

    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/main?recursive=1`,
      { headers }
    );
    if (!res.ok) {
      const hint = res.status === 403 ? " (rate limited — try again later or set GITHUB_TOKEN)" : "";
      throw new Error(`GitHub API ${res.status} for ${owner}/${repo}${hint}`);
    }
    const body = (await res.json()) as { tree: { path: string; type: string }[] };
    return body.tree;
  }, options);
}

// ============================================================================
// Anthropic Skills (GitHub)
// ============================================================================

export async function fetchAnthropicSkillsList(options?: CacheOptions): Promise<string[]> {
  const tree = await fetchGitHubTree("anthropics", "skills", options);
  const skills: string[] = [];
  for (const t of tree) {
    if (t.type === "blob" && t.path.endsWith("/SKILL.md") && t.path.startsWith("skills/")) {
      const parts = t.path.split("/");
      if (parts.length === 3) skills.push(parts[1]);
    }
  }
  return skills;
}

export async function searchAnthropicSkills(query: string, options?: CacheOptions): Promise<MarketplaceSearchResult> {
  const [allSkills, stars] = await Promise.all([
    fetchAnthropicSkillsList(options),
    fetchGitHubRepoStars("anthropics", "skills", options),
  ]);
  const q = query.toLowerCase();
  const filtered = q ? allSkills.filter(s => s.toLowerCase().includes(q)) : allSkills;
  const entries: MarketplaceEntry[] = filtered.map(name => ({
    name,
    description: `Official Anthropic skill: ${name}`,
    author: "anthropics",
    source: MS.ANTHROPIC_SKILLS,
    type: "skill" as const,
    stars,
    url: `https://github.com/anthropics/skills/tree/main/skills/${name}`,
  }));
  return { entries, total: entries.length, source: MS.ANTHROPIC_SKILLS };
}

// ============================================================================
// Generic GitHub Repo
// ============================================================================

export interface GitHubRepoItem {
  name: string;
  type: "skill" | "agent" | "command";
  path: string;
  description?: string;
}

/**
 * Parse a github.com URL into owner/repo.
 * Returns null if not a GitHub URL.
 */
const GITHUB_NAME_RE = /^[a-zA-Z0-9._-]+$/;

export function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const m = url.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!m) return null;
  const owner = m[1];
  const repo = m[2].replace(/\.git$/, "");
  if (!GITHUB_NAME_RE.test(owner) || !GITHUB_NAME_RE.test(repo)) return null;
  return { owner, repo };
}

/**
 * Search a GitHub repo for skills, agents, and commands.
 * Uses the recursive tree endpoint (same pattern as fetchAnthropicSkillsList).
 */
async function fetchGitHubRepoStars(owner: string, repo: string, options?: CacheOptions): Promise<number | undefined> {
  try {
    const data = await cachedFetch(`github-stars-${owner}-${repo}`, async () => {
      // Tier 1: ungh.cc — free, no auth, no rate limit
      try {
        const unghRes = await fetch(`https://ungh.cc/repos/${owner}/${repo}`, { signal: AbortSignal.timeout(TIMEOUT_UNGH) });
        if (unghRes.ok) {
          const json = (await unghRes.json()) as { repo?: { stars?: number } };
          if (json.repo?.stars != null) return { stars: json.repo.stars };
        }
      } catch {
        // Fall through to GitHub API
      }

      // Tier 2/3: GitHub API (with token if available, unauth otherwise)
      const headers: Record<string, string> = { Accept: "application/vnd.github.v3+json" };
      const ghToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
      if (ghToken) headers.Authorization = `Bearer ${ghToken}`;
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers, signal: AbortSignal.timeout(TIMEOUT_GITHUB) });
      if (!res.ok) throw new Error(`GitHub API ${res.status} for ${owner}/${repo}`);
      const json = (await res.json()) as { stargazers_count?: number };
      return { stars: json.stargazers_count };
    }, options);
    return data.stars;
  } catch {
    return undefined;
  }
}

export async function searchGitHubRepo(
  owner: string,
  repo: string,
  query: string,
  sourceName: string,
  options?: CacheOptions,
): Promise<MarketplaceSearchResult> {
  const [items, stars] = await Promise.all([
    fetchGitHubRepoItems(owner, repo, options),
    fetchGitHubRepoStars(owner, repo, options),
  ]);
  const q = query.toLowerCase();
  const filtered = q
    ? items.filter(i => i.name.toLowerCase().includes(q) || (i.description?.toLowerCase().includes(q) ?? false))
    : items;
  const entries: MarketplaceEntry[] = filtered.map(item => ({
    name: item.name,
    description: item.description || `${item.type} from ${owner}/${repo}`,
    author: owner,
    source: sourceName,
    type: item.type,
    stars,
    url: `https://github.com/${owner}/${repo}/tree/main/${item.path}`,
  }));

  // If the repo has multiple item types, add a plugin entry representing the whole repo
  const types = new Set(items.map(i => i.type));
  if (types.size > 1 && (!q || repo.toLowerCase().includes(q) || owner.toLowerCase().includes(q))) {
    const counts = [...types].map(t => `${items.filter(i => i.type === t).length} ${t}s`).join(", ");
    entries.unshift({
      name: repo,
      description: `Plugin bundle: ${counts}`,
      author: owner,
      source: sourceName,
      type: "plugin",
      stars,
      url: `https://github.com/${owner}/${repo}`,
    });
  }

  return { entries, total: entries.length, source: sourceName };
}

/**
 * Fetch all items (skills, agents, commands) from a GitHub repo tree.
 */
export async function fetchGitHubRepoItems(owner: string, repo: string, options?: CacheOptions): Promise<GitHubRepoItem[]> {
  const tree = await fetchGitHubTree(owner, repo, options);
  const items: GitHubRepoItem[] = [];
  const dirMap: Record<string, "skill" | "agent" | "command"> = {
    skills: "skill",
    agents: "agent",
    commands: "command",
  };
  for (const t of tree) {
    if (t.type !== "blob") continue;
    for (const [dir, itemType] of Object.entries(dirMap)) {
      if (t.path.startsWith(`${dir}/`) && t.path.endsWith(".md")) {
        const parts = t.path.split("/");
        // skills/name/SKILL.md (depth 3) or agents/name.md (depth 2)
        let name: string | undefined;
        if (itemType === "skill" && parts.length === 3 && parts[2] === "SKILL.md") {
          name = parts[1];
        } else if (itemType !== "skill" && parts.length === 2) {
          name = parts[1].replace(/\.md$/, "");
        }
        if (name) {
          items.push({ name, type: itemType, path: t.path });
        }
      }
    }
  }
  return items;
}

/**
 * Install an item from a GitHub repo by downloading its raw content.
 */
export async function installGitHubRepoItem(
  owner: string,
  repo: string,
  entry: MarketplaceEntry
): Promise<{ success: boolean; path?: string; error?: string; contentHash?: string }> {
  const itemType = entry.type as "skill" | "agent" | "command";
  let remotePath: string;
  let localDir: string;
  let fileName: string;
  const globalDir = path.join(os.homedir(), ".mycelium", "global");

  if (itemType === "skill") {
    remotePath = `skills/${encodeURIComponent(entry.name)}/SKILL.md`;
    localDir = path.join(globalDir, "skills", entry.name);
    fileName = "SKILL.md";
  } else if (itemType === "agent") {
    remotePath = `agents/${encodeURIComponent(entry.name)}.md`;
    localDir = path.join(globalDir, "agents");
    fileName = `${entry.name}.md`;
  } else {
    remotePath = `commands/${encodeURIComponent(entry.name)}.md`;
    localDir = path.join(globalDir, "commands");
    fileName = `${entry.name}.md`;
  }

  const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/${remotePath}`;
  const ghRes = await fetch(rawUrl);
  if (!ghRes.ok) throw new Error(`Download failed: ${ghRes.statusText}`);
  const content = await ghRes.text();
  await fs.mkdir(localDir, { recursive: true });
  const filePath = path.join(localDir, fileName);
  await fs.writeFile(filePath, content, "utf-8");
  return { success: true, path: filePath, contentHash: computeContentHash(content) };
}

// ============================================================================
// npm Download Enrichment
// ============================================================================

/**
 * Enrich marketplace entries with npm weekly download counts.
 * Tries the entry name as an npm package name (works for most MCP servers).
 * Uses cachedFetch to avoid redundant API calls.
 */
export async function enrichWithNpmDownloads(entries: MarketplaceEntry[]): Promise<void> {
  // Only enrich MCP-type entries (not plugins — plugin names don't match npm packages)
  const candidates = entries.filter(e => e.downloads == null && e.type === "mcp");
  if (candidates.length === 0) return;

  // Batch: max BATCH_NPM concurrent
  const batch = candidates.slice(0, BATCH_NPM);
  await Promise.allSettled(
    batch.map(async (entry) => {
      try {
        // Use the npm package name — for scoped names like @modelcontextprotocol/server-*
        // the entry name is usually the npm package name for MCP entries
        const pkgName = entry.name;
        const data = await cachedFetch(`npm-dl-${pkgName}`, async () => {
          // First verify the package exists and is MCP-related (check keywords)
          const metaRes = await fetch(
            `https://registry.npmjs.org/${encodeURIComponent(pkgName)}`,
            { signal: AbortSignal.timeout(TIMEOUT_NPM), headers: { Accept: "application/vnd.npm.install-v1+json" } },
          );
          if (!metaRes.ok) return { downloads: undefined as number | undefined };
          const meta = (await metaRes.json()) as { keywords?: string[]; description?: string };
          // Validate it's actually an MCP package (description or keywords mention "mcp")
          const desc = (meta.description || "").toLowerCase();
          const kw = (meta.keywords || []).join(" ").toLowerCase();
          if (!desc.includes("mcp") && !kw.includes("mcp") && !desc.includes("model context protocol")) {
            return { downloads: undefined };
          }
          const dlRes = await fetch(
            `https://api.npmjs.org/downloads/point/last-week/${encodeURIComponent(pkgName)}`,
            { signal: AbortSignal.timeout(TIMEOUT_NPM) },
          );
          if (!dlRes.ok) return { downloads: undefined };
          const json = (await dlRes.json()) as { downloads?: number };
          return { downloads: json.downloads };
        });
        if (data.downloads != null && data.downloads > 0) {
          entry.downloads = data.downloads;
        }
      } catch {
        // Non-critical
      }
    })
  );
}

// ============================================================================
// GitHub Stars Enrichment (for entries with GitHub URLs)
// ============================================================================

/**
 * Resolve a GitHub URL from an npm package name via the npm registry.
 * Returns a github.com URL or undefined.
 */
async function resolveGitHubUrlFromNpm(pkg: string): Promise<string | undefined> {
  try {
    const data = await cachedFetch(`npm-repo-${pkg}`, async () => {
      const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(pkg)}`, { signal: AbortSignal.timeout(TIMEOUT_NPM) });
      if (!res.ok) throw new Error(`npm ${res.status}`);
      const json = (await res.json()) as { repository?: { url?: string } | string };
      const repoUrl = typeof json.repository === "string" ? json.repository : json.repository?.url;
      return { repoUrl: repoUrl || null };
    });
    if (data.repoUrl && data.repoUrl.includes("github.com")) {
      // Normalize git+https://github.com/foo/bar.git → https://github.com/foo/bar
      return data.repoUrl.replace(/^git\+/, "").replace(/\.git$/, "");
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Enrich marketplace entries with GitHub star counts.
 * For entries without a GitHub URL but with an npm package, resolves the repo via npm first.
 * Uses ungh.cc → GitHub API (token) → GitHub API (unauth) priority chain.
 */
export async function enrichWithGitHubStars(entries: MarketplaceEntry[]): Promise<void> {
  // Phase 1: resolve GitHub URLs from npm packages for entries missing a GitHub URL
  const needsNpmResolve = entries.filter(e => e.stars == null && e.npmPackage && (!e.url || !e.url.includes("github.com")));
  if (needsNpmResolve.length > 0) {
    await Promise.allSettled(needsNpmResolve.map(async (entry) => {
      const ghUrl = await resolveGitHubUrlFromNpm(entry.npmPackage!);
      if (ghUrl) entry.url = ghUrl;
    }));
  }

  // Phase 2: enrich with stars
  const needsStars = entries.filter(e => e.url && e.stars == null && e.url.includes("github.com"));
  if (needsStars.length === 0) return;

  // Extract owner/repo from URL, dedupe repos
  const repoMap = new Map<string, MarketplaceEntry[]>();
  for (const entry of needsStars) {
    const parsed = parseGitHubUrl(entry.url!);
    if (!parsed) continue;
    const key = `${parsed.owner}/${parsed.repo}`;
    if (!repoMap.has(key)) repoMap.set(key, []);
    repoMap.get(key)!.push(entry);
  }

  // Fetch stars in parallel (max BATCH_GITHUB repos per batch to be polite)
  const repos = [...repoMap.entries()].slice(0, BATCH_GITHUB);
  await Promise.allSettled(
    repos.map(async ([repo, repoEntries]) => {
      try {
        const [owner, repoName] = repo.split("/");
        const stars = await fetchGitHubRepoStars(owner, repoName);
        if (stars != null) {
          for (const entry of repoEntries) entry.stars = stars;
        }
      } catch {
        // Non-critical — skip enrichment for failed repos
      }
    })
  );
}

// ============================================================================
// Searcher map
// ============================================================================

export const KNOWN_SEARCHERS: Record<
  string,
  (q: string, options?: CacheOptions) => Promise<MarketplaceSearchResult>
> = {
  [MS.CLAUDE_PLUGINS]: searchClaudePlugins,
  [MS.MCP_REGISTRY]: searchMcpRegistry,
  [MS.GLAMA]: searchGlama,
  [MS.ANTHROPIC_SKILLS]: searchAnthropicSkills,
};
