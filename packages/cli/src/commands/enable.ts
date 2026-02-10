/**
 * Enable Command Module
 *
 * Enable a skill, MCP, hook, or memory scope globally or for a specific tool:
 * - mycelium enable <name>              # Enable item at project level
 * - mycelium enable <name> --global     # Enable item globally
 * - mycelium enable <name> --tool <id>  # Enable item for specific tool only
 */

import { Command } from "commander";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { parse as yamlParse, stringify as yamlStringify } from "yaml";
import { type ToolId, TOOL_REGISTRY, ALL_TOOL_IDS, expandPath } from "@mycelish/core";

// ============================================================================
// Types
// ============================================================================

type ItemState = "enabled" | "disabled" | "deleted";

export interface EnableOptions {
  name: string;
  tool?: ToolId;
  global?: boolean;
  globalPath?: string;
  projectPath?: string;
}

export interface EnableResult {
  success: boolean;
  name: string;
  type?: "skill" | "mcp" | "hook" | "memory";
  level?: "global" | "project";
  tool?: ToolId;
  alreadyEnabled?: boolean;
  message?: string;
  error?: string;
}

interface SkillConfig {
  state?: ItemState;
  source?: string;
  tools?: ToolId[];
  excludeTools?: ToolId[];
  enabledTools?: ToolId[];
}

interface McpConfig {
  state?: ItemState;
  source?: string;
  tools?: ToolId[];
  excludeTools?: ToolId[];
  enabledTools?: ToolId[];
}

interface HookConfig {
  state?: ItemState;
  source?: string;
  tools?: ToolId[];
  excludeTools?: ToolId[];
  enabledTools?: ToolId[];
}

interface MemoryConfig {
  state?: ItemState;
  source?: string;
  tools?: ToolId[];
  excludeTools?: ToolId[];
  enabledTools?: ToolId[];
}

type ItemConfig = SkillConfig | McpConfig | HookConfig | MemoryConfig;

