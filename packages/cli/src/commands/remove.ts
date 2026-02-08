/**
 * Remove command — remove skills, MCPs, or hooks from mycelium config.
 *
 * mycelium remove skill <name>       — Remove a skill symlink + manifest entry
 * mycelium remove mcp <name>         — Remove an MCP from mcps.yaml + manifest
 * mycelium remove hook <name>        — Remove a hook from hooks.yaml + manifest
 * mycelium remove plugin <name>      — Remove all skills from a plugin at once
 *
 * After removing, run `mycelium sync` to propagate to tool configs.
 */
import { Command } from "commander";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { readFileIfExists, mkdirp } from "../core/fs-helpers.js";
import { loadManifest, saveManifest } from "../core/migrator.js";

const MYCELIUM_DIR = path.join(os.homedir(), ".mycelium");

// ============================================================================
// Core remove functions
// ============================================================================

export async function removeSkill(name: string): Promise<{ removed: boolean; error?: string }> {
  return removeComponent("skill", name);
}

export async function removeComponent(type: string, name: string): Promise<{ removed: boolean; error?: string }> {
  const dir = type === "lib" ? "libs" : `${type}s`;
  const itemPath = path.join(MYCELIUM_DIR, "global", dir, name);
  try {
    await fs.unlink(itemPath);
  } catch {
    // Not found on disk is OK — still remove from manifest
  }

  // Remove from manifest
  const manifest = await loadManifest();
  const before = manifest.entries.length;
  manifest.entries = manifest.entries.filter(
    (e) => !(e.type === type && e.name === name),
  );
  if (manifest.entries.length === before) {
    return { removed: false, error: `${type} "${name}" not found in manifest` };
  }
  await saveManifest(manifest);

  return { removed: true };
}

export async function removeMcp(name: string): Promise<{ removed: boolean; error?: string }> {
  const mcpsPath = path.join(MYCELIUM_DIR, "global", "mcps.yaml");
  const content = await readFileIfExists(mcpsPath);
  if (!content) {
    return { removed: false, error: "No mcps.yaml found" };
  }

  // Parse YAML and remove the named MCP block
  const lines = content.split("\n");
  const newLines: string[] = [];
  let skipping = false;
  let found = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Top-level key (no indentation, ends with colon, no spaces in key)
    if (!line.startsWith(" ") && !line.startsWith("\t") && trimmed.endsWith(":") && !trimmed.startsWith("#")) {
      const key = trimmed.slice(0, -1);
      if (key === name) {
        skipping = true;
        found = true;
        continue;
      }
      skipping = false;
    }

    if (!skipping) {
      newLines.push(line);
    }
  }

  if (!found) {
    return { removed: false, error: `MCP "${name}" not found in mcps.yaml` };
  }

  // Clean up trailing blank lines
  const cleaned = newLines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
  await fs.writeFile(mcpsPath, cleaned, "utf-8");

  // Remove from manifest
  const manifest = await loadManifest();
  manifest.entries = manifest.entries.filter(
    (e) => !(e.type === "mcp" && e.name === name),
  );
  await saveManifest(manifest);

  return { removed: true };
}

export async function removeHook(name: string): Promise<{ removed: boolean; error?: string }> {
  const hooksPath = path.join(MYCELIUM_DIR, "global", "hooks.yaml");
  const content = await readFileIfExists(hooksPath);
  if (!content) {
    return { removed: false, error: "No hooks.yaml found" };
  }

  const lines = content.split("\n");
  const newLines: string[] = [];
  let skipping = false;
  let found = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!line.startsWith(" ") && !line.startsWith("\t") && trimmed.endsWith(":") && !trimmed.startsWith("#")) {
      const key = trimmed.slice(0, -1);
      if (key === name) {
        skipping = true;
        found = true;
        continue;
      }
      skipping = false;
    }
    if (!skipping) {
      newLines.push(line);
    }
  }

  if (!found) {
    return { removed: false, error: `Hook "${name}" not found in hooks.yaml` };
  }

  const cleaned = newLines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
  await fs.writeFile(hooksPath, cleaned, "utf-8");

  const manifest = await loadManifest();
  manifest.entries = manifest.entries.filter(
    (e) => !(e.type === "hook" && e.name === name),
  );
  await saveManifest(manifest);

  return { removed: true };
}

export async function removePlugin(pluginName: string): Promise<{ removed: string[]; errors: string[] }> {
  const manifest = await loadManifest();
  const pluginEntries = manifest.entries.filter(
    (e) => e.pluginName === pluginName || e.marketplace === pluginName,
  );

  if (pluginEntries.length === 0) {
    return { removed: [], errors: [`No entries found for plugin "${pluginName}"`] };
  }

  const removed: string[] = [];
  const errors: string[] = [];

  for (const entry of pluginEntries) {
    let result: { removed: boolean; error?: string };
    if (entry.type === "mcp") {
      result = await removeMcp(entry.name);
    } else if (entry.type === "hook") {
      result = await removeHook(entry.name);
      // If hook not in hooks.yaml, still clean up manifest
      if (!result.removed) {
        result = await removeComponent("hook", entry.name);
      }
    } else {
      result = await removeComponent(entry.type, entry.name);
    }

    if (result.removed) {
      removed.push(`${entry.type}: ${entry.name}`);
    } else if (result.error) {
      errors.push(result.error);
    }
  }

  return { removed, errors };
}

