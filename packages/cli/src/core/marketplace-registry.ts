/**
 * Marketplace Registry — manage marketplace sources and plugin discovery
 */
import type { MarketplaceConfig, PluginInfo } from "@mycelish/core";
import { MARKETPLACE_SOURCES as MS } from "@mycelish/core";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { parse as yamlParse, stringify as yamlStringify } from "yaml";
import { MYCELIUM_HOME } from "./fs-helpers.js";

const MYCELIUM_DIR = MYCELIUM_HOME;
const REGISTRY_PATH = path.join(MYCELIUM_DIR, "marketplaces.yaml");
const CLAUDE_PLUGINS_DIR = path.join(os.homedir(), ".claude", "plugins");

// ============================================================================
// YAML helpers (using `yaml` package)
// ============================================================================

function parseRegistryYaml(
  text: string
): Record<string, Record<string, string | boolean>> {
  const doc = yamlParse(text) as { marketplaces?: Record<string, Record<string, string | boolean>> } | null;
  return doc?.marketplaces ?? {};
}

function serializeRegistryYaml(
  registry: Record<string, MarketplaceConfig>
): string {
  return yamlStringify({ marketplaces: registry });
}

// ============================================================================
// Registry loading/saving
// ============================================================================

export async function discoverMarketplaces(): Promise<
  Record<string, MarketplaceConfig>
> {
  const discovered: Record<string, MarketplaceConfig> = {};

  try {
    const installedPath = path.join(CLAUDE_PLUGINS_DIR, "installed_plugins.json");
    const raw = await fs.readFile(installedPath, "utf-8");
    const plugins = JSON.parse(raw) as Array<{
      name: string;
      marketplace?: string;
    }>;

    const marketplaces = new Set<string>();
    for (const p of plugins) {
      if (p.marketplace) {
        marketplaces.add(p.marketplace);
      }
    }

    for (const mp of marketplaces) {
      discovered[mp] = {
        type: "claude-marketplace",
        enabled: true,
        discovered: true,
      };
    }

    // Also add claude-plugins as a local source if plugins exist
    if (plugins.length > 0) {
      discovered[MS.CLAUDE_PLUGINS] = {
        type: "local",
        enabled: true,
        default: true,
        discovered: true,
      };
    }
  } catch {
    // No installed plugins file
  }

  return discovered;
}

export async function loadMarketplaceRegistry(): Promise<
  Record<string, MarketplaceConfig>
> {
  // Start with defaults
  const registry: Record<string, MarketplaceConfig> = {
    [MS.CLAUDE_PLUGINS]: {
      type: "local",
      enabled: true,
      default: true,
      description: "Locally installed Claude plugins",
    },
    [MS.MCP_REGISTRY]: {
      type: "remote",
      enabled: true,
      url: "https://registry.modelcontextprotocol.io",
      description: "Official MCP Registry",
    },
    [MS.GLAMA]: {
      type: "remote",
      enabled: true,
      url: "https://glama.ai/api/mcp/v1/servers",
      description: "Glama MCP Directory",
    },
    [MS.ANTHROPIC_SKILLS]: {
      type: "remote",
      enabled: true,
      url: "https://github.com/anthropics/skills",
      description: "Official Anthropic skills",
    },
    "awesome-mcp-servers": {
      type: "remote",
      enabled: true,
      url: "https://github.com/punkpeye/awesome-mcp-servers",
      description: "Awesome MCP Servers collection",
    },
  };

  // Load saved config
  try {
    const raw = await fs.readFile(REGISTRY_PATH, "utf-8");
    const parsed = parseRegistryYaml(raw);
    for (const [name, props] of Object.entries(parsed)) {
      registry[name] = {
        type: (props.type as MarketplaceConfig["type"]) || "remote",
        enabled: props.enabled !== false,
        default: props.default === true ? true : undefined,
        url: typeof props.url === "string" ? props.url : undefined,
        description:
          typeof props.description === "string" ? props.description : undefined,
        discovered:
          props.discovered === true ? true : undefined,
      };
    }
  } catch {
    // No saved registry
  }

  // Merge auto-discovered
  const discovered = await discoverMarketplaces();
  for (const [name, config] of Object.entries(discovered)) {
    if (!registry[name]) {
      registry[name] = config;
    }
  }

  return registry;
}

export async function saveMarketplaceRegistry(
  registry: Record<string, MarketplaceConfig>
): Promise<void> {
  await fs.mkdir(MYCELIUM_DIR, { recursive: true });
  const yaml = serializeRegistryYaml(registry);
  await fs.writeFile(REGISTRY_PATH, yaml, "utf-8");
}

