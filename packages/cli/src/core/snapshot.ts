/**
 * Snapshot — create, restore, list, and delete config snapshots
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

import type { SnapshotMetadata } from "@mycelium/core";
import { mkdirp } from "./fs-helpers.js";

function getMyceliumDir(): string {
  return path.join(os.homedir(), ".mycelium");
}

function getSnapshotsDir(): string {
  return path.join(getMyceliumDir(), "snapshots");
}

/** Files to capture relative to getMyceliumDir() */
const SNAPSHOT_FILES = [
  "global/mcps.yaml",
  "global/hooks.yaml",
  "migration-manifest.json",
  "marketplaces.yaml",
];

const VALID_NAME = /^[a-zA-Z0-9-]+$/;

// ============================================================================
// Helpers
// ============================================================================

async function copyIfExists(src: string, dest: string): Promise<boolean> {
  try {
    await mkdirp(path.dirname(dest));
    await fs.copyFile(src, dest);
    return true;
  } catch {
    return false;
  }
}

async function copyDirRecursive(src: string, dest: string): Promise<string[]> {
  const files: string[] = [];
  try {
    const entries = await fs.readdir(src, { withFileTypes: true });
    await mkdirp(dest);
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await copyDirRecursive(srcPath, destPath)));
      } else {
        await fs.copyFile(srcPath, destPath);
        files.push(entry.name);
      }
    }
  } catch {
    // directory doesn't exist, skip
  }
  return files;
}

async function rmrf(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
}

// ============================================================================
// Public API
// ============================================================================

export async function createSnapshot(
  name: string,
  description?: string,
): Promise<SnapshotMetadata> {
  if (!VALID_NAME.test(name)) {
    throw new Error(
      `Invalid snapshot name "${name}": only alphanumeric characters and hyphens are allowed`,
    );
  }

  const snapshotDir = path.join(getSnapshotsDir(), name);

  // Check for duplicates
  try {
    await fs.access(snapshotDir);
    throw new Error(`Snapshot "${name}" already exists`);
  } catch (err: any) {
    if (err.message.includes("already exists")) throw err;
    // ENOENT is expected
  }

  await mkdirp(snapshotDir);

  const fileList: string[] = [];

  // Copy individual files
  for (const relPath of SNAPSHOT_FILES) {
    const src = path.join(getMyceliumDir(), relPath);
    const dest = path.join(snapshotDir, relPath);
    if (await copyIfExists(src, dest)) {
      fileList.push(relPath);
    }
  }

  // Copy memory directory
  const memoryFiles = await copyDirRecursive(
    path.join(getMyceliumDir(), "memory"),
    path.join(snapshotDir, "memory"),
  );
  for (const f of memoryFiles) {
    fileList.push(`memory/${f}`);
  }

  // Read symlinks in global/skills/
  const skillSymlinks: Record<string, string> = {};
  const skillsDir = path.join(getMyceliumDir(), "global", "skills");
  try {
    const entries = await fs.readdir(skillsDir);
    for (const entry of entries) {
      const fullPath = path.join(skillsDir, entry);
      try {
        const target = await fs.readlink(fullPath);
        skillSymlinks[entry] = target;
      } catch {
        // Not a symlink, skip
      }
    }
  } catch {
    // skills dir doesn't exist
  }

  const metadata: SnapshotMetadata = {
    name,
    createdAt: new Date().toISOString(),
    description,
    skillSymlinks,
    fileList,
  };

  await fs.writeFile(
    path.join(snapshotDir, "metadata.json"),
    JSON.stringify(metadata, null, 2),
  );

  return metadata;
}

export async function restoreSnapshot(name: string): Promise<void> {
  const snapshotDir = path.join(getSnapshotsDir(), name);

  let raw: string;
  try {
    raw = await fs.readFile(path.join(snapshotDir, "metadata.json"), "utf-8");
  } catch {
    throw new Error(`Snapshot "${name}" not found`);
  }

  const metadata: SnapshotMetadata = JSON.parse(raw);

  // Remove current config files
  for (const relPath of SNAPSHOT_FILES) {
    await fs.rm(path.join(getMyceliumDir(), relPath), { force: true });
  }
  await rmrf(path.join(getMyceliumDir(), "memory"));
  await rmrf(path.join(getMyceliumDir(), "global", "skills"));

  // Restore files
  for (const relPath of metadata.fileList) {
    const src = path.join(snapshotDir, relPath);
    const dest = path.join(getMyceliumDir(), relPath);
    await copyIfExists(src, dest);
  }

  // Recreate symlinks
  const skillsDir = path.join(getMyceliumDir(), "global", "skills");
  await mkdirp(skillsDir);
  for (const [linkName, target] of Object.entries(metadata.skillSymlinks)) {
    await fs.symlink(target, path.join(skillsDir, linkName));
  }
}

export async function listSnapshots(): Promise<SnapshotMetadata[]> {
  const results: SnapshotMetadata[] = [];
  try {
    const entries = await fs.readdir(getSnapshotsDir());
    for (const entry of entries) {
      try {
        const raw = await fs.readFile(
          path.join(getSnapshotsDir(), entry, "metadata.json"),
          "utf-8",
        );
        results.push(JSON.parse(raw));
      } catch {
        // skip invalid entries
      }
    }
  } catch {
    // snapshots dir doesn't exist yet
  }

  return results.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export async function deleteSnapshot(name: string): Promise<void> {
  const snapshotDir = path.join(getSnapshotsDir(), name);
  try {
    await fs.access(snapshotDir);
  } catch {
    throw new Error(`Snapshot "${name}" not found`);
  }
  await rmrf(snapshotDir);
}
