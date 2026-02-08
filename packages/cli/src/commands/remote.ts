/**
 * Remote commands — mycelium push, pull, env
 */
import * as path from "node:path";
import { Command } from "commander";
import { execFileSync, execSync } from "node:child_process";
import { expandPath } from "@mycelium/core";
import { ensureGitignore, generateEnvTemplate, getMissingEnvVars, setupEnvVars } from "../core/env-template.js";
import { detectMcpOverrides, loadMachineOverrides, saveMachineOverrides, rescanOverrides } from "../core/machine-overrides.js";
import { readFileIfExists, mkdirp } from "../core/fs-helpers.js";
import * as fs from "node:fs/promises";

const MYCELIUM_DIR = expandPath("~/.mycelium");

// ============================================================================
// Helpers
// ============================================================================

function git(args: string): string {
  return execSync(`git -C ${MYCELIUM_DIR} ${args}`, { encoding: "utf-8" }).trim();
}

// ============================================================================
// Push
// ============================================================================

export const pushCommand = new Command("push")
  .description("Commit and push ~/.mycelium to remote")
  .option("-m, --message <msg>", "Custom commit message")
  .action(async (options: { message?: string }) => {
    try {
      await ensureGitignore();
      const keys = await generateEnvTemplate();
      if (keys.length > 0) {
        console.log(`Updated .env.template with ${keys.length} keys`);
      }

      git("add -A");

      const msg = options.message ?? `mycelium push: ${new Date().toISOString()}`;
      try {
        execFileSync("git", ["-C", MYCELIUM_DIR, "commit", "-m", msg], { encoding: "utf-8" });
      } catch {
        console.log("Nothing to commit — already up to date.");
        return;
      }

      git("push");
      console.log("Pushed ~/.mycelium to remote.");
    } catch (err) {
      console.error("Push failed:", err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

// ============================================================================
// Pull
// ============================================================================

export const pullCommand = new Command("pull")
  .description("Pull ~/.mycelium from remote and auto-sync")
  .option("--repo <url>", "Clone from repo URL if ~/.mycelium doesn't exist")
  .option("--no-sync", "Skip auto-sync after pull")
  .option("--rescan", "Force re-detect machine overrides")
  .action(async (options: { repo?: string; sync?: boolean; rescan?: boolean }) => {
    try {
      // If --repo provided and no local config, clone first
      if (options.repo) {
        const exists = await readFileIfExists(path.join(MYCELIUM_DIR, "manifest.yaml"));
        if (!exists) {
          console.log(`Cloning from ${options.repo}...`);
          execFileSync("git", ["clone", options.repo, MYCELIUM_DIR], { stdio: "pipe" });
          console.log("Config cloned.");
        }
      }

      let output: string;
      try {
        output = git("pull");
        console.log(output);
      } catch {
        // Not a git repo — skip pull
        console.log("No git remote configured. Skipping pull.");
      }

      // Check missing env vars
      const missing = await getMissingEnvVars();
      if (missing.length > 0) {
        console.warn(`\nMissing env vars: ${missing.join(", ")}`);
        console.warn("Run: mycelium env setup");
      }

      // Detect machine overrides
      const mcpsPath = path.join(MYCELIUM_DIR, "mcps.yaml");
      const mcpsContent = await readFileIfExists(mcpsPath);
      if (mcpsContent) {
        // Simple extraction of command fields from mcps.yaml
        const mcps = parseMcpsForOverrides(mcpsContent);

        if (options.rescan) {
          const overrides = await rescanOverrides(mcps);
          for (const [name, entry] of Object.entries(overrides.mcps)) {
            console.log(`Auto-detected: ${name} at ${entry.command}`);
          }
        } else {
          const detected = detectMcpOverrides(mcps);
          if (detected.length > 0) {
            const existing = await loadMachineOverrides();
            const now = new Date().toISOString();
            for (const d of detected) {
              existing.mcps[d.name] = { command: d.newCommand, detectedAt: now };
              console.log(`Auto-detected: ${d.name} at ${d.newCommand}`);
            }
            existing.updatedAt = now;
            await saveMachineOverrides(existing);
          }
        }
      }

      // Auto-sync
      if (options.sync !== false) {
        console.log("\nRunning sync...");
        // Dynamic import to avoid circular deps
        const { syncCommand: sc } = await import("./sync.js");
        sc.parseAsync(["sync"], { from: "user" }).catch(() => {});
      }
    } catch (err) {
      console.error("Pull failed:", err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

// ============================================================================
// Env
// ============================================================================

export const envCommand = new Command("env")
  .description("Manage environment variables");

envCommand
  .command("setup")
  .description("Create .env.local template for missing vars")
  .action(async () => {
    const missing = await getMissingEnvVars();
    if (missing.length === 0) {
      console.log("All env vars are set.");
      return;
    }

    const localPath = path.join(MYCELIUM_DIR, ".env.local");
    const existing = await readFileIfExists(localPath);
    const existingLines = existing ? existing.split("\n") : [];
    const existingKeys = new Set(
      existingLines
        .filter((l) => l.includes("="))
        .map((l) => l.split("=")[0].trim()),
    );

    const newLines = missing
      .filter((k) => !existingKeys.has(k))
      .map((k) => `${k}=`);

    if (newLines.length > 0) {
      await mkdirp(MYCELIUM_DIR);
      const sep = existing && !existing.endsWith("\n") ? "\n" : "";
      await fs.writeFile(
        localPath,
        (existing ?? "") + sep + newLines.join("\n") + "\n",
        "utf-8",
      );
    }

    console.log(`Missing vars added to .env.local: ${missing.join(", ")}`);
    console.log(`Edit ${localPath} and fill in the values.`);
  });

envCommand
  .command("list")
  .description("Show all env vars and their status")
  .action(async () => {
    const templatePath = path.join(MYCELIUM_DIR, ".env.template");
    const localPath = path.join(MYCELIUM_DIR, ".env.local");

    const templateContent = await readFileIfExists(templatePath);
    if (!templateContent) {
      console.log("No .env.template found. Run: mycelium push");
      return;
    }

    const localContent = await readFileIfExists(localPath);
    const localPairs: Record<string, string> = {};
    if (localContent) {
      for (const line of localContent.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq === -1) continue;
        localPairs[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
      }
    }

    for (const line of templateContent.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = localPairs[key];
      const status = val ? "set" : "missing";
      const icon = val ? "\u2713" : "\u2717";
      console.log(`  ${icon} ${key}: ${status}`);
    }
  });

// ============================================================================
// Helper: parse mcps.yaml command fields for override detection
// ============================================================================

function parseMcpsForOverrides(content: string): Record<string, { command: string }> {
  const result: Record<string, { command: string }> = {};
  let currentName = "";

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    // Top-level key (no indentation)
    if (!line.startsWith(" ") && trimmed.endsWith(":") && !trimmed.includes(" ")) {
      currentName = trimmed.slice(0, -1);
    } else if (currentName && trimmed.startsWith("command:")) {
      result[currentName] = { command: trimmed.slice("command:".length).trim() };
    }
  }

  return result;
}

export { parseMcpsForOverrides as _parseMcpsForOverrides };
