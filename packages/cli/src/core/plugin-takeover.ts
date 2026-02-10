/**
 * Plugin Takeover — disable a Claude Code plugin and symlink its components
 * into the Claude Code directories so Mycelium manages them instead.
 *
 * syncPluginSymlinks() is the SINGLE function that manages all plugin symlinks.
 * disable/enable commands only mutate state, then call syncPluginSymlinks().
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

import { expandPath } from "@mycelish/core";
import { scanPluginComponents } from "./plugin-scanner.js";
import { createSkillSymlink, removeSkillSymlink } from "./symlink-manager.js";
import { readFileIfExists } from "./fs-helpers.js";
import { getDisabledItems, loadStateManifest } from "./manifest-state.js";
import { getTracer } from "./global-tracer.js";

// ============================================================================
// Constants
// ============================================================================

const CLAUDE_HOME = path.join(os.homedir(), ".claude");
const PLUGIN_CACHE_DIR = path.join(CLAUDE_HOME, "plugins", "cache");
const SETTINGS_PATH = path.join(CLAUDE_HOME, "settings.json");

// ============================================================================
// Shared Constants — single source of truth for component dirs + extensions
// ============================================================================

/** Component type to Claude Code directory + file extension mapping. */
export const PLUGIN_COMPONENT_DIRS: Record<string, { dir: string; ext: string; subdir: string }> = {
  skill:   { dir: path.join(CLAUDE_HOME, "skills"),   ext: "",    subdir: "skills" },
  agent:   { dir: path.join(CLAUDE_HOME, "agents"),   ext: ".md", subdir: "agents" },
  command: { dir: path.join(CLAUDE_HOME, "commands"), ext: ".md", subdir: "commands" },
};

/** Get the expected symlink path for a plugin component. */
export function getSymlinkPath(type: string, name: string): string {
  const info = PLUGIN_COMPONENT_DIRS[type];
  if (!info) throw new Error(`Unknown component type: ${type}`);
  return path.join(info.dir, name + info.ext);
}

/** Get the source path for a plugin component in the cache. */
function getSourcePath(cachePath: string, type: string, name: string, componentPath?: string): string {
  const info = PLUGIN_COMPONENT_DIRS[type];
  if (!info) throw new Error(`Unknown component type: ${type}`);
  if (type === "skill") {
    // Skills: symlink the directory containing SKILL.md
    return componentPath ? path.dirname(componentPath) : path.join(cachePath, info.subdir, name);
  }
  // Agents/Commands: symlink the .md file itself
  return componentPath ?? path.join(cachePath, info.subdir, name + info.ext);
}

// ============================================================================
// Types
// ============================================================================

export interface TakenOverPlugin {
  pluginId: string;
  marketplace: string;
  plugin: string;
  version: string;
  cachePath: string;
  allSkills: string[];
  enabledSkills: string[];
}

// ============================================================================
// Helpers
// ============================================================================

/** Parse pluginId "{plugin}@{marketplace}" */
function parsePluginId(pluginId: string): { plugin: string; marketplace: string } {
  const atIdx = pluginId.lastIndexOf("@");
  if (atIdx <= 0) throw new Error(`Invalid plugin ID format: ${pluginId}`);
  return {
    plugin: pluginId.slice(0, atIdx),
    marketplace: pluginId.slice(atIdx + 1),
  };
}

/** Find the latest version directory for a plugin in the cache. */
async function findLatestVersion(pluginDir: string): Promise<string | null> {
  try {
    const entries = await fs.readdir(pluginDir, { withFileTypes: true });
    const versions = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
    return versions[versions.length - 1] ?? null;
  } catch {
    return null;
  }
}

/** Read settings.json, preserving all fields. */
async function readSettings(): Promise<Record<string, unknown>> {
  const raw = await readFileIfExists(SETTINGS_PATH);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Write settings.json, preserving formatting. */
async function writeSettings(settings: Record<string, unknown>): Promise<void> {
  await fs.mkdir(path.dirname(SETTINGS_PATH), { recursive: true });
  await fs.writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2) + "\n", "utf-8");
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Set a plugin's enabled state in ~/.claude/settings.json.
 * Uses read-preserve-write to avoid clobbering other settings.
 */
export async function setPluginEnabled(pluginId: string, enabled: boolean): Promise<void> {
  const settings = await readSettings();
  const plugins = (settings.enabledPlugins as Record<string, boolean>) ?? {};
  plugins[pluginId] = enabled;
  settings.enabledPlugins = plugins;
  await writeSettings(settings);
}

/**
 * Get all skill paths from a plugin's cache directory.
 * Returns an array of absolute paths to skill directories (containing SKILL.md).
 */
export async function getPluginSkillPaths(pluginId: string): Promise<string[]> {
  const { plugin, marketplace } = parsePluginId(pluginId);
  const pluginDir = path.join(PLUGIN_CACHE_DIR, marketplace, plugin);
  const version = await findLatestVersion(pluginDir);
  if (!version) return [];

  const versionRoot = path.join(pluginDir, version);
  const components = await scanPluginComponents(versionRoot, plugin, marketplace);
  return components
    .filter((c) => c.type === "skill")
    .map((c) => path.dirname(c.path)); // skill dir, not SKILL.md
}

/**
 * Scan the plugin cache for enabled plugins containing a component.
 * Shared logic for getPluginForSkill and getAllPluginsForComponent.
 */
