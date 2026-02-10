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
  findItemType,
  setItemInManifest,
  isValidToolId,
  resolveManifestDir,
  type ItemConfig,
  type ItemType,
} from "../core/manifest-state.js";
import { getAllPluginsForComponent, setPluginEnabled, syncPluginSymlinks } from "../core/plugin-takeover.js";
import { scanPluginComponents } from "../core/plugin-scanner.js";

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
  pluginTakeover?: boolean;
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

  // Pre-fetch matching plugins (used for type detection and takeover)
  const matchingPlugins = !tool ? await getAllPluginsForComponent(name) : [];

  // Detect type from plugin cache if available (agents/commands shouldn't default to "skill")
  let typeHint: ItemType | undefined;
  for (const p of matchingPlugins) {
    const components = await scanPluginComponents(p.cachePath, p.plugin, p.marketplace);
    const match = components.find(c => c.name === name);
    if (match) { typeHint = match.type as ItemType; break; }
  }

  // Detect MCP type from config files (mcps.yaml)
  if (!typeHint) {
    const { loadGlobalConfig } = await import("../core/config-merger.js");
    const globalConfig = await loadGlobalConfig();
    if (globalConfig.mcps?.[name]) typeHint = "mcp";
  }

  // Find or auto-register item
  const { type, config, autoRegistered } = ensureItem(manifest, name, "enabled", typeHint);
  if (autoRegistered) {
    log.info({ scope: "manifest", op: "disable", msg: `Auto-registered '${name}' as ${type} in manifest`, item: name });
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

  // Remove MCP from tool configs immediately
  if (type === "mcp") {
    const { getAdapter } = await import("../core/tool-adapter.js");
    const toolIds = tool ? [tool] : ALL_TOOL_IDS;
    for (const tid of toolIds) {
      try { await getAdapter(tid).remove(name); } catch { /* tool may not be installed */ }
    }
  }

  // Plugin takeover: if disabling any component that belongs to a Claude Code plugin,
  // take over ALL enabled plugins containing it so Mycelium manages their skills.
  let pluginTakeover = false;
  if (!tool && matchingPlugins.length > 0) {

      for (const pluginInfo of matchingPlugins) {
        // Scan all component types from plugin cache
        const allPluginComponents = await scanPluginComponents(pluginInfo.cachePath, pluginInfo.plugin, pluginInfo.marketplace);
        const allComponentNames = allPluginComponents.map(c => c.name);

        // Collect all disabled items from ALL sections for this plugin
        const disabledItems: string[] = [];
        const allPluginItemNames = new Set([...pluginInfo.allSkills, ...allComponentNames]);
        for (const itemName of allPluginItemNames) {
          const found = findItemType(manifest, itemName);
          if (found?.config.state === "disabled") disabledItems.push(itemName);
        }
        // Include the current item being disabled
        if (allPluginItemNames.has(name) && !disabledItems.includes(name)) {
          disabledItems.push(name);
        }

        // Disable plugin in Claude Code settings
        await setPluginEnabled(pluginInfo.pluginId, false);

        // Register plugin in takenOverPlugins with all component types
        if (!manifest.takenOverPlugins) manifest.takenOverPlugins = {};
        manifest.takenOverPlugins[pluginInfo.pluginId] = {
          version: pluginInfo.version,
          cachePath: pluginInfo.cachePath,
          allSkills: pluginInfo.allSkills,
          allComponents: allComponentNames,
        };

        // Register all plugin components in manifest with pluginOrigin
        const pluginOrigin = { pluginId: pluginInfo.pluginId, cachePath: pluginInfo.cachePath };
        for (const comp of allPluginComponents) {
          const sectionKey = comp.type === "skill" ? "skills" : comp.type === "agent" ? "agents" : comp.type === "command" ? "commands" : comp.type === "hook" ? "hooks" : null;
          if (!sectionKey) continue;
          if (!manifest[sectionKey]) (manifest as any)[sectionKey] = {};
          const section = manifest[sectionKey] as Record<string, any>;
          const existing = section[comp.name] ?? { state: "enabled" as const };
          existing.pluginOrigin = pluginOrigin;
          section[comp.name] = existing;
        }
        // Also register skills from pluginInfo.allSkills (fallback when cache scan returns partial/empty)
        if (!manifest.skills) manifest.skills = {};
        for (const skillName of pluginInfo.allSkills) {
          const existing = manifest.skills[skillName] ?? { state: "enabled" as const };
          if (!existing.pluginOrigin) existing.pluginOrigin = pluginOrigin;
          manifest.skills[skillName] = existing;
        }

        log.info({ scope: "plugin", op: "takeover", msg: `Took over plugin: ${pluginInfo.pluginId}`, item: pluginInfo.pluginId, itemType: typeHint });
      }

      await saveStateManifest(manifestDir, manifest);

      // Sync symlinks declaratively — single source of truth
      await syncPluginSymlinks(manifestDir);
      pluginTakeover = true;
  }

  // If the item belongs to an already-taken-over plugin, syncPluginSymlinks
  // wasn't called above (matchingPlugins is empty for already-disabled plugins).
  // Re-sync to remove the newly disabled item's symlink.
  if (!pluginTakeover && !tool && manifest.takenOverPlugins && Object.keys(manifest.takenOverPlugins).length > 0) {
    await syncPluginSymlinks(manifestDir);
  }

  const toolMsg = tool ? ` for ${tool}` : "";
  log.info({ scope: "manifest", op: "disable", msg: `${type} '${name}' disabled${toolMsg}`, item: name, tool });
  return { success: true, name, type, level, tool, pluginTakeover, message: `${type} '${name}' disabled${toolMsg}` };
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
        if (result.pluginTakeover) {
          console.log(`  [experimental] Plugin takeover: plugin disabled in Claude Code, skills now managed by Mycelium`);
        }
      }
    } else {
      console.error(`\u2717 Error: ${result.error}`);
      process.exit(1);
    }
  });
