/**
 * Remove command — soft-delete items from mycelium sync.
 *
 * mycelium remove <name>              — Find item in manifest, set state: "deleted"
 * mycelium remove <name> --type mcp   — Disambiguate when name exists in multiple sections
 * mycelium remove plugin <name>       — Mark all items from that source as deleted
 *
 * After removing, run `mycelium sync` to propagate to tool configs.
 */
import { Command } from "commander";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { expandPath } from "@mycelish/core";
import { getTracer } from "../core/global-tracer.js";
import {
  loadStateManifest,
  saveStateManifest,
  ITEM_SECTIONS,
  ALL_ITEM_TYPES,
  sectionForType,
  type ManifestConfig,
  type ItemConfig,
  type ItemType,
} from "../core/manifest-state.js";

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
 * Remove (soft-delete) an item by setting state: "deleted" in manifest.
 */
export async function removeItem(
  name: string,
  opts?: { type?: string; manifestDir?: string },
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
  match.config.state = "deleted";

  // Write back
  const sectionData = manifest[match.section] as Record<string, ItemConfig>;
  sectionData[name] = match.config;

  await saveStateManifest(manifestDir, manifest);

  const msg = `${sectionToType(match.section)} '${name}' marked as deleted`;
  log.info({ scope: "manifest", op: "remove", msg, item: name });
  return { success: true, name, section: sectionToType(match.section), message: msg };
}

/**
 * Mark all items from a given source as deleted.
 */
export async function removeBySource(
  source: string,
  opts?: { manifestDir?: string },
): Promise<RemoveBySourceResult> {
  const manifestDir = opts?.manifestDir ?? await resolveManifestDir();
  const manifest = await loadStateManifest(manifestDir);
  if (!manifest) {
    return { removed: [], errors: [`Could not load manifest from ${manifestDir}`] };
  }

  const removed: string[] = [];

  for (const { key: section } of ITEM_SECTIONS) {
    const sectionData = manifest[section] as Record<string, ItemConfig> | undefined;
    if (!sectionData || typeof sectionData !== "object" || Array.isArray(sectionData)) continue;

    for (const [name, config] of Object.entries(sectionData)) {
      if (config.source === source) {
        config.state = "deleted";
        removed.push(`${sectionToType(section)}: ${name}`);
      }
    }
  }

  if (removed.length === 0) {
    return { removed: [], errors: [`No items found with source '${source}'`] };
  }

  await saveStateManifest(manifestDir, manifest);
  return { removed, errors: [] };
}

// ============================================================================
// Commander.js Commands
// ============================================================================

const pluginCmd = new Command("plugin")
  .description("Remove all items from a plugin/source")
  .argument("<name>", "Plugin/source name")
  .action(async (name: string) => {
    const result = await removeBySource(name);
    if (result.removed.length > 0) {
      console.log("Marked as deleted:");
      for (const r of result.removed) {
        console.log(`  - ${r}`);
      }
      console.log("Run `mycelium sync` to propagate to all tools.");
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
  .description("Remove (soft-delete) an item from mycelium sync")
  .argument("<name>", "Name of the item to remove")
  .option("--type <type>", "Item type if name is ambiguous")
  .action(async (name: string, options: { type?: string }) => {
    const result = await removeItem(name, { type: options.type });
    if (result.success) {
      console.log(`✓ ${result.message}`);
      console.log("Run `mycelium sync` to propagate to all tools.");
    } else {
      console.error(`✗ Error: ${result.error}`);
      process.exit(1);
    }
  });

removeCommand.addCommand(pluginCmd);