export async function addMarketplace(
  name: string,
  config: MarketplaceConfig
): Promise<void> {
  const registry = await loadMarketplaceRegistry();
  registry[name] = config;
  await saveMarketplaceRegistry(registry);
}

export async function removeMarketplace(name: string): Promise<void> {
  const registry = await loadMarketplaceRegistry();
  delete registry[name];
  await saveMarketplaceRegistry(registry);
}

// ============================================================================
// Plugin discovery
// ============================================================================

export async function listPlugins(
  marketplace?: string
): Promise<PluginInfo[]> {
  const plugins: PluginInfo[] = [];

  try {
    const cacheDir = path.join(CLAUDE_PLUGINS_DIR, "cache");
    const marketplaceDirs = await fs.readdir(cacheDir);

    for (const mpDir of marketplaceDirs) {
      if (marketplace && mpDir !== marketplace) continue;
      const mpPath = path.join(cacheDir, mpDir);
      const mpStat = await fs.stat(mpPath).catch(() => null);
      if (!mpStat?.isDirectory()) continue;

      let pluginDirs: string[];
      try {
        pluginDirs = await fs.readdir(mpPath);
      } catch { continue; }

      for (const pluginDir of pluginDirs) {
        const pluginPath = path.join(mpPath, pluginDir);
        const pluginStat = await fs.stat(pluginPath).catch(() => null);
        if (!pluginStat?.isDirectory()) continue;

        // Find the latest version directory
        let versionDirs: string[];
        try {
          versionDirs = await fs.readdir(pluginPath);
        } catch { continue; }

        // Try each version dir (typically just one)
        for (const versionDir of versionDirs) {
          const versionPath = path.join(pluginPath, versionDir);
          const vStat = await fs.stat(versionPath).catch(() => null);
          if (!vStat?.isDirectory()) continue;

          // Look for plugin.json in .claude-plugin/ or at version root
          const candidates = [
            path.join(versionPath, ".claude-plugin", "plugin.json"),
            path.join(versionPath, "plugin.json"),
          ];

          for (const pluginJsonPath of candidates) {
            try {
              const raw = await fs.readFile(pluginJsonPath, "utf-8");
              const meta = JSON.parse(raw) as {
                name: string;
                marketplace?: string;
                version?: string;
                description?: string;
                author?: string;
                skills?: string[];
                agents?: string[];
                commands?: string[];
                installedAt?: string;
                lastUpdated?: string;
              };

              // Scan skill/agent/command directories for actual items
              const skillsDir = path.join(versionPath, "skills");
              const agentsDir = path.join(versionPath, "agents");
              const commandsDir = path.join(versionPath, "commands");

              const listDir = async (dir: string) => {
                try {
                  return (await fs.readdir(dir)).filter(n => !n.startsWith("."));
                } catch { return []; }
              };

              const skills = meta.skills?.length ? meta.skills : await listDir(skillsDir);
              const agents = meta.agents?.length ? meta.agents : await listDir(agentsDir);
              const commands = meta.commands?.length ? meta.commands : await listDir(commandsDir);

              plugins.push({
                name: meta.name || pluginDir,
                marketplace: meta.marketplace || mpDir,
                version: meta.version || versionDir,
                description: meta.description || "",
                author: meta.author,
                enabled: true,
                skills,
                agents,
                commands,
                hooks: [],
                libs: [],
                installPath: versionPath,
                installedAt: meta.installedAt,
                lastUpdated: meta.lastUpdated,
              });
              break; // Found plugin.json, no need to check other candidates
            } catch {
              // Try next candidate
            }
          }
        }
      }
    }
  } catch {
    // No cache dir
  }

  return plugins;
}

export async function getPluginDetails(
  key: string
): Promise<PluginInfo | null> {
  const plugins = await listPlugins();
  return plugins.find((p) => p.name === key) || null;
}

export async function togglePlugin(
  key: string,
  enabled: boolean
): Promise<void> {
  const configPath = path.join(MYCELIUM_DIR, "plugins.json");
  let config: Record<string, { enabled: boolean }> = {};
  try {
    const raw = await fs.readFile(configPath, "utf-8");
    config = JSON.parse(raw);
  } catch {
    // No config yet
  }
  config[key] = { enabled };
  await fs.mkdir(MYCELIUM_DIR, { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
}

