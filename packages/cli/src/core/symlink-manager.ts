/**
 * Symlink Manager for Mycelium
 *
 * Handles creating, updating, and removing symlinks from the global
 * skills directory to tool-specific directories.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";

// ============================================================================
// Types
// ============================================================================

export interface CreateSymlinkResult {
  success: boolean;
  action: "created" | "updated" | "replaced" | "unchanged" | "error";
  backupPath?: string;
  error?: string;
}

export interface RemoveSymlinkResult {
  success: boolean;
  existed: boolean;
  error?: string;
}

export interface SymlinkValidation {
  valid: boolean;
  exists?: boolean;
  isSymlink?: boolean;
  currentTarget?: string;
  expectedTarget?: string;
}

export interface SkillSymlinkStatus {
  skillName: string;
  skillPath: string;
  symlinkPath: string;
  exists: boolean;
  valid: boolean;
  currentTarget?: string;
}

export interface Skill {
  name: string;
  path: string;
  manifest: {
    name: string;
    state?: "enabled" | "disabled" | "deleted";
  };
}

export interface SyncOptions {
  removeOrphans?: boolean;
}

export interface SyncResult {
  success: boolean;
  created: string[];
  updated: string[];
  removed: string[];
  unchanged: string[];
  errors: Array<{ skill: string; error: string }>;
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Create a symlink from a skill source path to a tool directory location.
 * Handles existing symlinks, files, and directories appropriately.
 */
export async function createSkillSymlink(
  sourcePath: string,
  symlinkPath: string
): Promise<CreateSymlinkResult> {
  try {
    // Ensure parent directory exists
    const parentDir = path.dirname(symlinkPath);
    await fs.mkdir(parentDir, { recursive: true });

    // Check if something exists at the symlink path
    let stats;
    try {
      stats = await fs.lstat(symlinkPath);
    } catch {
      // Path doesn't exist, create new symlink
      await fs.symlink(sourcePath, symlinkPath);
      return { success: true, action: "created" };
    }

    // Something exists at the path
    if (stats.isSymbolicLink()) {
      // Check if it points to the correct target
      const currentTarget = await fs.readlink(symlinkPath);

      if (currentTarget === sourcePath) {
        return { success: true, action: "unchanged" };
      }

      // Update symlink to new target
      await fs.unlink(symlinkPath);
      await fs.symlink(sourcePath, symlinkPath);
      return { success: true, action: "updated" };
    }

    // Not a symlink - backup and replace
    const backupPath = `${symlinkPath}.backup.${Date.now()}`;
    await fs.rename(symlinkPath, backupPath);
    await fs.symlink(sourcePath, symlinkPath);

    return { success: true, action: "replaced", backupPath };
  } catch (error) {
    return {
      success: false,
      action: "error",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Remove a symlink. Only removes actual symlinks, not regular files/directories.
 */
export async function removeSkillSymlink(
  symlinkPath: string
): Promise<RemoveSymlinkResult> {
  try {
    // Check if path exists
    let stats;
    try {
      stats = await fs.lstat(symlinkPath);
    } catch {
      // Path doesn't exist
      return { success: true, existed: false };
    }

    // Only remove if it's a symlink
    if (!stats.isSymbolicLink()) {
      return {
        success: false,
        existed: true,
        error: `Path exists but is not a symlink: ${symlinkPath}`,
      };
    }

    await fs.unlink(symlinkPath);
    return { success: true, existed: true };
  } catch (error) {
    return {
      success: false,
      existed: true,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Check if a symlink exists and points to the expected target.
 */
export async function isSymlinkValid(
  symlinkPath: string,
  expectedTarget: string
): Promise<SymlinkValidation> {
  try {
    // Check if path exists
    let stats;
    try {
      stats = await fs.lstat(symlinkPath);
    } catch {
      return { valid: false, exists: false };
    }

    // Check if it's a symlink
    if (!stats.isSymbolicLink()) {
      return { valid: false, exists: true, isSymlink: false };
    }

    // Check if it points to the correct target
    const currentTarget = await fs.readlink(symlinkPath);

    if (currentTarget === expectedTarget) {
      return { valid: true, currentTarget };
    }

    return {
      valid: false,
      exists: true,
      isSymlink: true,
      currentTarget,
      expectedTarget,
    };
  } catch (error) {
    return { valid: false };
  }
}

/**
 * Get the status of symlinks for a list of skills in a tool directory.
 */
export async function getSymlinkStatus(
  skills: Skill[],
  toolSkillsDir: string
): Promise<SkillSymlinkStatus[]> {
  const statuses: SkillSymlinkStatus[] = [];

  for (const skill of skills) {
    const symlinkPath = path.join(toolSkillsDir, skill.name);
    const validation = await isSymlinkValid(symlinkPath, skill.path);

    statuses.push({
      skillName: skill.name,
      skillPath: skill.path,
      symlinkPath,
      exists: validation.exists !== false,
      valid: validation.valid,
      currentTarget: validation.currentTarget,
    });
  }

  return statuses;
}

/**
 * Sync all skills to a specific tool directory.
 * Creates symlinks for enabled skills, removes symlinks for disabled skills,
 * and optionally removes orphaned symlinks.
 */
export async function syncSkillsToTool(
  skills: Skill[],
  toolSkillsDir: string,
  options: SyncOptions = {}
): Promise<SyncResult> {
  const result: SyncResult = {
    success: true,
    created: [],
    updated: [],
    removed: [],
    unchanged: [],
    errors: [],
  };

  // Ensure tool skills directory exists
  await fs.mkdir(toolSkillsDir, { recursive: true });

  // Build set of skill names for orphan detection
  const skillNames = new Set(skills.map((s) => s.name));

  // Process each skill
  for (const skill of skills) {
    const symlinkPath = path.join(toolSkillsDir, skill.name);
    const isEnabled = !skill.manifest.state || skill.manifest.state === "enabled";

    if (isEnabled) {
      // Create or update symlink
      const createResult = await createSkillSymlink(skill.path, symlinkPath);

      if (createResult.success) {
        switch (createResult.action) {
          case "created":
            result.created.push(skill.name);
            break;
          case "updated":
          case "replaced":
            result.updated.push(skill.name);
            break;
          case "unchanged":
            result.unchanged.push(skill.name);
            break;
        }
      } else {
        result.success = false;
        result.errors.push({ skill: skill.name, error: createResult.error || "Unknown error" });
      }
    } else {
      // Remove symlink for disabled skill
      const removeResult = await removeSkillSymlink(symlinkPath);

      if (removeResult.existed) {
        result.removed.push(skill.name);
      }

      if (!removeResult.success && removeResult.existed) {
        result.errors.push({ skill: skill.name, error: removeResult.error || "Unknown error" });
      }
    }
  }

  // Handle orphaned symlinks
  if (options.removeOrphans) {
    try {
      const entries = await fs.readdir(toolSkillsDir, { withFileTypes: true });

      for (const entry of entries) {
        // Skip if this is a known skill
        if (skillNames.has(entry.name)) {
          continue;
        }

        const entryPath = path.join(toolSkillsDir, entry.name);

        // Only remove symlinks
        try {
          const stats = await fs.lstat(entryPath);
          if (stats.isSymbolicLink()) {
            await fs.unlink(entryPath);
            result.removed.push(entry.name);
          }
        } catch {
          // Ignore errors for individual entries
        }
      }
    } catch {
      // Ignore errors reading directory
    }
  }

  return result;
}
