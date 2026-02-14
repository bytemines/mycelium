/**
 * Remove command — delete items from mycelium sync.
 *
 * mycelium remove <name>              — Remove item: delete from manifest + purge files/symlinks
 * mycelium remove <name> --type mcp   — Disambiguate when name exists in multiple sections
 * mycelium remove <name> --soft       — Only mark as deleted (no file cleanup)
 * mycelium remove plugin <name>       — Remove all items from a plugin + release takeover
 */
import { Command } from "commander";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { expandPath, TOOL_REGISTRY, resolvePath } from "@mycelish/core";
import { getTracer } from "../core/global-tracer.js";
import { MYCELIUM_HOME } from "../core/fs-helpers.js";
import {
  loadStateManifest,
  saveStateManifest,
  ITEM_SECTIONS,
  ALL_ITEM_TYPES,
  sectionForType,
  type ManifestConfig,
  type ItemConfig,
} from "../core/manifest-state.js";
import {
  setPluginEnabled,
  syncPluginSymlinks,
} from "../core/plugin-takeover.js";

// ============================================================================
// Types
// ============================================================================

type ItemSection = typeof ITEM_SECTIONS[number]["key"];

export interface RemoveResult {
  success: boolean;
  name: string;
  section?: string;
  message?: string;
  error?: string;
}

export interface RemoveBySourceResult {
  removed: string[];
  errors: string[];
}

// ============================================================================
// Manifest helpers
// ============================================================================

async function resolveManifestDir(): Promise<string> {
  const projectDir = path.join(process.cwd(), ".mycelium");
  try {
    await fs.access(path.join(projectDir, "manifest.yaml"));
    return projectDir;
  } catch {
    return expandPath("~/.mycelium");
  }
}

// ============================================================================
// Type flag to section mapping
// ============================================================================

function typeToSection(type: string): ItemSection | null {
  return sectionForType(type) as ItemSection | null;
}

function sectionToType(section: ItemSection): string {
  const entry = ITEM_SECTIONS.find(s => s.key === section);
  return entry?.type ?? section;
}

// ============================================================================
// Core functions
// ============================================================================

/**
 * Find an item across all manifest sections. Returns all matches.
 */
function findItemInManifest(
  manifest: ManifestConfig,
  name: string,
): { section: ItemSection; config: ItemConfig }[] {
  const matches: { section: ItemSection; config: ItemConfig }[] = [];
  for (const { key: section } of ITEM_SECTIONS) {
    const sectionData = manifest[section] as Record<string, ItemConfig> | undefined;
    if (sectionData && typeof sectionData === "object" && !Array.isArray(sectionData) && name in sectionData) {
      matches.push({ section, config: sectionData[name] });
    }
  }
  return matches;
}

/**
 * Remove an item: mark as deleted in manifest + purge files/symlinks.
 * Use --soft to skip file cleanup (old behavior).
 */
