/**
 * Config Merger Module
 *
 * Merges configurations from three levels:
 * - Global (~/.mycelium/global/) - base configuration
 * - Machine (~/.mycelium/machines/{hostname}/) - hardware-specific overrides
 * - Project (.mycelium/ in project root) - project-specific overrides
 *
 * Priority: Project > Machine > Global
 */

import * as os from "node:os";
import * as path from "node:path";
import { parse as yamlParse } from "yaml";
import type {
  McpServerConfig,
  MergedConfig,
  ConfigLevel,
  MemoryConfig,
  Skill,
} from "@mycelish/core";
import { MYCELIUM_HOME, readFileIfExists } from "./fs-helpers.js";

/**
 * Default empty memory config
 */
function getDefaultMemoryConfig(): MemoryConfig {
  return {
    scopes: {
      shared: { syncTo: [], path: "", files: [] },
      coding: { syncTo: [], path: "", files: [] },
      personal: { syncTo: [], path: "", files: [] },
    },
  };
}

/**
 * Create an empty merged config
 */
function createEmptyMergedConfig(): MergedConfig {
  return {
    mcps: {},
    skills: {},
    memory: getDefaultMemoryConfig(),
    sources: {},
  };
}

/**
 * Merge MCP configs from multiple levels
 * Priority: Project > Machine > Global
 */
export function mergeConfigs(
  globalConfig: Partial<MergedConfig> | undefined,
  machineConfig: Partial<MergedConfig> | undefined,
  projectConfig: Partial<MergedConfig> | undefined
): MergedConfig {
  const result = createEmptyMergedConfig();
  const levels: { config: Partial<MergedConfig> | undefined; source: ConfigLevel }[] = [
    { config: globalConfig, source: "global" },
    { config: machineConfig, source: "machine" },
    { config: projectConfig, source: "project" },
  ];

  for (const { config, source } of levels) {
    if (!config) continue;

    // Merge MCPs — higher priority level overwrites lower
    if (config.mcps) {
      for (const [name, mcp] of Object.entries(config.mcps)) {
        result.mcps[name] = result.mcps[name]
          ? mergeMcpServerConfig(result.mcps[name], mcp)
          : { ...mcp };
        result.sources[name] = source;
      }
    }

    // Merge skills — simple overwrite by priority
    if (config.skills) {
      Object.assign(result.skills, config.skills);
    }

    // Merge memory — scope-level overwrite
    if (config.memory) {
      result.memory = mergeMemoryConfig(result.memory, config.memory);
    }
  }

  return result;
}

/**
 * Merge two MCP server configs, with source taking priority
 */
function mergeMcpServerConfig(
  target: McpServerConfig,
  source: McpServerConfig
): McpServerConfig {
  return {
    command: source.command ?? target.command,
    args: source.args ?? target.args,
    env: source.env !== undefined ? source.env : target.env,
    state: source.state ?? target.state,
    source: source.source ?? target.source,
    tools: source.tools ?? target.tools,
    excludeTools: source.excludeTools ?? target.excludeTools,
  };
}

/**
 * Merge memory configs — scopes from source overwrite target at scope level
 */
function mergeMemoryConfig(
  target: MemoryConfig,
  source: Partial<MemoryConfig>
): MemoryConfig {
  if (!source.scopes) return target;
  return { ...target, scopes: { ...target.scopes, ...source.scopes } };
}

// ============================================================================
// Config File Loading
// ============================================================================

/**
 * Parse a config string as YAML or JSON.
 * Returns null on parse error (logs a warning for malformed files).
 */
function parseConfig<T>(content: string, filePath: string): T | null {
  try {
    // YAML.parse handles both YAML and JSON transparently
    return yamlParse(content) as T;
  } catch (err) {
    console.warn(`Mycelium: failed to parse ${filePath}: ${(err as Error).message}`);
    return null;
  }
}

/**
 * Load MCPs from a directory — tries mcps.yaml first, falls back to mcps.json.
 *
 * Format differences:
 * - YAML: flat structure  { "mcp-name": { command, args } }
 * - JSON: nested structure { mcps: { "mcp-name": { command, args } } }
 */
async function loadMcpsFromDir(dir: string): Promise<Record<string, McpServerConfig>> {
  // Try YAML first (preferred format)
  const yamlContent = await readFileIfExists(path.join(dir, "mcps.yaml"));
  if (yamlContent) {
    return parseConfig<Record<string, McpServerConfig>>(yamlContent, path.join(dir, "mcps.yaml")) ?? {};
  }

  // Fallback to JSON
  const jsonContent = await readFileIfExists(path.join(dir, "mcps.json"));
  if (jsonContent) {
    const data = parseConfig<{ mcps: Record<string, McpServerConfig> }>(jsonContent, path.join(dir, "mcps.json"));
    return data?.mcps ?? {};
  }

  return {};
}

/**
 * Load global config from ~/.mycelium/global/
 */
export async function loadGlobalConfig(): Promise<Partial<MergedConfig>> {
  return {
    mcps: await loadMcpsFromDir(path.join(MYCELIUM_HOME, "global")),
    skills: {},
  };
}

/**
 * Load project config from .mycelium/ in project root
 */
export async function loadProjectConfig(
  projectRoot?: string
): Promise<Partial<MergedConfig>> {
  const root = projectRoot ?? process.cwd();
  return {
    mcps: await loadMcpsFromDir(path.join(root, ".mycelium")),
    skills: {},
  };
}

/**
 * Load machine-specific config from ~/.mycelium/machines/{hostname}.*
 * Tries: hostname.yaml → hostname.json → hostname/ directory
 */
export async function loadMachineConfig(): Promise<Partial<MergedConfig>> {
  const hostname = os.hostname();
  const machinesDir = path.join(MYCELIUM_HOME, "machines");

  // Try hostname.yaml (flat MCP entries)
  const yamlContent = await readFileIfExists(path.join(machinesDir, `${hostname}.yaml`));
  if (yamlContent) {
    const mcps = parseConfig<Record<string, McpServerConfig>>(yamlContent, `machines/${hostname}.yaml`) ?? {};
    return { mcps, skills: {} };
  }

  // Try hostname.json (nested { mcps: {} })
  const jsonContent = await readFileIfExists(path.join(machinesDir, `${hostname}.json`));
  if (jsonContent) {
    const data = parseConfig<{ mcps: Record<string, McpServerConfig> }>(jsonContent, `machines/${hostname}.json`);
    return { mcps: data?.mcps ?? {}, skills: {} };
  }

  // Try hostname/ directory
  return { mcps: await loadMcpsFromDir(path.join(machinesDir, hostname)), skills: {} };
}

/**
 * Load and merge all config levels for a project
 */
export async function loadAndMergeAllConfigs(
  projectRoot?: string
): Promise<MergedConfig> {
  const [globalConfig, machineConfig, projectConfig] = await Promise.all([
    loadGlobalConfig(),
    loadMachineConfig(),
    loadProjectConfig(projectRoot),
  ]);

  return mergeConfigs(globalConfig, machineConfig, projectConfig);
}
