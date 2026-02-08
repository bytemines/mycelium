/**
 * Marketplace Registry — manage marketplace sources and plugin discovery
 */
import type { MarketplaceConfig, PluginInfo } from "@mycelium/core";
import { MARKETPLACE_SOURCES as MS } from "@mycelium/core";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

const MYCELIUM_DIR = path.join(os.homedir(), ".mycelium");
const REGISTRY_PATH = path.join(MYCELIUM_DIR, "marketplaces.yaml");
const CLAUDE_PLUGINS_DIR = path.join(os.homedir(), ".claude", "plugins");

// ============================================================================
// Simple YAML parser/serializer (no library needed)
// ============================================================================

function parseSimpleYaml(
  text: string
): Record<string, Record<string, string | boolean>> {
  const result: Record<string, Record<string, string | boolean>> = {};
  let currentSection: string | null = null;
  let currentKey: string | null = null;

  for (const line of text.split("\n")) {
    const trimmed = line.trimEnd();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const indent = line.length - line.trimStart().length;

    if (indent === 0 && trimmed.endsWith(":")) {
      // Top-level section like "marketplaces:"
      currentSection = trimmed.slice(0, -1).trim();
      continue;
    }

    if (indent === 2 && trimmed.endsWith(":")) {
      // Marketplace name like "  claude-plugins:"
      currentKey = trimmed.slice(0, -1).trim();
      if (currentSection) {
        result[currentKey] = {};
      }
      continue;
    }

    if (indent === 4 && currentKey && trimmed.includes(":")) {
      // Property like "    type: local"
      const colonIdx = trimmed.indexOf(":");
      const key = trimmed.slice(0, colonIdx).trim();
      let value: string | boolean = trimmed.slice(colonIdx + 1).trim();
      // Remove quotes
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (value === "true") value = true;
      if (value === "false") value = false;
      result[currentKey][key] = value;
    }
  }

  return result;
}

function serializeSimpleYaml(
  registry: Record<string, MarketplaceConfig>
): string {
  const lines: string[] = ["marketplaces:"];
  for (const [name, config] of Object.entries(registry)) {
    lines.push(`  ${name}:`);
    lines.push(`    type: ${config.type}`);
    lines.push(`    enabled: ${config.enabled}`);
    if (config.default !== undefined) lines.push(`    default: ${config.default}`);
    if (config.url) lines.push(`    url: "${config.url}"`);
    if (config.description) lines.push(`    description: "${config.description}"`);
    if (config.discovered !== undefined) lines.push(`    discovered: ${config.discovered}`);
  }
  return lines.join("\n") + "\n";
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
    const parsed = parseSimpleYaml(raw);
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
  const yaml = serializeSimpleYaml(registry);
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

export async function toggleSkillInPlugin(
  key: string,
  skillName: string,
  enabled: boolean
): Promise<void> {
  const configPath = path.join(MYCELIUM_DIR, "plugin-skills.json");
  let config: Record<string, Record<string, boolean>> = {};
  try {
    const raw = await fs.readFile(configPath, "utf-8");
    config = JSON.parse(raw);
  } catch {
    // No config yet
  }
  if (!config[key]) config[key] = {};
  config[key][skillName] = enabled;
  await fs.mkdir(MYCELIUM_DIR, { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
}
