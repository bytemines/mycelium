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
import type { ToolId, ConflictStrategy } from "@mycelium/core";
import {
  scanAllTools,
  scanTool,
  generateMigrationPlan,
  executeMigration,
  clearMigration,
} from "../core/migrator.js";

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
  .action(async (opts) => {
    const apply = opts.apply ?? false;
    const strategy = (opts.strategy ?? "latest") as ConflictStrategy;

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

    // Execute
    console.log("\nApplying migration...");
    const result = await executeMigration(plan);

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
