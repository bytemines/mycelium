/**
 * File Syncer for Mycelium
 *
 * Generalized file sync using symlink or copy strategy.
 * Handles create/update/remove based on item state, with orphan cleanup.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ItemState } from "@mycelish/core";

// ============================================================================
// Types
// ============================================================================

export interface FileSyncStrategy {
  type: "symlink" | "copy";
}

export interface FileSyncItem {
  name: string;
  path: string;
  state?: ItemState;
}

export interface FileSyncResult {
  success: boolean;
  created: string[];
  updated: string[];
  removed: string[];
  unchanged: string[];
  errors: Array<{ item: string; error: string }>;
}

// ============================================================================
// Core
// ============================================================================

/**
 * Sync files from source paths to a target directory using symlink or copy strategy.
 */
export async function syncFilesToDir(
  items: FileSyncItem[],
  targetDir: string,
  strategy: FileSyncStrategy,
  options?: { removeOrphans?: boolean }
): Promise<FileSyncResult> {
  const result: FileSyncResult = {
    success: true,
    created: [],
    updated: [],
    removed: [],
    unchanged: [],
    errors: [],
  };

  await fs.mkdir(targetDir, { recursive: true });

  const itemNames = new Set(items.map((i) => i.name));

  for (const item of items) {
    const targetPath = path.join(targetDir, path.basename(item.path));
    const isEnabled = !item.state || item.state === "enabled";

    if (isEnabled) {
      try {
        const action =
          strategy.type === "symlink"
            ? await syncSymlink(item.path, targetPath)
            : await syncCopy(item.path, targetPath);

        if (action === "created") result.created.push(item.name);
        else if (action === "updated") result.updated.push(item.name);
        else result.unchanged.push(item.name);
      } catch (error) {
        result.success = false;
        result.errors.push({
          item: item.name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    } else {
      // Remove disabled/deleted items
      const removed = await tryRemove(targetPath, strategy.type);
      if (removed) result.removed.push(item.name);
    }
  }

  if (options?.removeOrphans) {
    await removeOrphans(targetDir, itemNames, strategy.type, result);
  }

  return result;
}

// ============================================================================
// Internal helpers
// ============================================================================

async function syncSymlink(
  sourcePath: string,
  targetPath: string
): Promise<"created" | "updated" | "unchanged"> {
  let stats;
  try {
    stats = await fs.lstat(targetPath);
  } catch {
    await fs.symlink(sourcePath, targetPath);
    return "created";
  }

  if (stats.isSymbolicLink()) {
    const current = await fs.readlink(targetPath);
    if (current === sourcePath) return "unchanged";
    await fs.unlink(targetPath);
    await fs.symlink(sourcePath, targetPath);
    return "updated";
  }

  // Not a symlink — replace
  await fs.unlink(targetPath);
  await fs.symlink(sourcePath, targetPath);
  return "updated";
}

async function syncCopy(
  sourcePath: string,
  targetPath: string
): Promise<"created" | "updated" | "unchanged"> {
  let targetStats;
  try {
    targetStats = await fs.stat(targetPath);
  } catch {
    await fs.copyFile(sourcePath, targetPath);
    return "created";
  }

  const sourceStats = await fs.stat(sourcePath);
  if (sourceStats.mtimeMs > targetStats.mtimeMs) {
    await fs.copyFile(sourcePath, targetPath);
    return "updated";
  }

  return "unchanged";
}

async function tryRemove(
  targetPath: string,
  strategyType: "symlink" | "copy"
): Promise<boolean> {
  try {
    const stats = await fs.lstat(targetPath);
    if (strategyType === "symlink" && !stats.isSymbolicLink()) return false;
    await fs.unlink(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function removeOrphans(
  targetDir: string,
  itemNames: Set<string>,
  strategyType: "symlink" | "copy",
  result: FileSyncResult
): Promise<void> {
  try {
    const entries = await fs.readdir(targetDir);
    for (const entry of entries) {
      // Derive item name from the filename to check against known items
      if (itemNames.has(path.parse(entry).name))
        continue;

      const entryPath = path.join(targetDir, entry);
      try {
        const stats = await fs.lstat(entryPath);
        if (strategyType === "symlink" && !stats.isSymbolicLink()) continue;
        await fs.unlink(entryPath);
        result.removed.push(entry);
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
}
