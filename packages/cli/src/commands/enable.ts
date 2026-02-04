/**
 * Enable Command Module
 *
 * Enable a skill or MCP globally or for a specific tool:
 * - mycelium enable <name>              # Enable skill/MCP at project level
 * - mycelium enable <name> --global     # Enable skill/MCP globally
 * - mycelium enable <name> --tool <id>  # Enable skill/MCP for specific tool only
 */

import { Command } from "commander";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { parse as yamlParse, stringify as yamlStringify } from "yaml";
import { type ToolId, SUPPORTED_TOOLS, expandPath } from "@mycelium/core";

// ============================================================================
// Types
// ============================================================================

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
  type?: "skill" | "mcp";
  level?: "global" | "project";
  tool?: ToolId;
  alreadyEnabled?: boolean;
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
  return toolId in SUPPORTED_TOOLS;
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
 * Check if item is already enabled (globally or for a specific tool)
 */
function isAlreadyEnabled(
  config: SkillConfig | McpConfig,
  tool?: ToolId
): boolean {
  if (tool) {
    // Check tool-specific enablement
    if (config.enabledTools?.includes(tool) || config.tools?.includes(tool)) {
      return true;
    }
    return false;
  }
  // Check global enablement
  return config.enabled === true;
}

// ============================================================================
// Core Enable Function
// ============================================================================

/**
 * Enable a skill or MCP
 */
export async function enableSkillOrMcp(options: EnableOptions): Promise<EnableResult> {
  const { name, tool, global: isGlobal } = options;

  // Validate tool if provided
  if (tool && !isValidToolId(tool)) {
    return {
      success: false,
      name,
      error: `Invalid tool: ${tool}. Supported tools: ${Object.keys(SUPPORTED_TOOLS).join(", ")}`,
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
    // Enable globally
    config.enabled = true;
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
