/**
 * Plugin State — merges live cache scan with manifest state at query time.
 *
 * Shows plugins from two sources:
 *   1. Claude Code plugins (in installed_plugins.json or manifest.takenOverPlugins)
 *   2. Mycelium marketplace groups (manifest items grouped by source field)
 *
 * Stale takeover cleanup is handled by cleanOrphanedTakeovers() in plugin-takeover.ts.
 */
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import type { PluginInfo } from "@mycelish/core";
import { scanPluginCache } from "./plugin-scanner.js";
import { getDisabledItems, loadStateManifest, ITEM_SECTIONS } from "./manifest-state.js";
import type { ItemConfig } from "./manifest-state.js";
import { readFileIfExists, MYCELIUM_HOME } from "./fs-helpers.js";
import { buildPluginId } from "./plugin-takeover.js";

const PLUGIN_CACHE_DIR = path.join(os.homedir(), ".claude", "plugins", "cache");

interface GroupedPlugin {
  marketplace: string;
  pluginId: string; // "name@marketplace"
  skills: string[];
  agents: string[];
  commands: string[];
  hooks: string[];
  libs: string[];
  installPath: string;
}

/**
 * Get the set of plugin IDs that are currently installed OR actively taken over.
 */
async function getActivePluginIds(): Promise<Set<string>> {
  const active = new Set<string>();

  // 1. Installed in Claude Code
  try {
    const ipPath = path.join(os.homedir(), ".claude", "plugins", "installed_plugins.json");
    const raw = await readFileIfExists(ipPath);
    if (raw) {
      const data = JSON.parse(raw) as { version?: number; plugins?: Record<string, unknown> };
      if (data.version === 2 && data.plugins) {
        for (const pluginId of Object.keys(data.plugins)) {
          active.add(pluginId);
        }
      }
    }
  } catch { /* no file */ }

  // 2. Actively taken over by Mycelium
  try {
    const manifest = await loadStateManifest(MYCELIUM_HOME);
    if (manifest?.takenOverPlugins) {
      for (const pluginId of Object.keys(manifest.takenOverPlugins)) {
        active.add(pluginId);
      }
    }
  } catch { /* no manifest */ }

  return active;
}

/**
 * Get live plugin state by scanning the cache and merging with manifest.
 * Returns PluginInfo[] ready for the dashboard API.
 */
export async function getLivePluginState(projectRoot?: string): Promise<PluginInfo[]> {
  // 1. Get active plugin IDs (installed or taken over)
  const activePluginIds = await getActivePluginIds();

  // 2. Scan live cache for discovery
  const components = await scanPluginCache(PLUGIN_CACHE_DIR);

  // 3. Group by plugin name, skip plugins not in active set
  const pluginMap = new Map<string, GroupedPlugin>();
  for (const comp of components) {
    const name = comp.pluginName ?? "unknown";
    const marketplace = comp.marketplace ?? "";
    const pluginId = buildPluginId(name, marketplace);

    // Only include plugins that are installed or taken over
    if (!activePluginIds.has(pluginId)) continue;

    const existing = pluginMap.get(name) ?? {
      marketplace,
      pluginId,
      skills: [],
      agents: [],
      commands: [],
      hooks: [],
      libs: [],
      installPath: comp.path ? path.dirname(path.dirname(comp.path)) : "",
    };

    switch (comp.type) {
      case "skill": existing.skills.push(comp.name); break;
      case "agent": existing.agents.push(comp.name); break;
      case "command": existing.commands.push(comp.name); break;
      case "hook": existing.hooks.push(comp.name); break;
      case "lib": existing.libs.push(comp.name); break;
    }

    pluginMap.set(name, existing);
  }

  // 4. Discover marketplace-sourced item groups from manifest
  // Items with a `source` field that isn't "auto" and don't have pluginOrigin
  // are grouped by source name to appear as "marketplace plugins" in the dashboard.
  try {
    const manifest = await loadStateManifest(MYCELIUM_HOME);
    if (manifest) {
      const SECTION_TYPE_MAP: Record<string, keyof GroupedPlugin> = {
        skills: "skills", mcps: "libs", agents: "agents", commands: "commands", hooks: "hooks",
      };
      // Built-in sources to exclude from grouping
      const BUILTIN_SOURCES = new Set(["auto", "migration", "preset"]);

      for (const { key } of ITEM_SECTIONS) {
        const sectionData = manifest[key] as Record<string, ItemConfig> | undefined;
        if (!sectionData || typeof sectionData !== "object") continue;
        const bucket = SECTION_TYPE_MAP[key];
        if (!bucket) continue;

        for (const [itemName, config] of Object.entries(sectionData)) {
          if (!config.source || BUILTIN_SOURCES.has(config.source)) continue;
          if (config.pluginOrigin) continue; // already shown under Claude Code plugin
          if (config.state === "deleted") continue; // fully removed items don't form groups

          const sourceName = config.source;
          // Skip if this source name matches an existing Claude Code plugin
          if (pluginMap.has(sourceName) && pluginMap.get(sourceName)!.marketplace !== "mycelium") continue;

          const existing = pluginMap.get(sourceName) ?? {
            marketplace: "mycelium",
            pluginId: `${sourceName}@mycelium`,
            skills: [],
            agents: [],
            commands: [],
            hooks: [],
            libs: [],
            installPath: "",
          };

          const arr = existing[bucket] as string[];
          if (!arr.includes(itemName)) arr.push(itemName);
          pluginMap.set(sourceName, existing);
        }
      }
    }
  } catch { /* manifest read failure */ }

  // 5. Load disabled state from manifest
  const disabledItems = await getDisabledItems(projectRoot);

  // 6. Merge: components + state → PluginInfo[]
  return Array.from(pluginMap.entries()).map(([name, data]) => {
    const allItems = [...data.skills, ...data.agents, ...data.commands, ...data.hooks, ...data.libs];
    const disabledList = allItems.filter(i => disabledItems.has(i));
    const allEnabled = disabledList.length === 0;

    const parts: string[] = [];
    if (data.skills.length) parts.push(`${data.skills.length} skills`);
    if (data.agents.length) parts.push(`${data.agents.length} agents`);
    if (data.commands.length) parts.push(`${data.commands.length} commands`);
    if (data.hooks.length) parts.push(`${data.hooks.length} hooks`);
    if (data.libs.length) parts.push(`${data.libs.length} libs`);

    return {
      name,
      marketplace: data.marketplace,
      version: "",
      description: parts.join(", "),
      enabled: allEnabled,
      skills: data.skills,
      agents: data.agents,
      commands: data.commands,
      hooks: data.hooks,
      libs: data.libs,
      disabledItems: disabledList,
      installPath: data.installPath,
    };
  });
}
