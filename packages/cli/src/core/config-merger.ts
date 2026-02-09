/**
 * Config Merger Module
 *
 * Merges configurations from three levels:
 * - Global (~/.mycelium/) - base configuration
 * - Machine (~/.mycelium/machines/{hostname}/) - hardware-specific overrides
 * - Project (.mycelium/ in project root) - project-specific overrides
 *
 * Priority: Project > Machine > Global
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type {
  McpServerConfig,
  MergedConfig,
  ConfigLevel,
  MemoryConfig,
  Skill,
} from "@mycelsh/core";

/**
 * Default empty memory config
 */
function getDefaultMemoryConfig(): MemoryConfig {
  return {
    scopes: {
      shared: {
        syncTo: [],
        path: "",
        files: [],
      },
      coding: {
        syncTo: [],
        path: "",
        files: [],
      },
      personal: {
        syncTo: [],
        path: "",
        files: [],
      },
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

  // Start with global MCPs
  if (globalConfig?.mcps) {
    for (const [name, config] of Object.entries(globalConfig.mcps)) {
      result.mcps[name] = { ...config };
      result.sources[name] = "global";
    }
  }

  // Apply machine overrides (higher priority than global)
  if (machineConfig?.mcps) {
    for (const [name, config] of Object.entries(machineConfig.mcps)) {
      if (result.mcps[name]) {
        // Merge with existing config - machine takes priority
        result.mcps[name] = mergeMcpServerConfig(result.mcps[name], config);
        result.sources[name] = "machine";
      } else {
        // Add new MCP from machine config
        result.mcps[name] = { ...config };
        result.sources[name] = "machine";
      }
    }
  }

  // Apply project overrides (highest priority)
  if (projectConfig?.mcps) {
    for (const [name, config] of Object.entries(projectConfig.mcps)) {
      if (result.mcps[name]) {
        // Merge with existing config - project takes priority
        result.mcps[name] = mergeMcpServerConfig(result.mcps[name], config);
        result.sources[name] = "project";
      } else {
        // Add new MCP from project config
        result.mcps[name] = { ...config };
        result.sources[name] = "project";
      }
    }
  }

  // Merge skills (similar priority logic)
  if (globalConfig?.skills) {
    for (const [name, skill] of Object.entries(globalConfig.skills)) {
      result.skills[name] = { ...skill };
    }
  }
  if (machineConfig?.skills) {
    for (const [name, skill] of Object.entries(machineConfig.skills)) {
      result.skills[name] = { ...skill };
    }
  }
  if (projectConfig?.skills) {
    for (const [name, skill] of Object.entries(projectConfig.skills)) {
      result.skills[name] = { ...skill };
    }
  }

  // Merge memory config
  if (globalConfig?.memory) {
    result.memory = { ...globalConfig.memory };
  }
  if (machineConfig?.memory) {
    result.memory = mergeMemoryConfig(result.memory, machineConfig.memory);
  }
  if (projectConfig?.memory) {
    result.memory = mergeMemoryConfig(result.memory, projectConfig.memory);
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
    enabled: source.enabled !== undefined ? source.enabled : target.enabled,
    tools: source.tools ?? target.tools,
    excludeTools: source.excludeTools ?? target.excludeTools,
  };
}

/**
 * Merge memory configs
 */
function mergeMemoryConfig(
  target: MemoryConfig,
  source: Partial<MemoryConfig>
): MemoryConfig {
  const result = { ...target };

  if (source.scopes) {
    result.scopes = {
      ...target.scopes,
      ...source.scopes,
    };
  }

  return result;
}

/**
 * Check if a file exists
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Load and parse a JSON config file
 */
async function loadJsonConfig<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

/**
 * Load global config from ~/.mycelium/
 */
export async function loadGlobalConfig(): Promise<Partial<MergedConfig>> {
  const home = os.homedir();
  const globalPath = path.join(home, ".mycelium");
  const mcpsPath = path.join(globalPath, "mcps.json");

  const result: Partial<MergedConfig> = {
    mcps: {},
    skills: {},
  };

  if (await fileExists(mcpsPath)) {
    const mcpsConfig = await loadJsonConfig<{ mcps: Record<string, McpServerConfig> }>(mcpsPath);
    if (mcpsConfig?.mcps) {
      result.mcps = mcpsConfig.mcps;
    }
  }

  return result;
}

/**
 * Load project config from .mycelium/ in project root
 */
export async function loadProjectConfig(
  projectRoot: string
): Promise<Partial<MergedConfig>> {
  const projectPath = path.join(projectRoot, ".mycelium");
  const mcpsPath = path.join(projectPath, "mcps.json");

  const result: Partial<MergedConfig> = {
    mcps: {},
    skills: {},
  };

  if (await fileExists(mcpsPath)) {
    const mcpsConfig = await loadJsonConfig<{ mcps: Record<string, McpServerConfig> }>(mcpsPath);
    if (mcpsConfig?.mcps) {
      result.mcps = mcpsConfig.mcps;
    }
  }

  return result;
}

/**
 * Load machine-specific config from ~/.mycelium/machines/{hostname}/
 */
export async function loadMachineConfig(): Promise<Partial<MergedConfig>> {
  const home = os.homedir();
  const hostname = os.hostname();
  const machinePath = path.join(home, ".mycelium", "machines", hostname);
  const mcpsPath = path.join(machinePath, "mcps.json");

  const result: Partial<MergedConfig> = {
    mcps: {},
    skills: {},
  };

  if (await fileExists(mcpsPath)) {
    const mcpsConfig = await loadJsonConfig<{ mcps: Record<string, McpServerConfig> }>(mcpsPath);
    if (mcpsConfig?.mcps) {
      result.mcps = mcpsConfig.mcps;
    }
  }

  return result;
}

/**
 * Load and merge all config levels for a project
 */
export async function loadAndMergeAllConfigs(
  projectRoot: string
): Promise<MergedConfig> {
  const [globalConfig, machineConfig, projectConfig] = await Promise.all([
    loadGlobalConfig(),
    loadMachineConfig(),
    loadProjectConfig(projectRoot),
  ]);

  return mergeConfigs(globalConfig, machineConfig, projectConfig);
}
