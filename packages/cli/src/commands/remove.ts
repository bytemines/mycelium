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
  opts?: { type?: string; manifestDir?: string; purge?: boolean },
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
    // With --purge, allow removing filesystem-only items not in manifest
    if (opts?.purge && opts?.type) {
      const section = typeToSection(opts.type);
      if (section) {
        const sectionData = (manifest[section] ?? {}) as Record<string, ItemConfig>;
        sectionData[name] = { state: "deleted" };
        (manifest as any)[section] = sectionData;
        await saveStateManifest(manifestDir, manifest);
        await purgeItemFiles(name, opts.type, log);
        const msg = `${opts.type} '${name}' purged`;
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
  match.config.state = "deleted";

  // Write back
  const sectionData = manifest[match.section] as Record<string, ItemConfig>;
  sectionData[name] = match.config;

  await saveStateManifest(manifestDir, manifest);

  // Purge: delete source files and symlinks from all tools
  if (opts?.purge) {
    await purgeItemFiles(name, sectionToType(match.section), log);
  }

  const action = opts?.purge ? "purged" : "marked as deleted";
  const msg = `${sectionToType(match.section)} '${name}' ${action}`;
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
  // Map item type to directory name
  const DIR_MAP: Record<string, string> = {
    skill: "skills", mcp: "mcps", agent: "agents",
    command: "commands", rule: "rules", hook: "hooks", memory: "memory",
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
      // Try as directory (skill dirs, agent dirs) and as single file
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
  .option("--purge", "Permanently delete files and symlinks (not just soft-delete)")
  .action(async (name: string, options: { type?: string; purge?: boolean }) => {
    const result = await removeItem(name, { type: options.type, purge: options.purge });
    if (result.success) {
      console.log(`✓ ${result.message}`);
      if (!options.purge) console.log("Run `mycelium sync` to propagate to all tools.");
    } else {
      console.error(`✗ Error: ${result.error}`);
      process.exit(1);
    }
  });

removeCommand.addCommand(pluginCmd);
