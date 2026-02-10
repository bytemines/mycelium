/**
 * Enable Command Module
 *
 * Enable a skill, MCP, hook, or memory scope globally or for a specific tool:
 * - mycelium enable <name>              # Enable item at project level
 * - mycelium enable <name> --global     # Enable item globally
 * - mycelium enable <name> --tool <id>  # Enable item for specific tool only
 */

import { Command } from "commander";
import * as path from "node:path";
import { type ToolId, TOOL_REGISTRY, ALL_TOOL_IDS, expandPath } from "@mycelish/core";
import { getTracer } from "../core/global-tracer.js";
import {
  loadStateManifest,
  saveStateManifest,
  findItemType,
  sectionForType,
  type ItemConfig,
  type ManifestConfig,
} from "../core/manifest-state.js";

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
  type?: "skill" | "mcp" | "hook" | "memory" | "agent" | "command";
  level?: "global" | "project";
  tool?: ToolId;
  alreadyEnabled?: boolean;
  message?: string;
  error?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function isValidToolId(toolId: string): toolId is ToolId {
  return toolId in TOOL_REGISTRY;
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
  const tracer = getTracer();
  const log = tracer.createTrace("enable");
  log.info({ scope: "manifest", op: "enable", msg: `Enabling ${name}`, item: name, tool });

  // Validate tool if provided
  if (tool && !isValidToolId(tool)) {
    const error = `Invalid tool: ${tool}. Supported tools: ${ALL_TOOL_IDS.join(", ")}`;
    log.error({ scope: "manifest", op: "enable", msg: error, item: name, error });
    return { success: false, name, error };
  }

  // Determine which manifest to use
  const manifestDir = isGlobal
    ? options.globalPath || expandPath("~/.mycelium")
    : options.projectPath || path.join(process.cwd(), ".mycelium");

  // Load manifest
  const manifest = await loadStateManifest(manifestDir);
  if (!manifest) {
    const error = `Could not load manifest from ${manifestDir}`;
    log.error({ scope: "manifest", op: "enable", msg: error, item: name, error });
    return { success: false, name, error };
  }

  // Find the item, or auto-register as a skill if not found
  let item = findItemType(manifest, name);
  if (!item) {
    if (!manifest.skills) manifest.skills = {};
    manifest.skills[name] = { state: "disabled", source: "auto" };
    log.info({ scope: "manifest", op: "enable", msg: `Auto-registered '${name}' as skill in manifest`, item: name });
    item = { type: "skill", config: manifest.skills[name] };
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

  // Update manifest — write config back to appropriate section
  const sectionKey = sectionForType(type)!;
  if (!manifest[sectionKey]) (manifest as unknown as Record<string, unknown>)[sectionKey] = {};
  (manifest[sectionKey] as Record<string, ItemConfig>)[name] = config;

  // Save manifest
  await saveStateManifest(manifestDir, manifest);

  // Build success message
  const toolMsg = tool ? ` for ${tool}` : "";
  log.info({ scope: "manifest", op: "enable", msg: `${type} '${name}' enabled${toolMsg}`, item: name, tool });
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
