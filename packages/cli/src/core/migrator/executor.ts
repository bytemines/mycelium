/**
 * Migration Executor — applies migration plans and clears migrated configs
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";

import type {
  ToolId,
  MigrationPlan,
  MigrationResult,
  MigrationManifest,
  MigrationManifestEntry,
} from "@mycelish/core";

import { mkdirp, MYCELIUM_HOME } from "../fs-helpers.js";
import { serializeMcpsYaml } from "./manifest.js";
import { loadManifest, saveManifest } from "./manifest.js";

const MYCELIUM_DIR = MYCELIUM_HOME;

export async function executeMigration(plan: MigrationPlan): Promise<MigrationResult> {
  const errors: string[] = [];
  const entries: MigrationManifestEntry[] = [];
  const now = new Date().toISOString();

  const skillsDir = path.join(MYCELIUM_DIR, "global", "skills");
  const memoryDir = path.join(MYCELIUM_DIR, "memory");
  await mkdirp(skillsDir);
  await mkdirp(memoryDir);

  // Skills: symlink from original path
  let skillsImported = 0;
  for (const skill of plan.skills) {
    const dest = path.join(skillsDir, skill.name);
    try {
      // Remove existing symlink if any
      try {
        await fs.unlink(dest);
      } catch {
        // doesn't exist
      }
      await fs.symlink(skill.path, dest);
      skillsImported++;
      entries.push({
        name: skill.name,
        type: "skill",
        source: skill.source,
        originalPath: skill.path,
        importedPath: dest,
        importedAt: now,
        version: skill.version,
        strategy: plan.strategy,
        marketplace: skill.marketplace,
        pluginName: skill.pluginName,
      });
    } catch (err) {
      errors.push(`Failed to symlink skill ${skill.name}: ${err}`);
    }
  }

  // MCPs: write mcps.yaml
  let mcpsImported = 0;
  if (plan.mcps.length > 0) {
    const mcpsPath = path.join(MYCELIUM_DIR, "global", "mcps.yaml");
    try {
      await mkdirp(path.join(MYCELIUM_DIR, "global"));
      await fs.writeFile(mcpsPath, serializeMcpsYaml(plan.mcps), "utf-8");
      mcpsImported = plan.mcps.length;
      for (const mcp of plan.mcps) {
        entries.push({
          name: mcp.name,
          type: "mcp",
          source: mcp.source,
          originalPath: "",
          importedPath: mcpsPath,
          importedAt: now,
          strategy: plan.strategy,
        });
      }
    } catch (err) {
      errors.push(`Failed to write mcps.yaml: ${err}`);
    }
  }

  // Memory: copy files
  let memoryImported = 0;
  for (const mem of plan.memory) {
    const dest = path.join(memoryDir, `${mem.source}-${mem.name}.md`);
    try {
      if (mem.content) {
        await fs.writeFile(dest, mem.content, "utf-8");
      } else {
        await fs.copyFile(mem.path, dest);
      }
      memoryImported++;
      entries.push({
        name: mem.name,
        type: "memory",
        source: mem.source,
        originalPath: mem.path,
        importedPath: dest,
        importedAt: now,
        strategy: plan.strategy,
      });
    } catch (err) {
      errors.push(`Failed to copy memory ${mem.name}: ${err}`);
    }
  }

  // Components: symlink agents, commands, hooks, lib into dedicated dirs
  let componentsImported = 0;
  for (const comp of plan.components ?? []) {
    const compDir = path.join(MYCELIUM_DIR, "global", `${comp.type}s`);
    await mkdirp(compDir);
    const dest = path.join(compDir, comp.name + path.extname(comp.path));
    try {
      try { await fs.unlink(dest); } catch { /* doesn't exist */ }
      await fs.symlink(comp.path, dest);
      componentsImported++;
      entries.push({
        name: comp.name,
        type: comp.type,
        source: "claude-code",
        originalPath: comp.path,
        importedPath: dest,
        importedAt: now,
        strategy: plan.strategy,
        marketplace: comp.marketplace,
        pluginName: comp.pluginName,
      });
    } catch (err) {
      errors.push(`Failed to symlink ${comp.type} ${comp.name}: ${err}`);
    }
  }

  // Auto-register discovered marketplaces from migrated skills
  const discoveredMarketplaces = new Set<string>();
  for (const skill of plan.skills) {
    if (skill.marketplace) {
      discoveredMarketplaces.add(skill.marketplace);
    }
  }
  if (discoveredMarketplaces.size > 0) {
    try {
      const { loadMarketplaceRegistry, saveMarketplaceRegistry } = await import("../marketplace-registry.js");
      const registry = await loadMarketplaceRegistry();
      for (const mp of discoveredMarketplaces) {
        if (!registry[mp]) {
          registry[mp] = {
            type: "claude-marketplace",
            enabled: true,
            discovered: true,
          };
        }
      }
      await saveMarketplaceRegistry(registry);
    } catch {
      // Non-fatal: marketplace registry update failed
    }
  }

  const manifest: MigrationManifest = {
    version: "1.0.0",
    lastMigration: now,
    entries,
  };
  await saveManifest(manifest);

  return {
    success: errors.length === 0,
    skillsImported,
    mcpsImported,
    memoryImported,
    componentsImported,
    conflicts: plan.conflicts,
    errors,
    manifest,
  };
}

export async function clearMigration(
  options?: { toolId?: ToolId },
): Promise<{ cleared: string[]; errors: string[] }> {
  const cleared: string[] = [];
  const errors: string[] = [];

  const manifest = await loadManifest();

  if (options?.toolId) {
    // Only clear entries from specific tool
    const toRemove = manifest.entries.filter((e) => e.source === options.toolId);
    const remaining = manifest.entries.filter((e) => e.source !== options.toolId);

    for (const entry of toRemove) {
      try {
        await fs.unlink(entry.importedPath);
        cleared.push(entry.importedPath);
      } catch (err) {
        // For mcps.yaml, don't delete if other entries still reference it
        if (entry.type !== "mcp" || !remaining.some((r) => r.type === "mcp")) {
          errors.push(`Failed to remove ${entry.importedPath}: ${err}`);
        }
      }
    }

    manifest.entries = remaining;
    manifest.lastMigration = new Date().toISOString();
    await saveManifest(manifest);
  } else {
    // Clear everything
    const dirs = [
      path.join(MYCELIUM_DIR, "global", "skills"),
      path.join(MYCELIUM_DIR, "global", "agents"),
      path.join(MYCELIUM_DIR, "global", "commands"),
      path.join(MYCELIUM_DIR, "global", "hooks"),
      path.join(MYCELIUM_DIR, "global", "libs"),
      path.join(MYCELIUM_DIR, "memory"),
    ];
    for (const dir of dirs) {
      try {
        await fs.rm(dir, { recursive: true, force: true });
        cleared.push(dir);
      } catch (err) {
        errors.push(`Failed to remove ${dir}: ${err}`);
      }
    }

    const mcpsPath = path.join(MYCELIUM_DIR, "global", "mcps.yaml");
    try {
      await fs.unlink(mcpsPath);
      cleared.push(mcpsPath);
    } catch {
      // doesn't exist
    }

    const MANIFEST_PATH = path.join(MYCELIUM_DIR, "migration-manifest.json");
    try {
      await fs.unlink(MANIFEST_PATH);
      cleared.push(MANIFEST_PATH);
    } catch {
      // doesn't exist
    }
  }

  return { cleared, errors };
}