// ============================================================================
// List what can be removed
// ============================================================================

export async function listRemovable(): Promise<void> {
  // Skills
  const skillsDir = path.join(MYCELIUM_DIR, "global", "skills");
  try {
    const entries = await fs.readdir(skillsDir);
    if (entries.length > 0) {
      console.log(`\nSkills (${entries.length}):`);
      // Group by plugin from manifest
      const manifest = await loadManifest();
      const grouped = new Map<string, string[]>();
      for (const name of entries) {
        const entry = manifest.entries.find((e) => e.name === name && e.type === "skill");
        const group = entry?.pluginName
          ? `${entry.marketplace}/${entry.pluginName}`
          : entry?.source ?? "unknown";
        const list = grouped.get(group) ?? [];
        list.push(name);
        grouped.set(group, list);
      }
      for (const [group, names] of grouped) {
        console.log(`  ${group}:`);
        for (const name of names) {
          console.log(`    - ${name}`);
        }
      }
    }
  } catch { /* empty */ }

  // MCPs
  const mcpsContent = await readFileIfExists(path.join(MYCELIUM_DIR, "global", "mcps.yaml"));
  if (mcpsContent) {
    const mcpNames: string[] = [];
    for (const line of mcpsContent.split("\n")) {
      const trimmed = line.trim();
      if (!line.startsWith(" ") && trimmed.endsWith(":") && !trimmed.startsWith("#") && trimmed !== "mcps:") {
        mcpNames.push(trimmed.slice(0, -1));
      }
    }
    if (mcpNames.length > 0) {
      console.log(`\nMCPs (${mcpNames.length}):`);
      for (const name of mcpNames) {
        console.log(`  - ${name}`);
      }
    }
  }

  // Hooks
  const hooksContent = await readFileIfExists(path.join(MYCELIUM_DIR, "global", "hooks.yaml"));
  if (hooksContent) {
    const hookNames: string[] = [];
    for (const line of hooksContent.split("\n")) {
      const trimmed = line.trim();
      if (!line.startsWith(" ") && trimmed.endsWith(":") && !trimmed.startsWith("#")) {
        hookNames.push(trimmed.slice(0, -1));
      }
    }
    if (hookNames.length > 0) {
      console.log(`\nHooks (${hookNames.length}):`);
      for (const name of hookNames) {
        console.log(`  - ${name}`);
      }
    }
  }

  console.log("\nUsage:");
  console.log("  mycelium remove skill <name>");
  console.log("  mycelium remove mcp <name>");
  console.log("  mycelium remove hook <name>");
  console.log("  mycelium remove plugin <name>  (removes all skills from a plugin)");
  console.log("\nAfter removing, run `mycelium sync` to propagate changes to all tools.");
}

// ============================================================================
// Commander.js Commands
// ============================================================================

const skillCmd = new Command("skill")
  .description("Remove a skill from mycelium")
  .argument("<name>", "Skill name")
  .action(async (name: string) => {
    const result = await removeSkill(name);
    if (result.removed) {
      console.log(`Removed skill: ${name}`);
      console.log("Run `mycelium sync` to propagate to all tools.");
    } else {
      console.error(result.error);
      process.exit(1);
    }
  });

const mcpCmd = new Command("mcp")
  .description("Remove an MCP from mycelium")
  .argument("<name>", "MCP name")
  .action(async (name: string) => {
    const result = await removeMcp(name);
    if (result.removed) {
      console.log(`Removed MCP: ${name}`);
      console.log("Run `mycelium sync` to propagate to all tools.");
    } else {
      console.error(result.error);
      process.exit(1);
    }
  });

const hookCmd = new Command("hook")
  .description("Remove a hook from mycelium")
  .argument("<name>", "Hook name")
  .action(async (name: string) => {
    const result = await removeHook(name);
    if (result.removed) {
      console.log(`Removed hook: ${name}`);
      console.log("Run `mycelium sync` to propagate to all tools.");
    } else {
      console.error(result.error);
      process.exit(1);
    }
  });

const pluginCmd = new Command("plugin")
  .description("Remove all skills from a plugin")
  .argument("<name>", "Plugin name (e.g., 'superpowers')")
  .action(async (name: string) => {
    const result = await removePlugin(name);
    if (result.removed.length > 0) {
      console.log("Removed:");
      for (const r of result.removed) {
        console.log(`  - ${r}`);
      }
      console.log("Run `mycelium sync` to propagate to all tools.");
    }
    if (result.errors.length > 0) {
      for (const e of result.errors) {
        console.error(e);
      }
    }
    if (result.removed.length === 0 && result.errors.length > 0) {
      process.exit(1);
    }
  });

export const removeCommand = new Command("remove")
  .description("Remove skills, MCPs, hooks, or plugins from mycelium")
  .addCommand(skillCmd)
  .addCommand(mcpCmd)
  .addCommand(hookCmd)
  .addCommand(pluginCmd)
  .action(async () => {
    // No subcommand — list what can be removed
    await listRemovable();
  });
