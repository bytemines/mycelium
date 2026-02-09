/**
 * Disable Command Module
 *
 * Disable a skill or MCP globally or for a specific tool:
 * - mycelium disable <name>              # Disable skill/MCP at project level
 * - mycelium disable <name> --global     # Disable skill/MCP globally
 * - mycelium disable <name> --tool <id>  # Disable skill/MCP for specific tool only
 */

import { Command } from "commander";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { parse as yamlParse, stringify as yamlStringify } from "yaml";
import { type ToolId, TOOL_REGISTRY, ALL_TOOL_IDS, expandPath } from "@mycelish/core";

// ============================================================================
// Types
// ============================================================================

export interface DisableOptions {
  name: string;
  tool?: ToolId;
  global?: boolean;
  globalPath?: string;
  projectPath?: string;
}

export interface DisableResult {
  success: boolean;
  name: string;
  type?: "skill" | "mcp";
  level?: "global" | "project";
  tool?: ToolId;
  alreadyDisabled?: boolean;
  message?: string;
  error?: string;
}

interface ManifestConfig {
  version: string;
  tools?: Record<string, { enabled: boolean }>;
  skills?: Record<string, SkillConfig>;
  mcps?: Record<string, McpConfig>;
  memory?: unknown;
}

interface SkillConfig {
  enabled?: boolean;
  tools?: ToolId[];
  excludeTools?: ToolId[];
  enabledTools?: ToolId[];
}

interface McpConfig {
  enabled?: boolean;
  tools?: ToolId[];
  excludeTools?: ToolId[];
  enabledTools?: ToolId[];
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
 * Find what type an item is (skill or MCP)
 */
function findItemType(
  manifest: ManifestConfig,
  name: string
): { type: "skill" | "mcp"; config: SkillConfig | McpConfig } | null {
  if (manifest.skills && name in manifest.skills) {
    return { type: "skill", config: manifest.skills[name] };
  }
  if (manifest.mcps && name in manifest.mcps) {
    return { type: "mcp", config: manifest.mcps[name] };
  }
  return null;
}

/**
 * Check if item is already disabled (globally or for a specific tool)
 */
function isAlreadyDisabled(
  config: SkillConfig | McpConfig,
  tool?: ToolId
): boolean {
  if (tool) {
    // Check tool-specific disablement
    if (config.excludeTools?.includes(tool)) {
      return true;
    }
    // If tools array exists and doesn't include this tool, it's effectively disabled
    if (config.tools && !config.tools.includes(tool)) {
      return true;
    }
    return false;
  }
  // Check global disablement
  return config.enabled === false;
}

// ============================================================================
// Core Disable Function
// ============================================================================

/**
 * Disable a skill or MCP
 */
export async function disableSkillOrMcp(options: DisableOptions): Promise<DisableResult> {
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

  // Find the item (skill or MCP)
  const item = findItemType(manifest, name);
  if (!item) {
    return {
      success: false,
      name,
      error: `'${name}' not found in manifest (checked skills and mcps)`,
    };
  }

  const { type, config } = item;
  const level = isGlobal ? "global" : "project";

  // Check if already disabled
  if (isAlreadyDisabled(config, tool)) {
    const toolMsg = tool ? ` for ${tool}` : "";
    return {
      success: true,
      name,
      type,
      level,
      tool,
      alreadyDisabled: true,
      message: `${type} '${name}' is already disabled${toolMsg}`,
    };
  }

  // Disable the item
  if (tool) {
    // Disable for specific tool
    // Add to excludeTools
    if (!config.excludeTools) {
      config.excludeTools = [];
    }
    if (!config.excludeTools.includes(tool)) {
      config.excludeTools.push(tool);
    }
    // Remove from tools array if present
    if (config.tools) {
      config.tools = config.tools.filter((t) => t !== tool);
    }
    // Remove from enabledTools if present
    if (config.enabledTools) {
      config.enabledTools = config.enabledTools.filter((t) => t !== tool);
    }
  } else {
    // Disable globally
    config.enabled = false;
  }

  // Update manifest
  if (type === "skill") {
    if (!manifest.skills) manifest.skills = {};
    manifest.skills[name] = config as SkillConfig;
  } else {
    if (!manifest.mcps) manifest.mcps = {};
    manifest.mcps[name] = config as McpConfig;
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
    message: `${type} '${name}' disabled${toolMsg}`,
  };
}

// ============================================================================
// Commander.js Command
// ============================================================================

export const disableCommand = new Command("disable")
  .description("Disable a skill or MCP")
  .argument("<name>", "Name of the skill or MCP to disable")
  .option("-t, --tool <tool>", "Disable only for a specific tool")
  .option("-g, --global", "Disable in global configuration (~/.mycelium/)")
  .action(async (name: string, options: { tool?: string; global?: boolean }) => {
    const result = await disableSkillOrMcp({
      name,
      tool: options.tool as ToolId | undefined,
      global: options.global,
    });

    if (result.success) {
      if (result.alreadyDisabled) {
        console.log(result.message);
      } else {
        console.log(`\u2713 ${result.message}`);
      }
    } else {
      console.error(`\u2717 Error: ${result.error}`);
      process.exit(1);
    }
  });