export async function removeItem(
  name: string,
  opts?: { type?: string; manifestDir?: string; soft?: boolean },
): Promise<RemoveResult> {
  const log = getTracer().createTrace("remove");
  log.info({ scope: "manifest", op: "remove", msg: `Removing ${name}`, item: name });
  const manifestDir = opts?.manifestDir ?? await resolveManifestDir();
  const manifest = await loadStateManifest(manifestDir);
  if (!manifest) {
    const error = `Could not load manifest from ${manifestDir}`;
    log.error({ scope: "manifest", op: "remove", msg: error, item: name, error });
    return { success: false, name, error };
  }

  let matches = findItemInManifest(manifest, name);

  // Filter by type if provided
  if (opts?.type) {
    const section = typeToSection(opts.type);
    if (!section) {
      return { success: false, name, error: `Invalid type: ${opts.type}. Use: ${ALL_ITEM_TYPES.join(", ")}` };
    }
    matches = matches.filter((m) => m.section === section);
  }

  if (matches.length === 0) {
    // Allow removing filesystem-only items not in manifest
    if (opts?.type) {
      const section = typeToSection(opts.type);
      if (section) {
        const sectionData = (manifest[section] ?? {}) as Record<string, ItemConfig>;
        sectionData[name] = { state: "deleted" };
        (manifest as any)[section] = sectionData;
        await saveStateManifest(manifestDir, manifest);
        if (!opts?.soft) await purgeItemFiles(name, opts.type, log);
        const msg = `${opts.type} '${name}' removed`;
        log.info({ scope: "manifest", op: "remove", msg, item: name });
        return { success: true, name, section: opts.type, message: msg };
      }
    }
    const error = `'${name}' not found in manifest`;
    log.error({ scope: "manifest", op: "remove", msg: error, item: name, error });
    return { success: false, name, error };
  }

  if (matches.length > 1 && !opts?.type) {
    const sections = matches.map((m) => sectionToType(m.section));
    return {
      success: false,
      name,
      error: `'${name}' found in multiple sections: ${sections.join(", ")}. Use --type to disambiguate.`,
    };
  }

  const match = matches[0];
  const itemType = sectionToType(match.section);

  // Check if item belongs to a taken-over plugin
  const pluginOrigin = match.config.pluginOrigin;

  // Mark as deleted
  match.config.state = "deleted";
  const sectionData = manifest[match.section] as Record<string, ItemConfig>;
  sectionData[name] = match.config;

  // If from a plugin, check if ALL components are now deleted → release plugin
  if (pluginOrigin?.pluginId && manifest.takenOverPlugins) {
    await releasePluginIfFullyDeleted(manifest, pluginOrigin.pluginId, manifestDir, log);
  }

  await saveStateManifest(manifestDir, manifest);

  // Purge files/symlinks (default behavior)
  if (!opts?.soft) {
    await purgeItemFiles(name, itemType, log);
    // Re-sync plugin symlinks to clean up
    if (pluginOrigin) {
      await syncPluginSymlinks(manifestDir);
    }
  }

  const action = opts?.soft ? "marked as deleted" : "removed";
  const msg = `${itemType} '${name}' ${action}`;
  log.info({ scope: "manifest", op: "remove", msg, item: name });
  return { success: true, name, section: itemType, message: msg };
}

/**
 * Remove all items from a plugin — marks all components as deleted,
 * releases plugin takeover, and purges files.
 */
