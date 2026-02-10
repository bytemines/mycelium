/**
 * Migrate Command Module
 *
 * mycelium migrate                    — Scan all tools, show what would be imported (dry-run)
 * mycelium migrate --apply            — Actually import everything
 * mycelium migrate --tool claude-code — Only migrate from specific tool
 * mycelium migrate --skills-only      — Only migrate skills
 * mycelium migrate --mcps-only        — Only migrate MCPs
 * mycelium migrate --clear            — Remove migrated configs (dry-run)
 * mycelium migrate --clear --apply    — Actually clear everything
 * mycelium migrate --strategy latest  — Conflict resolution strategy
 */

import { Command } from "commander";
import type { ToolId, ConflictStrategy } from "@mycelish/core";
import {
  scanAllTools,
  scanTool,
  generateMigrationPlan,
  executeMigration,
  clearMigration,
  writeHooksYaml,
} from "../core/migrator/index.js";
import {
  createSnapshot,
  restoreSnapshot,
  listSnapshots,
  deleteSnapshot,
} from "../core/snapshot.js";
import { migrateManifestV1ToV2 } from "../core/manifest-migrator.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { homedir } from "node:os";

export const migrateCommand = new Command("migrate")
  .description("Scan installed tools and migrate configs into Mycelium")
  .option("--apply", "Execute migration (default is dry-run)")
  .option("--tool <id>", "Only migrate from specific tool")
  .option("--skills-only", "Only migrate skills")
  .option("--mcps-only", "Only migrate MCPs")
  .option("--clear", "Remove all mycelium-managed configs")
  .option(
    "--strategy <strategy>",
    "Conflict resolution: latest, interactive, all",
    "latest",
  )
  .option("--snapshot <name>", "Create a snapshot of current config")
  .option("--restore <name>", "Restore a previously saved snapshot")
  .option("--snapshots", "List all saved snapshots")
  .option("--snapshot-delete <name>", "Delete a saved snapshot")
  .action(async (opts) => {
    const apply = opts.apply ?? false;
    const strategy = (opts.strategy ?? "latest") as ConflictStrategy;

    // Handle snapshot operations
    if (opts.snapshots) {
      const snaps = await listSnapshots();
      if (snaps.length === 0) {
        console.log("No snapshots found.");
        return;
      }
      console.log("Snapshots:\n");
      console.log("  Name                Created                   Files");
      console.log("  " + "-".repeat(60));
      for (const s of snaps) {
        const date = new Date(s.createdAt).toLocaleString();
        const desc = s.description ? ` — ${s.description}` : "";
        console.log(`  ${s.name.padEnd(20)}${date.padEnd(26)}${s.fileList.length} files${desc}`);
      }
      return;
    }

    if (opts.snapshot) {
      const meta = await createSnapshot(opts.snapshot);
      console.log(`Snapshot "${meta.name}" created (${meta.fileList.length} files, ${Object.keys(meta.skillSymlinks).length} skill symlinks)`);
      return;
    }

    if (opts.restore) {
      await restoreSnapshot(opts.restore);
      console.log(`Snapshot "${opts.restore}" restored.`);
      return;
    }

    if (opts.snapshotDelete) {
      await deleteSnapshot(opts.snapshotDelete);
      console.log(`Snapshot "${opts.snapshotDelete}" deleted.`);
      return;
    }

    // Handle --clear
    if (opts.clear) {
      if (!apply) {
        console.log("Would clear all migrated configs from ~/.mycelium/");
        if (opts.tool) {
          console.log(`  Scoped to tool: ${opts.tool}`);
        }
        console.log("\nRun with --apply to execute.");
        return;
      }

      const result = await clearMigration(
        opts.tool ? { toolId: opts.tool as ToolId } : undefined,
      );
      if (result.cleared.length > 0) {
        console.log("Cleared:");
        for (const p of result.cleared) {
          console.log(`  - ${p}`);
        }
      }
      if (result.errors.length > 0) {
        console.error("Errors:");
        for (const e of result.errors) {
          console.error(`  - ${e}`);
        }
      }
      if (result.cleared.length === 0 && result.errors.length === 0) {
        console.log("Nothing to clear.");
      }
      return;
    }

    // Scan
    console.log("Scanning installed tools...\n");

    const scans = opts.tool
      ? [await scanTool(opts.tool as ToolId)]
      : await scanAllTools();

    for (const scan of scans) {
      if (scan.installed) {
        // Count unique plugins
        const plugins = new Set(scan.skills.filter(s => s.pluginName).map(s => `${s.marketplace}/${s.pluginName}`));
        const pluginInfo = plugins.size > 0 ? ` (${plugins.size} plugins)` : "";
        console.log(
          `  ✓ ${scan.toolName}: ${scan.skills.length} skills${pluginInfo}, ${scan.mcps.length} MCPs, ${scan.memory.length} memory files`,
        );
      } else {
        console.log(`  ✗ ${scan.toolName}: not installed`);
      }
    }

    // Generate plan
    let plan = generateMigrationPlan(scans, strategy);

    // Filter by type if requested
    if (opts.skillsOnly) {
      plan = { ...plan, mcps: [], memory: [] };
    } else if (opts.mcpsOnly) {
      plan = { ...plan, skills: [], memory: [] };
    }

    console.log("\nMigration Plan:");
    if (plan.skills.length > 0) {
      console.log(`  Skills (${plan.skills.length}):`);
      // Group by marketplace/plugin
      const grouped = new Map<string, string[]>();
      for (const s of plan.skills) {
        const key = s.marketplace && s.pluginName
          ? `${s.marketplace}/${s.pluginName}`
          : s.source;
        const group = grouped.get(key) ?? [];
        group.push(s.name);
        grouped.set(key, group);
      }
      for (const [group, names] of grouped) {
        console.log(`    ${group} (${names.length}): ${names.join(", ")}`);
      }
    }
    if (plan.mcps.length > 0) {
      console.log(`  MCPs (${plan.mcps.length}):`);
      for (const m of plan.mcps) {
        console.log(`    ${m.name} (${m.source}) — ${m.config.command}`);
      }
    }
    if (plan.memory.length > 0) {
      console.log(`  Memory (${plan.memory.length} files):`);
      for (const m of plan.memory) {
        console.log(`    ${m.source}/${m.name}`);
      }
    }

    if (plan.conflicts.length > 0) {
      console.log(`\n  Conflicts (${plan.conflicts.length}):`);
      for (const c of plan.conflicts) {
        const sources = c.entries.map((e) => e.source).join(", ");
        const resolved = c.resolved
          ? ` → resolved: ${c.resolved.source}`
          : " → unresolved";
        console.log(`    ⚠ "${c.name}" (${c.type}) found in: ${sources}${resolved}`);
      }
    } else {
      console.log("\n  Conflicts: None");
    }

    if (!apply) {
      console.log("\nRun with --apply to execute migration.");
      return;
    }

    // Migrate v1 manifests (enabled → state) if needed
    const myceliumDir = path.join(homedir(), ".mycelium");
    const manifestPaths = ["skills.json", "mcps.json", "global.json"];
    for (const manifestFile of manifestPaths) {
      const manifestPath = path.join(myceliumDir, manifestFile);
      try {
        const raw = await fs.readFile(manifestPath, "utf-8");
        const parsed = JSON.parse(raw);
        // Detect v1 format: any item has "enabled" field
        const sections = ["skills", "mcps", "hooks", "memory"];
        const hasEnabledField = sections.some((s) => {
          const items = parsed[s];
          if (!items || typeof items !== "object") return false;
          return Object.values(items).some(
            (v: any) => typeof v === "object" && v !== null && "enabled" in v,
          );
        });
        if (hasEnabledField) {
          // Check for plugin-skills.json
          const pluginSkillsPath = path.join(myceliumDir, "plugin-skills.json");
          let pluginSkills: Record<string, Record<string, boolean>> | undefined;
          try {
            const psRaw = await fs.readFile(pluginSkillsPath, "utf-8");
            pluginSkills = JSON.parse(psRaw);
          } catch {
            // No plugin-skills.json, that's fine
          }

          const migrated = migrateManifestV1ToV2(parsed, pluginSkills);
          await fs.writeFile(manifestPath, JSON.stringify(migrated, null, 2) + "\n");
          console.log(`  Migrated ${manifestFile} from v1 (enabled) to v2 (state)`);

          // Delete plugin-skills.json after importing its data
          if (pluginSkills) {
            await fs.rm(pluginSkillsPath, { force: true });
            console.log("  Removed plugin-skills.json (data imported into manifests)");
          }
        }
      } catch {
        // File doesn't exist, skip
      }
    }

    // Execute
    console.log("\nApplying migration...");
    const result = await executeMigration(plan);

    // Write hooks from scanned data
    const allHooks = scans.flatMap((s) => s.hooks);
    if (allHooks.length > 0) {
      await writeHooksYaml(allHooks);
      console.log(`Wrote ${allHooks.length} hooks to hooks.yaml`);
    }

    console.log(
      `\nDone! Imported ${result.skillsImported} skills, ${result.mcpsImported} MCPs, ${result.memoryImported} memory files.`,
    );
    if (result.errors.length > 0) {
      console.error("Errors:");
      for (const e of result.errors) {
        console.error(`  - ${e}`);
      }
    }
  });
