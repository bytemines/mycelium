/**
 * Manifest State Module — Single source of truth for item enabled/disabled state
 *
 * All code paths that need to know if an item is enabled or disabled MUST use
 * this module. The state manifest is at ~/.mycelium/manifest.yaml (global)
 * and .mycelium/manifest.yaml (project).
 *
 * This is DIFFERENT from the migration manifest (migration-manifest.json)
 * which tracks import history.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { parse as yamlParse, stringify as yamlStringify } from "yaml";
import { expandPath } from "@mycelish/core";
import { readFileIfExists } from "./fs-helpers.js";

import type { ToolId } from "@mycelish/core";

// ============================================================================
// Types
// ============================================================================

type ItemState = "enabled" | "disabled" | "deleted";

export interface ItemConfig {
  state?: ItemState;
  source?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  tools?: ToolId[];
  excludeTools?: ToolId[];
  enabledTools?: ToolId[];
}

export interface ManifestConfig {
  version: string;
  tools?: Record<string, { enabled: boolean }>;
  skills?: Record<string, ItemConfig>;
  mcps?: Record<string, ItemConfig>;
  hooks?: Record<string, ItemConfig>;
  memory?: Record<string, ItemConfig> | unknown;
  agents?: Record<string, ItemConfig>;
  commands?: Record<string, ItemConfig>;
}

// ============================================================================
// Load / Save
// ============================================================================

/**
 * Load manifest.yaml from a directory. Auto-creates an empty one if the
 * directory exists but the file doesn't.
 */
export async function loadStateManifest(manifestDir: string): Promise<ManifestConfig | null> {
  const manifestPath = path.join(manifestDir, "manifest.yaml");
  try {
    const content = await fs.readFile(manifestPath, "utf-8");
    return yamlParse(content) as ManifestConfig;
  } catch {
    // Auto-create empty manifest if the mycelium directory exists
    try {
      await fs.access(manifestDir);
      const empty: ManifestConfig = { version: "1.0.0", skills: {}, mcps: {}, hooks: {}, memory: {} };
      await fs.writeFile(manifestPath, yamlStringify(empty), "utf-8");
      return empty;
    } catch {
      return null;
    }
  }
}

/**
 * Save manifest.yaml to a directory.
 */
export async function saveStateManifest(manifestDir: string, manifest: ManifestConfig): Promise<void> {
  const manifestPath = path.join(manifestDir, "manifest.yaml");
  await fs.writeFile(manifestPath, yamlStringify(manifest), "utf-8");
}

// ============================================================================
// Query Helpers
// ============================================================================

/**
 * Find an item by name across all sections (skills, mcps, hooks, memory).
 */
export type ItemType = "skill" | "mcp" | "hook" | "memory" | "agent" | "command";

/**
 * Central registry of item sections. To add a new item type:
 * 1. Add the section to ManifestConfig interface
 * 2. Add an entry here
 * Everything else (findItemType, getDisabledItems, sectionForType) derives from this.
 */
export const ITEM_SECTIONS: { key: keyof ManifestConfig; type: ItemType }[] = [
  { key: "skills", type: "skill" },
  { key: "mcps", type: "mcp" },
  { key: "hooks", type: "hook" },
  { key: "agents", type: "agent" },
  { key: "commands", type: "command" },
  { key: "memory", type: "memory" },
];

export const ALL_ITEM_TYPES: ItemType[] = ITEM_SECTIONS.map(s => s.type);

/** Get the manifest section key for an item type (e.g., "skill" → "skills") */
export function sectionForType(type: string): keyof ManifestConfig | null {
  const entry = ITEM_SECTIONS.find(s => s.type === type);
  return entry?.key ?? null;
}

export function findItemType(
  manifest: ManifestConfig,
  name: string,
): { type: ItemType; config: ItemConfig } | null {
  for (const { key, type } of ITEM_SECTIONS) {
    const section = manifest[key];
    if (section && typeof section === "object" && !Array.isArray(section) && name in (section as Record<string, ItemConfig>)) {
      return { type, config: (section as Record<string, ItemConfig>)[name] };
    }
  }
  return null;
}

/**
 * Build a set of disabled item names from both global and project manifests.
 * Project-level state overrides global-level state.
 */
export async function getDisabledItems(projectRoot?: string): Promise<Set<string>> {
  const disabledItems = new Set<string>();

  const manifestPaths = [
    path.join(expandPath("~/.mycelium"), "manifest.yaml"),
  ];
  if (projectRoot) {
    manifestPaths.push(path.join(projectRoot, ".mycelium", "manifest.yaml"));
  }

  for (const manifestPath of manifestPaths) {
    const content = await readFileIfExists(manifestPath);
    if (!content) continue;
    const manifest = yamlParse(content) as ManifestConfig | null;
    if (!manifest) continue;

    for (const { key: section } of ITEM_SECTIONS) {
      const items = manifest[section];
      if (!items || typeof items !== "object" || Array.isArray(items)) continue;
      for (const [itemName, config] of Object.entries(items as Record<string, ItemConfig>)) {
        const state = config?.state;
        if (state === "disabled" || state === "deleted") {
          disabledItems.add(itemName);
        } else if (state === "enabled") {
          // Project can re-enable a globally disabled item
          disabledItems.delete(itemName);
        }
      }
    }
  }

  return disabledItems;
}

// ============================================================================
// Item State Query (for verification / testing)
// ============================================================================

export interface ItemStateInfo {
  name: string;
  found: boolean;
  type?: ItemType;
  state?: string;
  level?: "global" | "project";
  tools?: ToolId[];
  excludeTools?: ToolId[];
  enabledTools?: ToolId[];
  effectivelyDisabledForTool?: boolean;
}

/**
 * Get the full state of a specific item, optionally checking if it's disabled
 * for a specific tool. Useful for verification and testing.
 */
export async function getItemState(
  name: string,
  opts?: { projectRoot?: string; tool?: ToolId },
): Promise<ItemStateInfo> {
  const result: ItemStateInfo = { name, found: false };

  // Check project first (higher priority), then global
  const levels: { dir: string; level: "project" | "global" }[] = [];
  if (opts?.projectRoot) {
    levels.push({ dir: path.join(opts.projectRoot, ".mycelium"), level: "project" });
  }
  levels.push({ dir: expandPath("~/.mycelium"), level: "global" });

  for (const { dir, level } of levels) {
    const manifest = await loadStateManifest(dir);
    if (!manifest) continue;
    const item = findItemType(manifest, name);
    if (item) {
      result.found = true;
      result.type = item.type;
      result.state = item.config.state ?? "enabled";
      result.level = level;
      result.tools = item.config.tools;
      result.excludeTools = item.config.excludeTools;
      result.enabledTools = item.config.enabledTools;
      break; // project-level wins
    }
  }

  // Check if effectively disabled for a specific tool
  if (opts?.tool && result.found) {
    const disabled = result.state === "disabled" || result.state === "deleted";
    const excludedFromTool = result.excludeTools?.includes(opts.tool) ?? false;
    const hasToolList = result.tools && result.tools.length > 0;
    const notInToolList = hasToolList && !result.tools!.includes(opts.tool);
    result.effectivelyDisabledForTool = disabled || excludedFromTool || notInToolList;
  }

  return result;
}
