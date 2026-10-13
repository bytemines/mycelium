/**
 * File Syncer for Mycelium
 *
 * Generalized file sync using symlink or copy strategy.
 * Handles create/update/remove based on item state, with orphan cleanup.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ItemState } from "@mycelish/core";
import { constants } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { MYCELIUM_HOME } from "./fs-helpers.js";
import { assertContainedPath, assertSafePathComponent } from "./path-safety.js";

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

const COPY_RECORD = ".mycelium-copy-ownership.json";
type CopyOwners = Record<string, { source: string; hash: string }>;
const contentHash = (content: Buffer): string => createHash("sha256").update(content).digest("hex");

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
  options?: { removeOrphans?: boolean; projectRoot?: string }
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
  let owners: CopyOwners = Object.create(null);
  try {
    if (strategy.type === "copy") owners = await loadCopyOwners(targetDir);
  } catch (error) {
    result.success = false;
    result.errors.push({ item: COPY_RECORD, error: error instanceof Error ? error.message : String(error) });
    return result;
  }
  const originalOwners = JSON.stringify(owners);
  const itemFiles = new Set(items.map(i => path.basename(i.path)));

  for (const item of items) {
    const targetPath = path.join(targetDir, path.basename(item.path));
    const isEnabled = !item.state || item.state === "enabled";

    try {
      const filename = path.basename(item.path);
      assertSafePathComponent(filename);
      if (filename === COPY_RECORD) throw new Error("Reserved copy metadata filename");
      assertContainedPath(targetDir, path.dirname(targetPath));
      if (isEnabled) {
        const action =
          strategy.type === "symlink"
            ? await syncSymlink(item.path, targetPath, options?.projectRoot)
            : await syncCopy(item.path, targetPath, owners);

        if (action === "created") result.created.push(item.name);
        else if (action === "updated") result.updated.push(item.name);
        else result.unchanged.push(item.name);
      } else {
        const removed = strategy.type === "copy"
          ? await removeOwnedCopy(targetDir, filename, owners, item.path)
          : await tryRemove(targetPath, strategy.type, item.path);
        if (removed) result.removed.push(item.name);
      }
    } catch (error) {
      result.success = false;
      result.errors.push({ item: item.name, error: error instanceof Error ? error.message : String(error) });
    }
  }

  if (options?.removeOrphans) {
    if (strategy.type === "copy") {
      for (const filename of Object.keys(owners)) {
        if (itemFiles.has(filename)) continue;
        try {
          if (await removeOwnedCopy(targetDir, filename, owners)) result.removed.push(filename);
        } catch (error) {
          result.success = false;
          result.errors.push({ item: filename, error: error instanceof Error ? error.message : String(error) });
        }
      }
    } else {
      await removeOrphans(targetDir, itemFiles, strategy.type, result, options?.projectRoot);
    }
  }
  if (strategy.type === "copy" && JSON.stringify(owners) !== originalOwners) {
    try { await saveCopyOwners(targetDir, owners); } catch (error) {
      result.success = false;
      result.errors.push({ item: COPY_RECORD, error: error instanceof Error ? error.message : String(error) });
    }
  }

  return result;
}

// ============================================================================
// Internal helpers
// ============================================================================

async function syncSymlink(
  sourcePath: string,
  targetPath: string,
  projectRoot?: string,
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
    if (!isManagedLink(targetPath, current, projectRoot)) throw new Error(`Preserving unmanaged symlink: ${targetPath}`);
    await fs.unlink(targetPath);
    await fs.symlink(sourcePath, targetPath);
    return "updated";
  }

  throw new Error(`Preserving native file or directory: ${targetPath}`);
}

async function syncCopy(
  sourcePath: string,
  targetPath: string,
  owners: CopyOwners,
): Promise<"created" | "updated" | "unchanged"> {
  assertContainedPath(path.dirname(targetPath), targetPath);
  const filename = path.basename(targetPath);
  const source = path.resolve(sourcePath);
  const content = await fs.readFile(sourcePath);
  const hash = contentHash(content);
  let exists = true;
  try {
    const stats = await fs.lstat(targetPath);
    if (!stats.isFile()) throw new Error(`Preserving native file or directory: ${targetPath}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    exists = false;
  }
  if (!exists) {
    await fs.writeFile(targetPath, content, { flag: "wx" });
    owners[filename] = { source, hash };
    return "created";
  }
  const currentHash = contentHash(await fs.readFile(targetPath));
  const owner = owners[filename];
  if (owner && (owner.source !== source || owner.hash !== currentHash)) {
    throw new Error(`Preserving user-edited or differently sourced copy: ${targetPath}`);
  }
  if (currentHash === hash) return "unchanged";
  if (!owner) {
    // Legacy/native copies may be adopted only after preserving their original once.
    const backup = `${targetPath}.mycelium-backup`;
    assertContainedPath(path.dirname(targetPath), backup);
    await fs.copyFile(targetPath, backup, constants.COPYFILE_EXCL);
  }
  await fs.writeFile(targetPath, content);
  owners[filename] = { source, hash };
  return "updated";
}

async function loadCopyOwners(targetDir: string): Promise<CopyOwners> {
  const recordPath = path.join(targetDir, COPY_RECORD);
  assertContainedPath(targetDir, recordPath);
  let raw: string;
  try {
    const stats = await fs.lstat(recordPath);
    if (!stats.isFile()) throw new Error("Copy ownership metadata must be a regular file");
    raw = await fs.readFile(recordPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return Object.create(null);
    throw error;
  }
  const record = JSON.parse(raw);
  if (record?.version !== 1 || !record.files || typeof record.files !== "object" || Array.isArray(record.files)) {
    throw new Error("Invalid copy ownership metadata");
  }
  const owners: CopyOwners = Object.create(null);
  for (const [filename, value] of Object.entries(record.files)) {
    assertSafePathComponent(filename);
    const owner = value as CopyOwners[string];
    if (filename === COPY_RECORD || !owner || typeof owner.source !== "string" || !path.isAbsolute(owner.source) || owner.source.includes("\0") || typeof owner.hash !== "string" || !/^[a-f0-9]{64}$/.test(owner.hash)) {
      throw new Error("Invalid copy ownership metadata");
    }
    owners[filename] = { source: owner.source, hash: owner.hash };
  }
  return owners;
}

async function saveCopyOwners(targetDir: string, owners: CopyOwners): Promise<void> {
  const recordPath = path.join(targetDir, COPY_RECORD);
  assertContainedPath(targetDir, recordPath);
  const temporary = `${recordPath}.${randomUUID()}.tmp`;
  assertContainedPath(targetDir, temporary);
  let created = false;
  try {
    await fs.writeFile(temporary, JSON.stringify({ version: 1, files: owners }), { flag: "wx" });
    created = true;
    await fs.rename(temporary, recordPath);
  } finally {
    if (created) await fs.rm(temporary, { force: true });
  }
}

async function removeOwnedCopy(targetDir: string, filename: string, owners: CopyOwners, sourcePath?: string): Promise<boolean> {
  const owner = owners[filename];
  if (!owner || (sourcePath && owner.source !== path.resolve(sourcePath))) return false;
  const targetPath = path.join(targetDir, filename);
  try {
    const stats = await fs.lstat(targetPath);
    if (!stats.isFile()) return false;
    assertContainedPath(targetDir, targetPath);
    if (contentHash(await fs.readFile(targetPath)) !== owner.hash) return false;
    await fs.unlink(targetPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    delete owners[filename];
    return false;
  }
  delete owners[filename];
  return true;
}

async function tryRemove(
  targetPath: string,
  strategyType: "symlink" | "copy",
  sourcePath: string,
): Promise<boolean> {
  try {
    const stats = await fs.lstat(targetPath);
    if (strategyType !== "symlink" || !stats.isSymbolicLink()) return false;
    const current = await fs.readlink(targetPath);
    if (path.resolve(path.dirname(targetPath), current) !== path.resolve(sourcePath)) return false;
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
  result: FileSyncResult,
  projectRoot?: string,
): Promise<void> {
  if (strategyType !== "symlink") return;
  try {
    const entries = await fs.readdir(targetDir);
    for (const entry of entries) {
      // Match destination filenames, which need not match public item names.
      if (itemNames.has(entry))
        continue;

      const entryPath = path.join(targetDir, entry);
      try {
        const stats = await fs.lstat(entryPath);
        if (!stats.isSymbolicLink()) continue;
        if (!isManagedLink(entryPath, await fs.readlink(entryPath), projectRoot)) continue;
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

function isManagedLink(link: string, target: string, projectRoot?: string): boolean {
  const roots = [MYCELIUM_HOME];
  if (projectRoot) roots.push(path.join(projectRoot, ".mycelium"));
  return roots.some(root => {
    const relative = path.relative(root, path.resolve(path.dirname(link), target));
    return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
  });
}
