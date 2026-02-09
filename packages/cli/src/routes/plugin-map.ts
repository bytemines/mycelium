import type { MigrationManifest } from "@mycelish/core";

export interface PluginComponents {
  marketplace: string;
  skills: string[];
  agents: string[];
  commands: string[];
  hooks: string[];
  libs: string[];
}

export function buildPluginMap(manifest: MigrationManifest): Map<string, PluginComponents> {
  const pluginMap = new Map<string, PluginComponents>();
  for (const entry of manifest.entries) {
    if (entry.pluginName) {
      const existing = pluginMap.get(entry.pluginName) || {
        marketplace: entry.marketplace || "",
        skills: [],
        agents: [],
        commands: [],
        hooks: [],
        libs: [],
      };
      switch (entry.type) {
        case "skill": existing.skills.push(entry.name); break;
        case "agent": existing.agents.push(entry.name); break;
        case "command": existing.commands.push(entry.name); break;
        case "hook": existing.hooks.push(entry.name); break;
        case "lib": existing.libs.push(entry.name); break;
      }
      if (entry.marketplace) existing.marketplace = entry.marketplace;
      pluginMap.set(entry.pluginName, existing);
    }
  }
  return pluginMap;
}
