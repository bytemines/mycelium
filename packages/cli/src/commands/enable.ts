/**
 * Enable Command Module
 *
 * Enable a skill, MCP, hook, or memory scope globally or for a specific tool:
 * - mycelium enable <name>              # Enable item at project level
 * - mycelium enable <name> --global     # Enable item globally
 * - mycelium enable <name> --tool <id>  # Enable item for specific tool only
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
  type?: ItemType;
  level?: "global" | "project";
  tool?: ToolId;
  alreadyEnabled?: boolean;
  message?: string;
  error?: string;
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

  const manifestDir = resolveManifestDir(options);
  const manifest = await loadStateManifest(manifestDir);
  if (!manifest) {
    const error = `Could not load manifest from ${manifestDir}`;
    log.error({ scope: "manifest", op: "enable", msg: error, item: name, error });
    return { success: false, name, error };
  }

  // Find or auto-register item
  const { type, config, autoRegistered } = ensureItem(manifest, name, "disabled");
  if (autoRegistered) {
    log.info({ scope: "manifest", op: "enable", msg: `Auto-registered '${name}' as skill in manifest`, item: name });
  }

  const level = isGlobal ? "global" : "project";

  // Check if already enabled
  if (isAlreadyEnabled(config, tool)) {
    const toolMsg = tool ? ` for ${tool}` : "";
    return { success: true, name, type, level, tool, alreadyEnabled: true, message: `${type} '${name}' is already enabled${toolMsg}` };
  }

  // Apply enable
  if (tool) {
    if (!config.enabledTools) config.enabledTools = [];
    if (!config.enabledTools.includes(tool)) config.enabledTools.push(tool);
    if (!config.tools) config.tools = [];
    if (!config.tools.includes(tool)) config.tools.push(tool);
    if (config.excludeTools) {
      config.excludeTools = config.excludeTools.filter((t) => t !== tool);
    }
  } else {
    config.state = "enabled";
  }

  setItemInManifest(manifest, name, type, config);
  await saveStateManifest(manifestDir, manifest);

  const toolMsg = tool ? ` for ${tool}` : "";
  log.info({ scope: "manifest", op: "enable", msg: `${type} '${name}' enabled${toolMsg}`, item: name, tool });
  return { success: true, name, type, level, tool, message: `${type} '${name}' enabled${toolMsg}` };
}

function isAlreadyEnabled(config: ItemConfig, tool?: ToolId): boolean {
  if (tool) {
    return !!(config.enabledTools?.includes(tool) || config.tools?.includes(tool));
  }
  return config.state === "enabled" || config.state === undefined;
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
