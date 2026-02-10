/**
 * Disable Command Module
 *
 * Disable a skill, MCP, hook, or memory item globally or for a specific tool:
 * - mycelium disable <name>              # Disable item at project level
 * - mycelium disable <name> --global     # Disable item globally
 * - mycelium disable <name> --tool <id>  # Disable item for specific tool only
 */

import { Command } from "commander";
import { type ToolId, ALL_TOOL_IDS } from "@mycelish/core";
import { getTracer } from "../core/global-tracer.js";
import {
  loadStateManifest,
  saveStateManifest,
  ensureItem,
  setItemInManifest,
  isValidToolId,
  resolveManifestDir,
  type ItemConfig,
  type ItemType,
} from "../core/manifest-state.js";

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
  type?: ItemType;
  level?: "global" | "project";
  tool?: ToolId;
  alreadyDisabled?: boolean;
  message?: string;
  error?: string;
}

// ============================================================================
// Core Disable Function
// ============================================================================

/**
 * Disable a skill, MCP, hook, or memory item
 */
export async function disableSkillOrMcp(options: DisableOptions): Promise<DisableResult> {
  const { name, tool, global: isGlobal } = options;
  const tracer = getTracer();
  const log = tracer.createTrace("disable");
  log.info({ scope: "manifest", op: "disable", msg: `Disabling ${name}`, item: name, tool });

  // Validate tool if provided
  if (tool && !isValidToolId(tool)) {
    const error = `Invalid tool: ${tool}. Supported tools: ${ALL_TOOL_IDS.join(", ")}`;
    log.error({ scope: "manifest", op: "disable", msg: error, item: name, error });
    return { success: false, name, error };
  }

  const manifestDir = resolveManifestDir(options);
  const manifest = await loadStateManifest(manifestDir);
  if (!manifest) {
    const error = `Could not load manifest from ${manifestDir}`;
    log.error({ scope: "manifest", op: "disable", msg: error, item: name, error });
    return { success: false, name, error };
  }

  // Find or auto-register item
  const { type, config, autoRegistered } = ensureItem(manifest, name, "enabled");
  if (autoRegistered) {
    log.info({ scope: "manifest", op: "disable", msg: `Auto-registered '${name}' as skill in manifest`, item: name });
  }

  const level = isGlobal ? "global" : "project";

  // Check if already disabled
  if (isAlreadyDisabled(config, tool)) {
    const toolMsg = tool ? ` for ${tool}` : "";
    return { success: true, name, type, level, tool, alreadyDisabled: true, message: `${type} '${name}' is already disabled${toolMsg}` };
  }

  // Apply disable
  if (tool) {
    if (!config.excludeTools) config.excludeTools = [];
    if (!config.excludeTools.includes(tool)) config.excludeTools.push(tool);
    if (config.tools) {
      config.tools = config.tools.filter((t) => t !== tool);
    }
    if (config.enabledTools) {
      config.enabledTools = config.enabledTools.filter((t) => t !== tool);
    }
  } else {
    config.state = "disabled";
  }

  setItemInManifest(manifest, name, type, config);
  await saveStateManifest(manifestDir, manifest);

  const toolMsg = tool ? ` for ${tool}` : "";
  log.info({ scope: "manifest", op: "disable", msg: `${type} '${name}' disabled${toolMsg}`, item: name, tool });
  return { success: true, name, type, level, tool, message: `${type} '${name}' disabled${toolMsg}` };
}

function isAlreadyDisabled(config: ItemConfig, tool?: ToolId): boolean {
  if (tool) {
    if (config.excludeTools?.includes(tool)) return true;
    if (config.tools && !config.tools.includes(tool)) return true;
    return false;
  }
  return config.state === "disabled";
}

// ============================================================================
// Commander.js Command
// ============================================================================

export const disableCommand = new Command("disable")
  .description("Disable a skill, MCP, hook, or memory item")
  .argument("<name>", "Name of the item to disable")
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
