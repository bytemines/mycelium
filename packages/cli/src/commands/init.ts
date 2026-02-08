/**
 * init command - Initialize Mycelium configuration
 *
 * Usage:
 *   mycelium init                    # Auto-setup: detect gh, create/clone repo, migrate, sync
 *   mycelium init --repo <url>       # Clone existing config from a git repo
 *   mycelium init --global           # Creates ~/.mycelium/ with default structure (manual)
 *   mycelium init --force            # Overwrites existing configuration
 */

import { Command } from "commander";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { stringify as yamlStringify } from "yaml";
import { expandPath, ensureDir, pathExists } from "@mycelium/core";
import { ensureGitignore, generateEnvTemplate, getMissingEnvVars } from "../core/env-template.js";
import { detectMcpOverrides, saveMachineOverrides, loadMachineOverrides } from "../core/machine-overrides.js";
import { DEFAULT_PORT } from "../core/fs-helpers.js";

/** Default repo name — consistent across all machines for frictionless sync */
export const DEFAULT_REPO_NAME = "mycelium-config";

/**
 * Result of an init operation
 */
export interface InitResult {
  success: boolean;
  path: string;
  skipped: boolean;
  message?: string;
}

/**
 * Options for initGlobal
 */
export interface InitGlobalOptions {
  force: boolean;
}

/**
 * Options for initProject
 */
export interface InitProjectOptions {
  projectRoot?: string;
  force: boolean;
}

/**
 * Default manifest.yaml configuration
 */
export const DEFAULT_MANIFEST_CONFIG = {
  version: "1.0",
  tools: {
    "claude-code": { enabled: true },
    "codex": { enabled: true },
    "gemini-cli": { enabled: true },
    "opencode": { enabled: true },
    "openclaw": { enabled: true },
    "aider": { enabled: true },
  },
  memory: {
    scopes: {
      shared: {
        sync_to: ["claude-code", "codex", "gemini-cli", "opencode", "openclaw", "aider"],
        path: "global/memory/shared/",
        files: [],
      },
      coding: {
        sync_to: ["claude-code", "codex", "gemini-cli", "opencode", "aider"],
        exclude_from: ["openclaw"],
        path: "global/memory/coding/",
        files: [],
      },
      personal: {
        sync_to: ["openclaw"],
        exclude_from: ["claude-code", "codex", "gemini-cli", "opencode", "aider"],
        path: "global/memory/personal/",
        files: [],
      },
    },
  },
};

/**
 * Default .env.example template content
 */
const ENV_EXAMPLE_CONTENT = `# Mycelium Environment Variables
# Copy this file to .env.local and fill in your secrets

# API Keys (optional, for MCPs that need them)
# OPENAI_API_KEY=your-key-here
# ANTHROPIC_API_KEY=your-key-here

# Custom MCP Environment Variables
# MY_CUSTOM_MCP_TOKEN=your-token-here
`;

/**
 * Default .env.local content
 */
const ENV_LOCAL_CONTENT = `# Local secrets - DO NOT COMMIT THIS FILE
# Add your actual API keys and secrets here

`;

/**
 * Default global mcps.yaml content
 */
const GLOBAL_MCPS_YAML_CONTENT = `# Global MCP configurations
# Add MCPs that should be available across all projects

mcps: {}
  # Example:
  # context7:
  #   command: npx
  #   args: ["-y", "@context7/mcp"]
  #   enabled: true
`;

/**
 * Default project mcps.yaml content
 */
const PROJECT_MCPS_YAML_CONTENT = `# Project-specific MCP configurations
# Add MCPs that are specific to this project
# These will be merged with global MCPs

mcps: {}
  # Example:
  # my-project-mcp:
  #   command: node
  #   args: ["./scripts/mcp-server.js"]
  #   enabled: true
`;

/**
 * Initialize global Mycelium configuration at ~/.mycelium/
 */
