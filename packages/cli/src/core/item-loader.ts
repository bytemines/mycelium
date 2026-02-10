/**
 * Item Loader for Mycelium
 *
 * Scans a directory for items (agents, rules, commands, etc.)
 * and returns structured LoadedItem entries.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ItemState } from "@mycelish/core";

// ============================================================================
// Types
// ============================================================================

export interface LoadedItem {
  name: string;
  path: string;
  state?: ItemState;
}

// ============================================================================
// Core
// ============================================================================

const DEFAULT_EXTENSIONS = [".md", ".yaml", ".yml"];

/**
 * Scan a directory for items. Returns LoadedItem[] with name derived from filename.
 * Returns [] if directory does not exist.
 */
export async function loadItemsFromDir(
  dir: string,
  extensions?: string[]
): Promise<LoadedItem[]> {
  const exts = extensions ?? DEFAULT_EXTENSIONS;

  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }

  const items: LoadedItem[] = [];

  for (const entry of entries) {
    if (entry.startsWith(".")) continue;

    const ext = path.extname(entry).toLowerCase();
    if (exts.length > 0 && !exts.includes(ext)) continue;

    items.push({
      name: path.parse(entry).name,
      path: path.join(dir, entry),
    });
  }

  return items;
}
