/**
 * Plugin State — merges live cache scan with manifest state at query time.
 *
 * Two sources of truth:
 *   1. Discovery: scanPluginCache() → what components EXIST
 *   2. State: manifest.yaml → what's enabled/disabled
 *
 * This replaces the stale buildPluginMap(migration-manifest.json) approach.
 */
import * as os from "node:os";
import * as path from "node:path";

import type { PluginInfo, PluginComponent } from "@mycelish/core";
import { scanPluginCache } from "./plugin-scanner.js";
import { getDisabledItems } from "./manifest-state.js";

const PLUGIN_CACHE_DIR = path.join(os.homedir(), ".claude", "plugins", "cache");

interface GroupedPlugin {
  marketplace: string;
  skills: string[];
  agents: string[];
  commands: string[];
  hooks: string[];
  libs: string[];
  installPath: string;
}

/**
 * Get live plugin state by scanning the cache and merging with manifest.
 * Returns PluginInfo[] ready for the dashboard API.
 */
export async function getLivePluginState(projectRoot?: string): Promise<PluginInfo[]> {
  // 1. Scan live cache for discovery
  const components = await scanPluginCache(PLUGIN_CACHE_DIR);

  // 2. Group by plugin name
  const pluginMap = new Map<string, GroupedPlugin>();
  for (const comp of components) {
    const key = comp.pluginName ?? "unknown";
    const existing = pluginMap.get(key) ?? {
      marketplace: comp.marketplace ?? "",
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

    pluginMap.set(key, existing);
  }

  // 3. Load state from manifest
  const disabledItems = await getDisabledItems(projectRoot);

  // 4. Merge: components + state → PluginInfo[]
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