export async function initGlobal(options: InitGlobalOptions): Promise<InitResult> {
  const globalPath = expandPath("~/.mycelium");
  const manifestPath = path.join(globalPath, "manifest.yaml");

  // Check if already exists
  const exists = await pathExists(manifestPath);
  if (exists && !options.force) {
    return {
      success: true,
      path: globalPath,
      skipped: true,
      message: `Global configuration already exists at ${globalPath}. Use --force to overwrite.`,
    };
  }

  // Create directory structure
  await ensureDir(globalPath);
  await ensureDir(path.join(globalPath, "global/skills"));
  await ensureDir(path.join(globalPath, "global/memory/shared"));
  await ensureDir(path.join(globalPath, "global/memory/coding"));
  await ensureDir(path.join(globalPath, "global/memory/personal"));
  await ensureDir(path.join(globalPath, "machines"));

  // Write manifest.yaml
  const manifestContent = yamlStringify(DEFAULT_MANIFEST_CONFIG);
  await fs.writeFile(manifestPath, manifestContent, "utf-8");

  // Write .env.example
  await fs.writeFile(path.join(globalPath, ".env.example"), ENV_EXAMPLE_CONTENT, "utf-8");

  // Write .env.local
  await fs.writeFile(path.join(globalPath, ".env.local"), ENV_LOCAL_CONTENT, "utf-8");

  // Write global/mcps.yaml
  await fs.writeFile(path.join(globalPath, "global/mcps.yaml"), GLOBAL_MCPS_YAML_CONTENT, "utf-8");

  return {
    success: true,
    path: globalPath,
    skipped: false,
  };
}

/**
 * Initialize project-specific Mycelium configuration at .mycelium/
 */
export async function initProject(options: InitProjectOptions): Promise<InitResult> {
  const projectRoot = options.projectRoot || process.cwd();
  const projectPath = path.join(projectRoot, ".mycelium");
  const mcpsPath = path.join(projectPath, "mcps.yaml");

  // Check if already exists
  const exists = await pathExists(mcpsPath);
  if (exists && !options.force) {
    return {
      success: true,
      path: projectPath,
      skipped: true,
      message: `Project configuration already exists at ${projectPath}. Use --force to overwrite.`,
    };
  }

  // Create directory structure
  await ensureDir(projectPath);
  await ensureDir(path.join(projectPath, "memory"));

  // Write mcps.yaml
  await fs.writeFile(mcpsPath, PROJECT_MCPS_YAML_CONTENT, "utf-8");

  return {
    success: true,
    path: projectPath,
    skipped: false,
  };
}

// ============================================================================
// Zero-friction auto-setup
// ============================================================================

/** Check if gh CLI is available and authenticated */
export function isGhAvailable(): boolean {
  try {
    execFileSync("gh", ["auth", "status"], { stdio: "pipe", encoding: "utf-8" });
    return true;
  } catch {
    return false;
  }
}

/** Check if a GitHub repo exists */
export function ghRepoExists(repoName: string): boolean {
  try {
    execFileSync("gh", ["repo", "view", repoName, "--json", "name"], { stdio: "pipe", encoding: "utf-8" });
    return true;
  } catch {
    return false;
  }
}

/** Get the GitHub username */
export function getGhUsername(): string {
  return execFileSync("gh", ["api", "user", "--jq", ".login"], { stdio: "pipe", encoding: "utf-8" }).trim();
}

/** Create a private GitHub repo and clone to ~/.mycelium */
export async function createAndCloneRepo(repoName: string): Promise<void> {
  const myceliumDir = expandPath("~/.mycelium");

  console.log(`Creating private repo: ${repoName}`);
  execFileSync("gh", ["repo", "create", repoName, "--private", "--description", "Mycelium AI tool config sync"], { stdio: "pipe" });

  // Init locally, add remote, push
  await ensureDir(myceliumDir);
  execFileSync("git", ["-C", myceliumDir, "init"], { stdio: "pipe" });
  const url = getCloneUrl(repoName);
  execFileSync("git", ["-C", myceliumDir, "remote", "add", "origin", url], { stdio: "pipe" });
}

/** Clone an existing repo to ~/.mycelium, trying SSH first then HTTPS */
export async function cloneRepo(repoUrl: string): Promise<void> {
  const myceliumDir = expandPath("~/.mycelium");
  // Remove empty dir if exists
  try {
    const entries = await fs.readdir(myceliumDir);
    if (entries.length === 0) {
      await fs.rmdir(myceliumDir);
    }
  } catch { /* doesn't exist */ }

  execFileSync("git", ["clone", repoUrl, myceliumDir], { stdio: "pipe" });
}

