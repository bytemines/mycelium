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
import { parse as yamlParse, stringify as yamlStringify } from "yaml";
import { expandPath } from "@mycelish/core";
import { getTracer } from "../core/global-tracer.js";

// ============================================================================
// Types
// ============================================================================

type ItemSection = "skills" | "mcps" | "hooks" | "memory";
const ALL_SECTIONS: ItemSection[] = ["skills", "mcps", "hooks", "memory"];

interface ManifestConfig {
  version: string;
  skills?: Record<string, Record<string, unknown>>;
  mcps?: Record<string, Record<string, unknown>>;
  hooks?: Record<string, Record<string, unknown>>;
  memory?: Record<string, Record<string, unknown>>;
  [key: string]: unknown;
}

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
// Manifest helpers (same pattern as disable.ts / enable.ts)
// ============================================================================

async function resolveManifestDir(): Promise<string> {
  // Prefer project-level, fall back to global
  const projectDir = path.join(process.cwd(), ".mycelium");
  try {
    await fs.access(path.join(projectDir, "manifest.yaml"));
    return projectDir;
  } catch {
    return expandPath("~/.mycelium");
  }
}

async function loadManifest(manifestDir: string): Promise<ManifestConfig | null> {
  const manifestPath = path.join(manifestDir, "manifest.yaml");
  try {
    const content = await fs.readFile(manifestPath, "utf-8");
    return yamlParse(content) as ManifestConfig;
  } catch {
    return null;
  }
}

async function saveManifest(manifestDir: string, manifest: ManifestConfig): Promise<void> {
  const manifestPath = path.join(manifestDir, "manifest.yaml");
  const content = yamlStringify(manifest);
  await fs.writeFile(manifestPath, content, "utf-8");
}

// ============================================================================
// Type flag to section mapping
// ============================================================================

function typeToSection(type: string): ItemSection | null {
  const map: Record<string, ItemSection> = {
    skill: "skills",
    mcp: "mcps",
    hook: "hooks",
    memory: "memory",
  };
  return map[type] ?? null;
}

function sectionToType(section: ItemSection): string {
  const map: Record<ItemSection, string> = {
    skills: "skill",
    mcps: "mcp",
    hooks: "hook",
    memory: "memory",
  };
  return map[section];
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
): { section: ItemSection; config: Record<string, unknown> }[] {
  const matches: { section: ItemSection; config: Record<string, unknown> }[] = [];
  for (const section of ALL_SECTIONS) {
    const sectionData = manifest[section] as Record<string, Record<string, unknown>> | undefined;
    if (sectionData && name in sectionData) {
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
  const manifest = await loadManifest(manifestDir);
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
      return { success: false, name, error: `Invalid type: ${opts.type}. Use: skill, mcp, hook, memory` };
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
  const sectionData = manifest[match.section] as Record<string, Record<string, unknown>>;
  sectionData[name] = match.config;

  await saveManifest(manifestDir, manifest);

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
  const manifest = await loadManifest(manifestDir);
  if (!manifest) {
    return { removed: [], errors: [`Could not load manifest from ${manifestDir}`] };
  }

  const removed: string[] = [];

  for (const section of ALL_SECTIONS) {
    const sectionData = manifest[section] as Record<string, Record<string, unknown>> | undefined;
    if (!sectionData) continue;

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

  await saveManifest(manifestDir, manifest);
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
  .option("--type <type>", "Item type if name is ambiguous (skill, mcp, hook, memory)")
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
