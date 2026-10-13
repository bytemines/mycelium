/**
 * Snapshot — create, restore, list, and delete config snapshots
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { SnapshotMetadata } from "@mycelish/core";
import { mkdirp, MYCELIUM_HOME } from "./fs-helpers.js";
import { assertContainedPath, assertSafePathComponent } from "./path-safety.js";

function getMyceliumDir(): string {
  return MYCELIUM_HOME;
}

function getSnapshotsDir(): string {
  return path.join(getMyceliumDir(), "snapshots");
}

/** Files to capture relative to getMyceliumDir() */
const SNAPSHOT_FILES = [
  "manifest.yaml",
  "global/mcps.yaml",
  "global/hooks.yaml",
  "migration-manifest.json",
  "marketplaces.yaml",
];

const VALID_NAME = /^[a-zA-Z0-9-]+$/;

type SnapshotRecord = SnapshotMetadata & {
  formatVersion?: number;
  configFiles?: Record<string, boolean>;
};

function snapshotPath(name: string): string {
  if (!VALID_NAME.test(name)) throw new Error(`Invalid snapshot name "${name}": only alphanumeric characters and hyphens are allowed`);
  const dir = path.join(getSnapshotsDir(), name);
  assertContainedPath(getMyceliumDir(), dir);
  assertContainedPath(getSnapshotsDir(), dir);
  return dir;
}

// ============================================================================
// Helpers
// ============================================================================

async function copyIfExists(src: string, dest: string): Promise<boolean> {
  try {
    if (!(await fs.lstat(src)).isFile()) throw new Error(`Invalid snapshot config source: ${src}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
  await mkdirp(path.dirname(dest));
  await fs.copyFile(src, dest);
  return true;
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

  const snapshotDir = snapshotPath(name);

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
  const configFiles: Record<string, boolean> = {};

  // Copy individual files
  for (const relPath of SNAPSHOT_FILES) {
    const src = path.join(getMyceliumDir(), relPath);
    const dest = path.join(snapshotDir, relPath);
    assertContainedPath(getMyceliumDir(), src);
    assertContainedPath(snapshotDir, dest);
    configFiles[relPath] = await copyIfExists(src, dest);
    if (configFiles[relPath]) {
      fileList.push(relPath);
    }
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

  const metadata: SnapshotRecord = {
    name,
    createdAt: new Date().toISOString(),
    description,
    skillSymlinks,
    fileList,
    formatVersion: 2,
    configFiles,
  };

  await fs.writeFile(
    path.join(snapshotDir, "metadata.json"),
    JSON.stringify(metadata, null, 2),
  );

  return metadata;
}

export async function restoreSnapshot(name: string): Promise<void> {
  const snapshotDir = snapshotPath(name);
  assertContainedPath(snapshotDir, path.join(snapshotDir, "metadata.json"));

  let raw: string;
  try {
    raw = await fs.readFile(path.join(snapshotDir, "metadata.json"), "utf-8");
  } catch {
    throw new Error(`Snapshot "${name}" not found`);
  }

  const metadata: SnapshotRecord = JSON.parse(raw);
  if (!Array.isArray(metadata.fileList) || !metadata.skillSymlinks || typeof metadata.skillSymlinks !== "object" || Array.isArray(metadata.skillSymlinks)) {
    throw new Error("Invalid snapshot metadata");
  }
  const absentPaths: string[] = [];
  if (metadata.formatVersion !== undefined || metadata.configFiles !== undefined) {
    if (metadata.formatVersion !== 2 || !metadata.configFiles || typeof metadata.configFiles !== "object" || Array.isArray(metadata.configFiles) || Object.keys(metadata.configFiles).length !== SNAPSHOT_FILES.length) {
      throw new Error("Invalid snapshot config states");
    }
    for (const relPath of SNAPSHOT_FILES) {
      const present = metadata.configFiles[relPath];
      if (typeof present !== "boolean" || present !== metadata.fileList.includes(relPath)) throw new Error("Invalid snapshot config states");
      if (!present) absentPaths.push(relPath);
    }
  }
  // Validate and read every input before changing any current configuration.
  const files: Array<{ dest: string; content: Buffer }> = [];
  for (const relPath of metadata.fileList) {
    if (!SNAPSHOT_FILES.includes(relPath)) throw new Error(`Invalid snapshot file: ${relPath}`);
    const src = path.join(snapshotDir, relPath);
    const dest = path.join(getMyceliumDir(), relPath);
    assertContainedPath(snapshotDir, src);
    assertContainedPath(getMyceliumDir(), dest);
    try {
      if (!(await fs.lstat(dest)).isFile()) throw new Error(`Invalid restore destination: ${dest}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    files.push({ dest, content: await fs.readFile(src) });
  }
  const removals: string[] = [];
  for (const relPath of absentPaths) {
    const dest = path.join(getMyceliumDir(), relPath);
    assertContainedPath(getMyceliumDir(), dest);
    try {
      if (!(await fs.lstat(dest)).isFile()) throw new Error(`Invalid restore destination: ${dest}`);
      removals.push(dest);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  const skillsDir = path.join(getMyceliumDir(), "global", "skills");
  assertContainedPath(getMyceliumDir(), skillsDir);
  for (const [linkName, target] of Object.entries(metadata.skillSymlinks)) {
    assertSafePathComponent(linkName);
    if (typeof target !== "string" || !target || target.includes("\0")) throw new Error(`Invalid snapshot symlink: ${linkName}`);
    try {
      const stats = await fs.lstat(path.join(skillsDir, linkName));
      if (!stats.isSymbolicLink()) throw new Error(`Preserving native skill: ${linkName}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  for (const dest of removals) await fs.unlink(dest);
  for (const { dest, content } of files) {
    await mkdirp(path.dirname(dest));
    await fs.writeFile(dest, content);
  }
  await mkdirp(skillsDir);
  for (const [linkName, target] of Object.entries(metadata.skillSymlinks)) {
    const link = path.join(skillsDir, linkName);
    try { await fs.unlink(link); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await fs.symlink(target, link);
  }
}

export async function listSnapshots(): Promise<SnapshotMetadata[]> {
  const results: SnapshotMetadata[] = [];
  try {
    const entries = await fs.readdir(getSnapshotsDir());
    for (const entry of entries) {
      try {
        const dir = snapshotPath(entry);
        assertContainedPath(dir, path.join(dir, "metadata.json"));
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
  const snapshotDir = snapshotPath(name);
  try {
    await fs.access(snapshotDir);
  } catch {
    throw new Error(`Snapshot "${name}" not found`);
  }
  await rmrf(snapshotDir);
}
