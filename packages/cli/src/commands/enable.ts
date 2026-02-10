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
  findItemType,
  setItemInManifest,
  isValidToolId,
  resolveManifestDir,
  type ItemConfig,
  type ItemType,
} from "../core/manifest-state.js";
import { setPluginEnabled, syncPluginSymlinks } from "../core/plugin-takeover.js";
import { scanPluginComponents } from "../core/plugin-scanner.js";

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
  pluginReleased?: boolean;
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

  // Load global config once (used for MCP type detection and later for re-adding)
  const { loadGlobalConfig } = await import("../core/config-merger.js");
  const globalConfig = await loadGlobalConfig();

  // Detect MCP type from config files (mcps.yaml)
  let typeHint: ItemType | undefined;
  if (globalConfig.mcps?.[name]) typeHint = "mcp";

  // Detect type from plugin cache if available
  if (!typeHint && !tool && manifest.takenOverPlugins) {
    for (const [, info] of Object.entries(manifest.takenOverPlugins)) {
      try {
        const components = await scanPluginComponents(info.cachePath);
        const match = components.find(c => c.name === name);
        if (match) { typeHint = match.type as ItemType; break; }
      } catch { /* cache may not exist */ }
    }
  }

  // Find or auto-register item
  const { type, config, autoRegistered } = ensureItem(manifest, name, "disabled", typeHint);
  if (autoRegistered) {
    log.info({ scope: "manifest", op: "enable", msg: `Auto-registered '${name}' as ${type} in manifest`, item: name });
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

  // Add MCP back to tool configs immediately
  if (type === "mcp") {
    const { getAdapter } = await import("../core/tool-adapter.js");
    const mcpConfig = globalConfig.mcps?.[name];
    if (mcpConfig) {
      const toolIds = tool ? [tool] : ALL_TOOL_IDS.filter(tid => {
        if (config.excludeTools?.includes(tid)) return false;
        if (config.tools?.length && !config.tools.includes(tid)) return false;
        return true;
      });
      for (const tid of toolIds) {
        try { await getAdapter(tid).add(name, mcpConfig); } catch { /* tool may not be installed */ }
      }
    }
  }

  // Plugin release: check ALL taken-over plugins that contain this item.
  // An item can exist in multiple plugins — release each one whose items are all enabled.
  let pluginReleased = false;
  if (!tool && manifest.takenOverPlugins) {
    let manifestDirty = false;

    for (const [pluginId, pluginEntry] of Object.entries(manifest.takenOverPlugins)) {
      // Check if this item belongs to this plugin (check both allSkills and allComponents)
      const allItems = [...(pluginEntry.allSkills ?? []), ...(pluginEntry.allComponents ?? [])];
      if (!allItems.includes(name)) continue;

      // Check ALL components are enabled (not just skills)
      const allEnabled = allItems.every((itemName) => {
        const found = findItemType(manifest, itemName);
        if (!found) return true; // not registered = enabled by default
        return found.config.state === "enabled" || found.config.state === undefined;
      });

      if (allEnabled) {
        // Re-enable plugin in Claude Code settings and remove symlinks
        await setPluginEnabled(pluginId, true);
        delete manifest.takenOverPlugins![pluginId];
        // Clean up pluginOrigin from ALL sections
        for (const itemName of new Set(allItems)) {
          for (const sectionName of ["skills", "agents", "commands", "hooks"] as const) {
            const section = manifest[sectionName];
            if (section && typeof section === "object" && itemName in section) {
              delete (section as Record<string, any>)[itemName].pluginOrigin;
            }
          }
        }
        pluginReleased = true;
        manifestDirty = true;
        log.info({ scope: "plugin", op: "release", msg: `Released plugin: ${pluginId}`, item: pluginId, itemType: typeHint });
      }
    }

    if (manifestDirty) {
      if (Object.keys(manifest.takenOverPlugins!).length === 0) delete manifest.takenOverPlugins;
      await saveStateManifest(manifestDir, manifest);
    }

    // Sync symlinks declaratively — handles both re-symlinking (partial release)
    // and orphan cleanup (full release)
    await syncPluginSymlinks(manifestDir);
  }

  const toolMsg = tool ? ` for ${tool}` : "";
  log.info({ scope: "manifest", op: "enable", msg: `${type} '${name}' enabled${toolMsg}`, item: name, tool });
  return { success: true, name, type, level, tool, pluginReleased, message: `${type} '${name}' enabled${toolMsg}` };
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
        if (result.pluginReleased) {
          console.log(`  [experimental] Plugin released: all skills re-enabled, plugin restored in Claude Code`);
        }
      }
    } else {
      console.error(`\u2717 Error: ${result.error}`);
      process.exit(1);
    }
  });