async function findPluginsWithComponent(componentName: string): Promise<TakenOverPlugin[]> {
  const settings = await readSettings();
  const enabledPlugins = (settings.enabledPlugins as Record<string, boolean>) ?? {};
  const matches: TakenOverPlugin[] = [];

  try {
    const marketplaces = await fs.readdir(PLUGIN_CACHE_DIR, { withFileTypes: true });
    for (const mp of marketplaces) {
      if (!mp.isDirectory()) continue;
      const mpDir = path.join(PLUGIN_CACHE_DIR, mp.name);

      const plugins = await fs.readdir(mpDir, { withFileTypes: true });
      for (const pl of plugins) {
        if (!pl.isDirectory()) continue;
        const plDir = path.join(mpDir, pl.name);
        const version = await findLatestVersion(plDir);
        if (!version) continue;

        const pluginId = `${pl.name}@${mp.name}`;
        if (enabledPlugins[pluginId] === false) continue;

        const versionRoot = path.join(plDir, version);
        const components = await scanPluginComponents(versionRoot, pl.name, mp.name);

        if (components.some((c) => c.name === componentName)) {
          const skills = components.filter((c) => c.type === "skill").map((c) => c.name);
          matches.push({
            pluginId,
            marketplace: mp.name,
            plugin: pl.name,
            version,
            cachePath: versionRoot,
            allSkills: skills,
            enabledSkills: skills,
          });
        }
      }
    }
  } catch {
    // cache doesn't exist
  }

  return matches;
}

/**
 * Find the first enabled plugin containing a component name.
 */
export async function getPluginForSkill(componentName: string): Promise<TakenOverPlugin | null> {
  const matches = await findPluginsWithComponent(componentName);
  return matches[0] ?? null;
}

/**
 * Find ALL enabled plugins containing a component name.
 * Used when a component exists in multiple plugins — all must be taken over.
 */
export async function getAllPluginsForComponent(componentName: string): Promise<TakenOverPlugin[]> {
  return findPluginsWithComponent(componentName);
}

/**
 * Declarative plugin symlink sync — the SINGLE function that manages ALL
 * plugin symlinks in ~/.claude/{skills,agents,commands}/.
 *
 * Reads the manifest to determine what SHOULD exist, then makes the
 * filesystem match: creates missing symlinks, removes orphans.
 *
 * @param manifestDir - Path to the manifest directory (e.g. ~/.mycelium)
 */
export async function syncPluginSymlinks(manifestDir?: string): Promise<{ created: string[]; removed: string[] }> {
  const dir = manifestDir ?? expandPath("~/.mycelium");
  const manifest = await loadStateManifest(dir);
  if (!manifest?.takenOverPlugins || Object.keys(manifest.takenOverPlugins).length === 0) {
    return { created: [], removed: [] };
  }

  const log = getTracer().createTrace("plugin-sync");
  const disabledItems = await getDisabledItems(dir);

  // Build expected symlinks: Map<symlinkPath, sourcePath>
  const expectedSymlinks = new Map<string, string>();

  for (const [pluginId, pluginInfo] of Object.entries(manifest.takenOverPlugins)) {
    try {
      const components = await scanPluginComponents(pluginInfo.cachePath);
      for (const comp of components) {
        if (!(comp.type in PLUGIN_COMPONENT_DIRS)) continue;
        if (disabledItems.has(comp.name)) continue;

        const symlinkPath = getSymlinkPath(comp.type, comp.name);
        const sourcePath = getSourcePath(pluginInfo.cachePath, comp.type, comp.name, comp.path);
        expectedSymlinks.set(symlinkPath, sourcePath);
      }
    } catch (err) {
      log.warn({ scope: "plugin", op: "scan", msg: `Failed to scan plugin cache for ${pluginId}: ${(err as Error).message}`, item: pluginId });
    }
  }

  const created: string[] = [];
  const removed: string[] = [];

  // Create missing symlinks
  for (const [symlinkPath, sourcePath] of expectedSymlinks) {
    const result = await createSkillSymlink(sourcePath, symlinkPath);
    if (result.success && result.action === "created") {
      const name = path.basename(symlinkPath);
      created.push(name);
      // Proposal 1: log each symlink individually with itemType
      const type = Object.entries(PLUGIN_COMPONENT_DIRS).find(([, v]) => symlinkPath.startsWith(v.dir))?.[0];
      log.info({ scope: "plugin", op: "symlink-create", msg: `Created symlink: ${name}`, item: name.replace(/\.md$/, ""), itemType: type, path: symlinkPath });
    }
  }

  // Remove orphans: symlinks in component dirs that point into plugin cache but aren't expected
  for (const [type, { dir: componentDir }] of Object.entries(PLUGIN_COMPONENT_DIRS)) {
    try {
      const entries = await fs.readdir(componentDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isSymbolicLink()) continue;
        const fullPath = path.join(componentDir, entry.name);
        try {
          const target = await fs.readlink(fullPath);
          if (target.startsWith(PLUGIN_CACHE_DIR) && !expectedSymlinks.has(fullPath)) {
            await removeSkillSymlink(fullPath);
            removed.push(entry.name);
            // Proposal 1: log each removal individually with itemType
            log.info({ scope: "plugin", op: "symlink-remove", msg: `Removed orphan symlink: ${entry.name}`, item: entry.name.replace(/\.md$/, ""), itemType: type, path: fullPath });
          }
        } catch (err) {
          log.warn({ scope: "plugin", op: "symlink", msg: `Failed to read symlink ${fullPath}: ${(err as Error).message}`, path: fullPath });
        }
      }
    } catch {
      // dir doesn't exist — expected for tools that don't use this component type
    }
  }

  if (created.length > 0 || removed.length > 0) {
    log.info({ scope: "plugin", op: "sync", msg: `Plugin symlinks synced: ${created.length} created, ${removed.length} removed` });
  }

  return { created, removed };
}