/** Get clone URL for a GitHub repo, trying SSH first then HTTPS */
export function getCloneUrl(repoFullName: string): string {
  // Try SSH first (faster, no token needed if keys are set up)
  try {
    execFileSync("ssh", ["-T", "git@github.com"], { stdio: "pipe", timeout: 5000 });
    // If SSH doesn't throw a connection error, use SSH URL
    return `git@github.com:${repoFullName}.git`;
  } catch {
    // Fall back to HTTPS (works with gh auth)
  }
  return `https://github.com/${repoFullName}.git`;
}

/** Check if ~/.mycelium is already a git repo with a remote */
export function hasGitRemote(): boolean {
  const myceliumDir = expandPath("~/.mycelium");
  try {
    const remote = execFileSync("git", ["-C", myceliumDir, "remote", "get-url", "origin"], { stdio: "pipe", encoding: "utf-8" }).trim();
    return remote.length > 0;
  } catch {
    return false;
  }
}

/**
 * Zero-friction auto-setup flow:
 * 1. Check if ~/.mycelium exists with config
 * 2. If not, check gh CLI → create/clone repo
 * 3. Run migration if tools detected
 * 4. Setup env template
 * 5. Auto-sync
 */
export async function autoSetup(options: {
  repo?: string;
  force?: boolean;
}): Promise<void> {
  const myceliumDir = expandPath("~/.mycelium");
  const manifestExists = await pathExists(path.join(myceliumDir, "manifest.yaml"));
  const migrationExists = await pathExists(path.join(myceliumDir, "migration-manifest.json"));
  const hasRemote = hasGitRemote();

  // Step 1: Handle repo setup
  if (options.repo) {
    // Explicit repo URL provided
    if (migrationExists && !options.force) {
      console.log("Config already exists at ~/.mycelium/. Use --force to overwrite.");
      return;
    }
    console.log(`Cloning config from ${options.repo}...`);
    await cloneRepo(options.repo);
    console.log("Config cloned successfully.");
  } else if (!manifestExists && !migrationExists) {
    // Fresh machine — try gh auto-setup
    if (isGhAvailable()) {
      const username = getGhUsername();
      const repoName = `${username}/${DEFAULT_REPO_NAME}`;
      console.log(`GitHub CLI detected (${username}).`);

      if (ghRepoExists(repoName)) {
        console.log(`Found existing repo: ${repoName}`);
        await cloneRepo(getCloneUrl(repoName));
        console.log("Config cloned from GitHub.");
      } else {
        console.log(`No existing config repo found.`);
        // Init fresh + create repo
        const result = await initGlobal({ force: true });
        console.log(`Initialized at ${result.path}`);
        await createAndCloneRepo(repoName);
        console.log(`Created private repo: ${repoName}`);
      }
    } else {
      // No gh — just init locally
      console.log("GitHub CLI not detected. Initializing locally.");
      const result = await initGlobal({ force: true });
      console.log(`Initialized at ${result.path}`);
      console.log("Tip: Install gh CLI for automatic multi-PC sync.");
    }
  } else {
    console.log("Config already exists at ~/.mycelium/.");
    if (!hasRemote && isGhAvailable()) {
      console.log("No git remote found. Setting up sync...");
      const username = getGhUsername();
      const repoName = `${username}/${DEFAULT_REPO_NAME}`;
      if (!ghRepoExists(repoName)) {
        await createAndCloneRepo(repoName);
        console.log(`Created private repo: ${repoName}`);
      } else {
        // Repo exists but not linked — add remote
        try {
          execFileSync("git", ["-C", myceliumDir, "init"], { stdio: "pipe" });
          execFileSync("git", ["-C", myceliumDir, "remote", "add", "origin", getCloneUrl(repoName)], { stdio: "pipe" });
          console.log(`Linked to existing repo: ${repoName}`);
        } catch {
          console.log(`Remote already configured.`);
        }
      }
    }
  }

  // Step 2: Run migration if tools have config to import
  const skillsDir = path.join(myceliumDir, "global", "skills");
  let hasSkills = false;
  try {
    const entries = await fs.readdir(skillsDir);
    hasSkills = entries.length > 0;
  } catch { /* no skills dir yet */ }

  if (!hasSkills) {
    console.log("\nScanning installed tools for migration...");
    try {
      const { scanAllTools, executeMigration, generateMigrationPlan } = await import("../core/migrator/index.js");
      const scanResults = await scanAllTools();
      const totalItems =
        scanResults.reduce((sum, r) => sum + r.skills.length + r.mcps.length + r.memory.length + (r.hooks?.length ?? 0), 0);

      if (totalItems > 0) {
        const plan = generateMigrationPlan(scanResults);
        console.log(`Found ${totalItems} items to migrate. Applying...`);
        const result = await executeMigration(plan);
        console.log(`Migrated: ${result.skillsImported} skills, ${result.mcpsImported} MCPs, ${result.memoryImported} memory`);
      } else {
        console.log("No tool configs found to migrate.");
      }
    } catch (err) {
      console.warn("Migration scan failed:", err instanceof Error ? err.message : String(err));
    }
  }

  // Step 3: Env template + gitignore
  await ensureGitignore();
  const keys = await generateEnvTemplate();
  if (keys.length > 0) {
    console.log(`Generated .env.template with ${keys.length} keys`);
  }

  // Step 4: Check missing env vars
  const missing = await getMissingEnvVars();
  if (missing.length > 0) {
    console.log(`\nMissing env vars: ${missing.join(", ")}`);
    console.log("Run: mycelium env setup");
  }

  // Step 5: Auto-detect machine overrides
  const mcpsPath = path.join(myceliumDir, "global", "mcps.yaml");
  try {
    const mcpsContent = await fs.readFile(mcpsPath, "utf-8");
    const { _parseMcpsForOverrides } = await import("./remote.js");
    const mcps = _parseMcpsForOverrides(mcpsContent);
    const detected = detectMcpOverrides(mcps);
    if (detected.length > 0) {
      const existing = await loadMachineOverrides();
      const now = new Date().toISOString();
      for (const d of detected) {
        existing.mcps[d.name] = { command: d.newCommand, detectedAt: now };
      }
      existing.updatedAt = now;
      await saveMachineOverrides(existing);
      console.log(`Detected ${detected.length} machine-specific MCP path(s).`);
    }
  } catch { /* no mcps yet */ }

  // Step 6: Initial push if repo is set up
  if (hasGitRemote()) {
    try {
      const dir = myceliumDir;
      execFileSync("git", ["-C", dir, "add", "-A"], { stdio: "pipe" });
      try {
        execFileSync("git", ["-C", dir, "commit", "-m", "mycelium init: initial config"], { stdio: "pipe" });
        try {
          execFileSync("git", ["-C", dir, "push", "-u", "origin", "main"], { stdio: "pipe" });
        } catch {
          execFileSync("git", ["-C", dir, "push", "-u", "origin", "master"], { stdio: "pipe" });
        }
        console.log("\nConfig pushed to GitHub.");
      } catch {
        // Nothing to commit or already pushed
      }
    } catch {
      // Push failed — non-critical
    }
  }

  console.log("\nSetup complete. Next steps:");
  console.log("  mycelium sync          # Push config to all installed tools");
  console.log(`  mycelium serve         # Start dashboard at http://localhost:${DEFAULT_PORT}`);
  if (!hasGitRemote()) {
    console.log("  mycelium push          # Push config to remote (after setting up git)");
  }
}

// ============================================================================
// Commander.js Command
// ============================================================================

/**
 * Commander.js command for `mycelium init`
 */
export const initCommand = new Command("init")
  .description("Initialize Mycelium — auto-detect tools, create GitHub repo, migrate, sync")
  .option("-g, --global", "Initialize global configuration at ~/.mycelium/ (manual mode)")
  .option("-f, --force", "Overwrite existing configuration")
  .option("-r, --repo <url>", "Clone config from an existing git repo URL")
  .action(async (options: { global?: boolean; force?: boolean; repo?: string }) => {
    const force = options.force ?? false;

    if (options.global) {
      // Manual mode — just create directory structure
      const result = await initGlobal({ force });
      if (result.skipped) {
        console.log(result.message);
      } else {
        console.log(`Global Mycelium configuration initialized at ${result.path}`);
      }
    } else {
      // Zero-friction auto-setup
      await autoSetup({ repo: options.repo, force });
    }
  });