interface ManifestConfig {
  version: string;
  tools?: Record<string, { enabled: boolean }>;
  skills?: Record<string, SkillConfig>;
  mcps?: Record<string, McpConfig>;
  hooks?: Record<string, HookConfig>;
  memory?: Record<string, MemoryConfig> | unknown;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Load manifest from a path
 */
async function loadManifest(manifestDir: string): Promise<ManifestConfig | null> {
  const manifestPath = path.join(manifestDir, "manifest.yaml");
  try {
    const content = await fs.readFile(manifestPath, "utf-8");
    return yamlParse(content) as ManifestConfig;
  } catch {
    return null;
  }
}

/**
 * Save manifest to a path
 */
async function saveManifest(manifestDir: string, manifest: ManifestConfig): Promise<void> {
  const manifestPath = path.join(manifestDir, "manifest.yaml");
  const content = yamlStringify(manifest);
  await fs.writeFile(manifestPath, content, "utf-8");
}

/**
 * Check if a tool ID is valid
 */
function isValidToolId(toolId: string): toolId is ToolId {
  return toolId in TOOL_REGISTRY;
}

/**
 * Check if a value is a record of ItemConfig entries (not legacy memory with scopes)
 */
function isItemConfigRecord(val: unknown): val is Record<string, ItemConfig> {
  if (!val || typeof val !== "object" || Array.isArray(val)) return false;
  // Legacy memory has a "scopes" key — skip it
  if ("scopes" in (val as Record<string, unknown>)) return false;
  return true;
}

/**
 * Find what type an item is (skill, MCP, hook, or memory)
 */
function findItemType(
  manifest: ManifestConfig,
  name: string
): { type: "skill" | "mcp" | "hook" | "memory"; config: ItemConfig } | null {
  if (manifest.skills && name in manifest.skills) {
    return { type: "skill", config: manifest.skills[name] };
  }
  if (manifest.mcps && name in manifest.mcps) {
    return { type: "mcp", config: manifest.mcps[name] };
  }
  if (manifest.hooks && name in manifest.hooks) {
    return { type: "hook", config: manifest.hooks[name] };
  }
  if (isItemConfigRecord(manifest.memory) && name in manifest.memory) {
    return { type: "memory", config: manifest.memory[name] };
  }
  return null;
}

/**
 * Check if item is already enabled (globally or for a specific tool)
 */
function isAlreadyEnabled(
  config: ItemConfig,
  tool?: ToolId
): boolean {
  if (tool) {
    // Check tool-specific enablement
    if (config.enabledTools?.includes(tool) || config.tools?.includes(tool)) {
      return true;
    }
    return false;
  }
  // Check global enablement — undefined (no state) means enabled by default
  return config.state === "enabled" || config.state === undefined;
}

// ============================================================================
// Core Enable Function
// ============================================================================

/**
 * Enable a skill, MCP, hook, or memory scope
 */
export async function enableSkillOrMcp(options: EnableOptions): Promise<EnableResult> {
  const { name, tool, global: isGlobal } = options;

  // Validate tool if provided
  if (tool && !isValidToolId(tool)) {
    return {
      success: false,
      name,
      error: `Invalid tool: ${tool}. Supported tools: ${ALL_TOOL_IDS.join(", ")}`,
    };
  }

  // Determine which manifest to use
  const manifestDir = isGlobal
    ? options.globalPath || expandPath("~/.mycelium")
    : options.projectPath || path.join(process.cwd(), ".mycelium");

  // Load manifest
  const manifest = await loadManifest(manifestDir);
  if (!manifest) {
    return {
      success: false,
      name,
      error: `Could not load manifest from ${manifestDir}`,
    };
  }

  // Find the item
  const item = findItemType(manifest, name);
  if (!item) {
    return {
      success: false,
      name,
      error: `'${name}' not found in manifest (checked skills, mcps, hooks, and memory)`,
    };
  }

  const { type, config } = item;
  const level = isGlobal ? "global" : "project";

  // Check if already enabled
  if (isAlreadyEnabled(config, tool)) {
    const toolMsg = tool ? ` for ${tool}` : "";
    return {
      success: true,
      name,
      type,
      level,
      tool,
      alreadyEnabled: true,
      message: `${type} '${name}' is already enabled${toolMsg}`,
    };
  }

  // Enable the item
  if (tool) {
    // Enable for specific tool
    if (!config.enabledTools) {
      config.enabledTools = [];
    }
    if (!config.enabledTools.includes(tool)) {
      config.enabledTools.push(tool);
    }
    // Also add to tools array if it exists
    if (!config.tools) {
      config.tools = [];
    }
    if (!config.tools.includes(tool)) {
      config.tools.push(tool);
    }
    // Remove from excludeTools if present
    if (config.excludeTools) {
      config.excludeTools = config.excludeTools.filter((t) => t !== tool);
    }
  } else {
    // Enable globally — restores both disabled and deleted items
    config.state = "enabled";
  }

  // Update manifest
  if (type === "skill") {
    if (!manifest.skills) manifest.skills = {};
    manifest.skills[name] = config as SkillConfig;
  } else if (type === "mcp") {
    if (!manifest.mcps) manifest.mcps = {};
    manifest.mcps[name] = config as McpConfig;
  } else if (type === "hook") {
    if (!manifest.hooks) manifest.hooks = {};
    manifest.hooks[name] = config as HookConfig;
  } else if (type === "memory") {
    if (!isItemConfigRecord(manifest.memory)) manifest.memory = {};
    (manifest.memory as Record<string, MemoryConfig>)[name] = config as MemoryConfig;
  }

  // Save manifest
  await saveManifest(manifestDir, manifest);

  // Build success message
  const toolMsg = tool ? ` for ${tool}` : "";
  return {
    success: true,
    name,
    type,
    level,
    tool,
    message: `${type} '${name}' enabled${toolMsg}`,
  };
}

// ============================================================================
// Commander.js Command
// ============================================================================

export const enableCommand = new Command("enable")
  .description("Enable a skill or MCP")
  .argument("<name>", "Name of the skill or MCP to enable")
  .option("-t, --tool <tool>", "Enable only for a specific tool")
  .option("-g, --global", "Enable in global configuration (~/.mycelium/)")
  .action(async (name: string, options: { tool?: string; global?: boolean }) => {
    const result = await enableSkillOrMcp({
      name,
      tool: options.tool as ToolId | undefined,
      global: options.global,
    });

    if (result.success) {
      if (result.alreadyEnabled) {
        console.log(result.message);
      } else {
        console.log(`\u2713 ${result.message}`);
      }
    } else {
      console.error(`\u2717 Error: ${result.error}`);
      process.exit(1);
    }
  });
