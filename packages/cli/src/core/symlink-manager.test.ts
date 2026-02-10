/**
 * Tests for symlink-manager - written FIRST following TDD
 *
 * The symlink-manager module handles creating/removing symlinks
 * from the global skills directory to tool-specific directories.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";

// Tests define the API we want - implementation comes after

const testDir = `/tmp/mycelium-symlink-test-${Date.now()}`;
const globalSkillsDir = `${testDir}/global/skills`;
const toolSkillsDir = `${testDir}/tool/skills`;

describe("symlink-manager", () => {
  beforeEach(async () => {
    // Create test directories
    await fs.mkdir(globalSkillsDir, { recursive: true });
    await fs.mkdir(toolSkillsDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directories
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("createSkillSymlink", () => {
    it("creates symlink from skill to tool directory", async () => {
      const { createSkillSymlink } = await import("./symlink-manager.js");

      // Create a skill directory in global location
      const skillPath = `${globalSkillsDir}/my-skill`;
      await fs.mkdir(skillPath, { recursive: true });
      await fs.writeFile(`${skillPath}/skill.md`, "# My Skill");

      // Create symlink in tool directory
      const symlinkPath = `${toolSkillsDir}/my-skill`;
      const result = await createSkillSymlink(skillPath, symlinkPath);

      expect(result.success).toBe(true);
      expect(result.action).toBe("created");

      // Verify symlink exists and points to correct target
      const stats = await fs.lstat(symlinkPath);
      expect(stats.isSymbolicLink()).toBe(true);

      const linkTarget = await fs.readlink(symlinkPath);
      expect(linkTarget).toBe(skillPath);
    });

    it("updates existing symlink if target changed", async () => {
      const { createSkillSymlink } = await import("./symlink-manager.js");

      // Create two skill directories
      const oldSkillPath = `${globalSkillsDir}/old-skill`;
      const newSkillPath = `${globalSkillsDir}/new-skill`;
      await fs.mkdir(oldSkillPath, { recursive: true });
      await fs.mkdir(newSkillPath, { recursive: true });

      // Create initial symlink to old skill
      const symlinkPath = `${toolSkillsDir}/my-skill`;
      await fs.symlink(oldSkillPath, symlinkPath);

      // Update symlink to new skill
      const result = await createSkillSymlink(newSkillPath, symlinkPath);

      expect(result.success).toBe(true);
      expect(result.action).toBe("updated");

      // Verify symlink now points to new target
      const linkTarget = await fs.readlink(symlinkPath);
      expect(linkTarget).toBe(newSkillPath);
    });

    it("does nothing if symlink already points to correct target", async () => {
      const { createSkillSymlink } = await import("./symlink-manager.js");

      // Create skill directory
      const skillPath = `${globalSkillsDir}/my-skill`;
      await fs.mkdir(skillPath, { recursive: true });

      // Create existing correct symlink
      const symlinkPath = `${toolSkillsDir}/my-skill`;
      await fs.symlink(skillPath, symlinkPath);

      // Try to create same symlink
      const result = await createSkillSymlink(skillPath, symlinkPath);

      expect(result.success).toBe(true);
      expect(result.action).toBe("unchanged");
    });

    it("handles non-symlink file by backing up and replacing", async () => {
      const { createSkillSymlink } = await import("./symlink-manager.js");

      // Create skill directory
      const skillPath = `${globalSkillsDir}/my-skill`;
      await fs.mkdir(skillPath, { recursive: true });

      // Create a regular file where symlink should be
      const symlinkPath = `${toolSkillsDir}/my-skill`;
      await fs.writeFile(symlinkPath, "existing content");

      // Create symlink (should backup existing file)
      const result = await createSkillSymlink(skillPath, symlinkPath);

      expect(result.success).toBe(true);
      expect(result.action).toBe("replaced");
      expect(result.backupPath).toBeDefined();

      // Verify symlink was created
      const stats = await fs.lstat(symlinkPath);
      expect(stats.isSymbolicLink()).toBe(true);

      // Verify backup exists
      const backupExists = await fs.access(result.backupPath!).then(() => true).catch(() => false);
      expect(backupExists).toBe(true);
    });

    it("handles non-symlink directory by backing up and replacing", async () => {
      const { createSkillSymlink } = await import("./symlink-manager.js");

      // Create skill directory
      const skillPath = `${globalSkillsDir}/my-skill`;
      await fs.mkdir(skillPath, { recursive: true });

      // Create a regular directory where symlink should be
      const symlinkPath = `${toolSkillsDir}/my-skill`;
      await fs.mkdir(symlinkPath, { recursive: true });
      await fs.writeFile(`${symlinkPath}/existing.txt`, "content");

      // Create symlink (should backup existing directory)
      const result = await createSkillSymlink(skillPath, symlinkPath);

      expect(result.success).toBe(true);
      expect(result.action).toBe("replaced");
      expect(result.backupPath).toBeDefined();

      // Verify symlink was created
      const stats = await fs.lstat(symlinkPath);
      expect(stats.isSymbolicLink()).toBe(true);

      // Verify backup exists and contains original file
      const backupFile = `${result.backupPath}/existing.txt`;
      const backupContent = await fs.readFile(backupFile, "utf-8");
      expect(backupContent).toBe("content");
    });

    it("creates parent directory if it does not exist", async () => {
      const { createSkillSymlink } = await import("./symlink-manager.js");

      // Create skill directory
      const skillPath = `${globalSkillsDir}/my-skill`;
      await fs.mkdir(skillPath, { recursive: true });

      // Target in non-existent parent directory
      const symlinkPath = `${toolSkillsDir}/nested/path/my-skill`;

      const result = await createSkillSymlink(skillPath, symlinkPath);

      expect(result.success).toBe(true);
      expect(result.action).toBe("created");

      // Verify symlink exists
      const stats = await fs.lstat(symlinkPath);
      expect(stats.isSymbolicLink()).toBe(true);
    });
  });

  describe("removeSkillSymlink", () => {
    it("removes symlink for disabled skill", async () => {
      const { removeSkillSymlink } = await import("./symlink-manager.js");

      // Create skill directory and symlink
      const skillPath = `${globalSkillsDir}/my-skill`;
      await fs.mkdir(skillPath, { recursive: true });

      const symlinkPath = `${toolSkillsDir}/my-skill`;
      await fs.symlink(skillPath, symlinkPath);

      // Remove symlink
      const result = await removeSkillSymlink(symlinkPath);

      expect(result.success).toBe(true);
      expect(result.existed).toBe(true);

      // Verify symlink no longer exists
      const exists = await fs.access(symlinkPath).then(() => true).catch(() => false);
      expect(exists).toBe(false);
    });

    it("returns success even if symlink does not exist", async () => {
      const { removeSkillSymlink } = await import("./symlink-manager.js");

      const symlinkPath = `${toolSkillsDir}/nonexistent`;
      const result = await removeSkillSymlink(symlinkPath);

      expect(result.success).toBe(true);
      expect(result.existed).toBe(false);
    });

    it("does not remove regular files (only symlinks)", async () => {
      const { removeSkillSymlink } = await import("./symlink-manager.js");

      // Create a regular file
      const filePath = `${toolSkillsDir}/regular-file`;
      await fs.writeFile(filePath, "content");

      const result = await removeSkillSymlink(filePath);

      expect(result.success).toBe(false);
      expect(result.error).toContain("not a symlink");

      // Verify file still exists
      const exists = await fs.access(filePath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });
  });

  describe("isSymlinkValid", () => {
    it("returns true if symlink points to correct target", async () => {
      const { isSymlinkValid } = await import("./symlink-manager.js");

      // Create skill directory and symlink
      const skillPath = `${globalSkillsDir}/my-skill`;
      await fs.mkdir(skillPath, { recursive: true });

      const symlinkPath = `${toolSkillsDir}/my-skill`;
      await fs.symlink(skillPath, symlinkPath);

      const result = await isSymlinkValid(symlinkPath, skillPath);

      expect(result.valid).toBe(true);
      expect(result.currentTarget).toBe(skillPath);
    });

    it("returns false if symlink points to different target", async () => {
      const { isSymlinkValid } = await import("./symlink-manager.js");

      // Create two skill directories
      const actualSkillPath = `${globalSkillsDir}/actual-skill`;
      const expectedSkillPath = `${globalSkillsDir}/expected-skill`;
      await fs.mkdir(actualSkillPath, { recursive: true });
      await fs.mkdir(expectedSkillPath, { recursive: true });

      // Create symlink to actual skill
      const symlinkPath = `${toolSkillsDir}/my-skill`;
      await fs.symlink(actualSkillPath, symlinkPath);

      // Check against expected skill
      const result = await isSymlinkValid(symlinkPath, expectedSkillPath);

      expect(result.valid).toBe(false);
      expect(result.currentTarget).toBe(actualSkillPath);
      expect(result.expectedTarget).toBe(expectedSkillPath);
    });

    it("returns false if path is not a symlink", async () => {
      const { isSymlinkValid } = await import("./symlink-manager.js");

      // Create regular file
      const filePath = `${toolSkillsDir}/regular-file`;
      await fs.writeFile(filePath, "content");

      const result = await isSymlinkValid(filePath, globalSkillsDir);

      expect(result.valid).toBe(false);
      expect(result.isSymlink).toBe(false);
    });

    it("returns false if path does not exist", async () => {
      const { isSymlinkValid } = await import("./symlink-manager.js");

      const symlinkPath = `${toolSkillsDir}/nonexistent`;
      const result = await isSymlinkValid(symlinkPath, globalSkillsDir);

      expect(result.valid).toBe(false);
      expect(result.exists).toBe(false);
    });
  });

  describe("getSymlinkStatus", () => {
    it("returns status of skill symlinks for a tool", async () => {
      const { getSymlinkStatus } = await import("./symlink-manager.js");

      // Create two skills
      const skill1Path = `${globalSkillsDir}/skill1`;
      const skill2Path = `${globalSkillsDir}/skill2`;
      await fs.mkdir(skill1Path, { recursive: true });
      await fs.mkdir(skill2Path, { recursive: true });

      // Create symlink only for skill1
      await fs.symlink(skill1Path, `${toolSkillsDir}/skill1`);

      const skills = [
        { name: "skill1", path: skill1Path, manifest: { name: "skill1" } },
        { name: "skill2", path: skill2Path, manifest: { name: "skill2" } },
      ];

      const status = await getSymlinkStatus(skills, toolSkillsDir);

      expect(status).toHaveLength(2);

      const skill1Status = status.find(s => s.skillName === "skill1");
      expect(skill1Status?.exists).toBe(true);
      expect(skill1Status?.valid).toBe(true);

      const skill2Status = status.find(s => s.skillName === "skill2");
      expect(skill2Status?.exists).toBe(false);
      expect(skill2Status?.valid).toBe(false);
    });

    it("detects invalid symlinks pointing to wrong target", async () => {
      const { getSymlinkStatus } = await import("./symlink-manager.js");

      // Create two skills
      const skill1Path = `${globalSkillsDir}/skill1`;
      const skill2Path = `${globalSkillsDir}/skill2`;
      await fs.mkdir(skill1Path, { recursive: true });
      await fs.mkdir(skill2Path, { recursive: true });

      // Create symlink pointing to wrong skill
      await fs.symlink(skill2Path, `${toolSkillsDir}/skill1`);

      const skills = [
        { name: "skill1", path: skill1Path, manifest: { name: "skill1" } },
      ];

      const status = await getSymlinkStatus(skills, toolSkillsDir);

      expect(status).toHaveLength(1);
      expect(status[0].exists).toBe(true);
      expect(status[0].valid).toBe(false);
      expect(status[0].currentTarget).toBe(skill2Path);
    });
  });

  describe("syncSkillsToTool", () => {
    it("syncs all skills to a specific tool directory", async () => {
      const { syncSkillsToTool } = await import("./symlink-manager.js");

      // Create skills
      const skill1Path = `${globalSkillsDir}/skill1`;
      const skill2Path = `${globalSkillsDir}/skill2`;
      await fs.mkdir(skill1Path, { recursive: true });
      await fs.mkdir(skill2Path, { recursive: true });

      const skills = [
        { name: "skill1", path: skill1Path, manifest: { name: "skill1", state: "enabled" as const } },
        { name: "skill2", path: skill2Path, manifest: { name: "skill2", state: "enabled" as const } },
      ];

      const result = await syncSkillsToTool(skills, toolSkillsDir);

      expect(result.success).toBe(true);
      expect(result.created).toHaveLength(2);
      expect(result.updated).toHaveLength(0);
      expect(result.removed).toHaveLength(0);
      expect(result.errors).toHaveLength(0);

      // Verify symlinks were created
      const skill1Symlink = `${toolSkillsDir}/skill1`;
      const skill2Symlink = `${toolSkillsDir}/skill2`;

      const stats1 = await fs.lstat(skill1Symlink);
      const stats2 = await fs.lstat(skill2Symlink);

      expect(stats1.isSymbolicLink()).toBe(true);
      expect(stats2.isSymbolicLink()).toBe(true);
    });

    it("removes symlinks for disabled skills", async () => {
      const { syncSkillsToTool } = await import("./symlink-manager.js");

      // Create skill
      const skillPath = `${globalSkillsDir}/my-skill`;
      await fs.mkdir(skillPath, { recursive: true });

      // Create existing symlink
      const symlinkPath = `${toolSkillsDir}/my-skill`;
      await fs.symlink(skillPath, symlinkPath);

      // Sync with disabled skill
      const skills = [
        { name: "my-skill", path: skillPath, manifest: { name: "my-skill", state: "disabled" as const } },
      ];

      const result = await syncSkillsToTool(skills, toolSkillsDir);

      expect(result.success).toBe(true);
      expect(result.created).toHaveLength(0);
      expect(result.removed).toContain("my-skill");

      // Verify symlink was removed
      const exists = await fs.access(symlinkPath).then(() => true).catch(() => false);
      expect(exists).toBe(false);
    });

    it("updates symlinks when target changes", async () => {
      const { syncSkillsToTool } = await import("./symlink-manager.js");

      // Create skills
      const oldSkillPath = `${globalSkillsDir}/old-location`;
      const newSkillPath = `${globalSkillsDir}/new-location`;
      await fs.mkdir(oldSkillPath, { recursive: true });
      await fs.mkdir(newSkillPath, { recursive: true });

      // Create symlink to old location
      const symlinkPath = `${toolSkillsDir}/my-skill`;
      await fs.symlink(oldSkillPath, symlinkPath);

      // Sync with new location
      const skills = [
        { name: "my-skill", path: newSkillPath, manifest: { name: "my-skill", state: "enabled" as const } },
      ];

      const result = await syncSkillsToTool(skills, toolSkillsDir);

      expect(result.success).toBe(true);
      expect(result.updated).toContain("my-skill");

      // Verify symlink points to new location
      const target = await fs.readlink(symlinkPath);
      expect(target).toBe(newSkillPath);
    });

    it("removes orphaned symlinks not in skill list", async () => {
      const { syncSkillsToTool } = await import("./symlink-manager.js");

      // Create skill
      const skillPath = `${globalSkillsDir}/my-skill`;
      await fs.mkdir(skillPath, { recursive: true });

      // Create orphaned symlink (not in skill list)
      const orphanedPath = `${toolSkillsDir}/orphaned-skill`;
      await fs.symlink(skillPath, orphanedPath);

      // Sync with empty skill list
      const result = await syncSkillsToTool([], toolSkillsDir, { removeOrphans: true });

      expect(result.success).toBe(true);
      expect(result.removed).toContain("orphaned-skill");

      // Verify orphaned symlink was removed
      const exists = await fs.access(orphanedPath).then(() => true).catch(() => false);
      expect(exists).toBe(false);
    });

    it("preserves non-symlink files in tool directory", async () => {
      const { syncSkillsToTool } = await import("./symlink-manager.js");

      // Create a non-symlink file in tool directory
      const regularFile = `${toolSkillsDir}/README.md`;
      await fs.writeFile(regularFile, "# Skills");

      // Sync with empty skill list
      const result = await syncSkillsToTool([], toolSkillsDir, { removeOrphans: true });

      expect(result.success).toBe(true);

      // Verify regular file was preserved
      const content = await fs.readFile(regularFile, "utf-8");
      expect(content).toBe("# Skills");
    });
  });
});