export async function removePlugin(
  pluginName: string,
  opts?: { manifestDir?: string; soft?: boolean },
): Promise<RemoveBySourceResult> {
  const log = getTracer().createTrace("remove");
  const manifestDir = opts?.manifestDir ?? await resolveManifestDir();
  const manifest = await loadStateManifest(manifestDir);
  if (!manifest) {
    return { removed: [], errors: [`Could not load manifest from ${manifestDir}`] };
  }

  const removed: string[] = [];

  // Find matching plugin in takenOverPlugins
  let matchedPluginId: string | null = null;
  if (manifest.takenOverPlugins) {
    for (const pluginId of Object.keys(manifest.takenOverPlugins)) {
      if (pluginId.startsWith(pluginName + "@") || pluginId === pluginName) {
        matchedPluginId = pluginId;
        break;
      }
    }
  }

  // 1. Mark all items with this pluginOrigin as deleted
  if (matchedPluginId) {
    for (const { key: section } of ITEM_SECTIONS) {
      const sectionData = manifest[section] as Record<string, ItemConfig> | undefined;
      if (!sectionData || typeof sectionData !== "object" || Array.isArray(sectionData)) continue;
      for (const [name, config] of Object.entries(sectionData)) {
        if (config.pluginOrigin?.pluginId === matchedPluginId) {
          config.state = "deleted";
          removed.push(`${sectionToType(section)}: ${name}`);
          if (!opts?.soft) {
            await purgeItemFiles(name, sectionToType(section), log);
          }
        }
      }
    }

    // 2. Release plugin takeover
    delete manifest.takenOverPlugins![matchedPluginId];
    if (manifest.takenOverPlugins && Object.keys(manifest.takenOverPlugins).length === 0) {
      delete manifest.takenOverPlugins;
    }

    // 3. Re-enable plugin in Claude Code settings
    try {
      await setPluginEnabled(matchedPluginId, true);
    } catch { /* best effort */ }

    // 4. Remove from installed_plugins.json
    try {
      const ipPath = path.join(os.homedir(), ".claude", "plugins", "installed_plugins.json");
      const raw = await fs.readFile(ipPath, "utf-8");
      const data = JSON.parse(raw) as { version?: number; plugins?: Record<string, unknown> };
      if (data.version === 2 && data.plugins && matchedPluginId in data.plugins) {
        delete data.plugins[matchedPluginId];
        await fs.writeFile(ipPath, JSON.stringify(data, null, 2) + "\n", "utf-8");
        log.info({ scope: "plugin", op: "cleanup", msg: `Removed ${matchedPluginId} from installed_plugins.json`, item: matchedPluginId });
      }
    } catch { /* best effort */ }

    // 5. Delete plugin cache directory
    try {
      const atIdx = matchedPluginId.lastIndexOf("@");
      if (atIdx > 0) {
        const pluginPart = matchedPluginId.slice(0, atIdx);
        const marketplacePart = matchedPluginId.slice(atIdx + 1);
        const cacheDir = path.join(os.homedir(), ".claude", "plugins", "cache", marketplacePart, pluginPart);
        await fs.rm(cacheDir, { recursive: true, force: true });
        log.info({ scope: "plugin", op: "cleanup", msg: `Deleted cache: ${cacheDir}`, item: matchedPluginId });
      }
    } catch { /* best effort */ }

    log.info({ scope: "plugin", op: "release", msg: `Released plugin takeover: ${matchedPluginId}`, item: matchedPluginId });
  }

  // 2b. Also mark items by source name (for non-plugin items)
  if (removed.length === 0) {
    for (const { key: section } of ITEM_SECTIONS) {
      const sectionData = manifest[section] as Record<string, ItemConfig> | undefined;
      if (!sectionData || typeof sectionData !== "object" || Array.isArray(sectionData)) continue;
      for (const [name, config] of Object.entries(sectionData)) {
        if (config.source === pluginName) {
          config.state = "deleted";
          removed.push(`${sectionToType(section)}: ${name}`);
          if (!opts?.soft) {
            await purgeItemFiles(name, sectionToType(section), log);
          }
        }
      }
    }
  }

  if (removed.length === 0) {
    return { removed: [], errors: [`No items found for plugin '${pluginName}'`] };
  }

  await saveStateManifest(manifestDir, manifest);

  // Sync plugin symlinks to clean up
  if (matchedPluginId) {
    await syncPluginSymlinks(manifestDir);
  }

  return { removed, errors: [] };
}

/**
 * Legacy: mark all items from a source as deleted (soft only).
 */
export async function removeBySource(
  source: string,
  opts?: { manifestDir?: string },
): Promise<RemoveBySourceResult> {
  return removePlugin(source, { manifestDir: opts?.manifestDir });
}

// ============================================================================
// Plugin release helper
// ============================================================================

/**
 * If ALL components from a plugin are now deleted, release the plugin takeover.
 */
async function releasePluginIfFullyDeleted(
  manifest: ManifestConfig,
  pluginId: string,
  manifestDir: string,
  log: ReturnType<ReturnType<typeof getTracer>["createTrace"]>,
): Promise<void> {
  if (!manifest.takenOverPlugins?.[pluginId]) return;

  // Check if any component from this plugin is still NOT deleted
  for (const { key: section } of ITEM_SECTIONS) {
    const sectionData = manifest[section] as Record<string, ItemConfig> | undefined;
    if (!sectionData) continue;
    for (const [, config] of Object.entries(sectionData)) {
      if (config.pluginOrigin?.pluginId === pluginId && config.state !== "deleted") {
        return; // Still has active components — don't release
      }
    }
  }

  // All components deleted — release plugin
  delete manifest.takenOverPlugins[pluginId];
  if (manifest.takenOverPlugins && Object.keys(manifest.takenOverPlugins).length === 0) {
    delete manifest.takenOverPlugins;
  }

  try {
    await setPluginEnabled(pluginId, true);
    log.info({ scope: "plugin", op: "release", msg: `Released plugin takeover: ${pluginId} (all components deleted)`, item: pluginId });
  } catch { /* best effort */ }
}

