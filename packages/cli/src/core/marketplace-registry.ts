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
    [MS.SKILLSMP]: {
      type: "remote",
      enabled: true,
      url: "https://skillsmp.com",
      description: "SkillsMP marketplace",
    },
    [MS.OPENSKILLS]: {
      type: "remote",
      enabled: true,
      url: "https://registry.npmjs.org",
      description: "OpenSkills via npm",
    },
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
      description: "MCP Registry",
    },
    [MS.ANTHROPIC_SKILLS]: {
      type: "remote",
      enabled: true,
      url: "https://github.com/anthropics/skills",
      description: "Official Anthropic skills",
    },
    [MS.CLAWHUB]: {
      type: "remote",
      enabled: true,
      url: "https://clawhub.ai",
      description: "ClawHub marketplace",
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
    const entries = await fs.readdir(cacheDir);

    for (const entry of entries) {
      const pluginJsonPath = path.join(cacheDir, entry, "plugin.json");
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

        if (marketplace && meta.marketplace !== marketplace) continue;

        plugins.push({
          name: meta.name || entry,
          marketplace: meta.marketplace || "unknown",
          version: meta.version || "0.0.0",
          description: meta.description || "",
          author: meta.author,
          enabled: true,
          skills: meta.skills || [],
          agents: meta.agents || [],
          commands: meta.commands || [],
          hooks: [],
          libs: [],
          installPath: path.join(cacheDir, entry),
          installedAt: meta.installedAt,
          lastUpdated: meta.lastUpdated,
        });
      } catch {
        // Skip invalid plugin dirs
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