// ============================================================================
// Purge helpers
// ============================================================================

/**
 * Delete source files from mycelium dirs and remove symlinks from all tools.
 */
async function purgeItemFiles(
  name: string,
  type: string,
  log: ReturnType<ReturnType<typeof getTracer>["createTrace"]>,
): Promise<void> {
  const DIR_MAP: Record<string, string> = {
    skill: "skills", mcp: "mcps", agent: "agents",
    command: "commands", rule: "rules", hook: "hooks",
  };
  const dirName = DIR_MAP[type] || `${type}s`;

  // 1. Delete source files from global dir
  const sourceDir = path.join(MYCELIUM_HOME, "global", dirName, name);
  try {
    await fs.rm(sourceDir, { recursive: true, force: true });
    log.info({ scope: "purge", op: "delete-source", msg: `Deleted ${sourceDir}`, item: name });
  } catch { /* doesn't exist, fine */ }

  // Also try single-file items (e.g., rules/name.md)
  for (const ext of [".md", ".yaml", ".yml"]) {
    const filePath = path.join(MYCELIUM_HOME, "global", dirName, `${name}${ext}`);
    try { await fs.unlink(filePath); } catch { /* noop */ }
  }

  // 2. Remove symlinks/copies from all tool directories
  const pathKey = type === "skill" ? "skills" as const
    : type === "agent" ? "agents" as const
    : type === "command" ? "commands" as const
    : type === "rule" ? "rules" as const
    : null;

  if (pathKey) {
    for (const [, desc] of Object.entries(TOOL_REGISTRY)) {
      const itemPath = desc.paths[pathKey];
      if (!itemPath) continue;
      const resolved = resolvePath(itemPath);
      if (!resolved) continue;
      for (const candidate of [name, `${name}.md`, `${name}.yaml`, `${name}.yml`]) {
        const targetPath = path.join(resolved, candidate);
        try {
          const stats = await fs.lstat(targetPath);
          if (stats.isSymbolicLink() || stats.isFile()) {
            await fs.unlink(targetPath);
            log.info({ scope: "purge", op: "delete-target", msg: `Removed ${targetPath}`, item: name });
          } else if (stats.isDirectory()) {
            await fs.rm(targetPath, { recursive: true, force: true });
            log.info({ scope: "purge", op: "delete-target", msg: `Removed ${targetPath}`, item: name });
          }
        } catch { /* doesn't exist */ }
      }
    }
  }
}

// ============================================================================
// Commander.js Commands
// ============================================================================

const pluginCmd = new Command("plugin")
  .description("Remove all items from a plugin and release takeover")
  .argument("<name>", "Plugin name (e.g., 'superpowers' or 'superpowers@marketplace')")
  .option("--soft", "Only mark as deleted in manifest (no file cleanup)")
  .action(async (name: string, options: { soft?: boolean }) => {
    const result = await removePlugin(name, { soft: options.soft });
    if (result.removed.length > 0) {
      console.log("Removed:");
      for (const r of result.removed) {
        console.log(`  - ${r}`);
      }
    }
    if (result.errors.length > 0) {
      for (const e of result.errors) {
        console.error(e);
      }
    }
    if (result.removed.length === 0 && result.errors.length > 0) {
      process.exit(1);
    }
  });

export const removeCommand = new Command("remove")
  .description("Remove an item from mycelium sync (deletes files + symlinks)")
  .argument("<name>", "Name of the item to remove")
  .option("--type <type>", "Item type if name is ambiguous")
  .option("--soft", "Only mark as deleted in manifest (no file cleanup)")
  .action(async (name: string, options: { type?: string; soft?: boolean }) => {
    const result = await removeItem(name, { type: options.type, soft: options.soft });
    if (result.success) {
      console.log(`✓ ${result.message}`);
    } else {
      console.error(`✗ Error: ${result.error}`);
      process.exit(1);
    }
  });

removeCommand.addCommand(pluginCmd);
