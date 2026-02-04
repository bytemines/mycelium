/**
 * init command - Initialize Mycelium configuration
 *
 * Usage:
 *   mycelium init --global    # Creates ~/.mycelium/ with default structure
 *   mycelium init             # Creates .mycelium/ in current project directory
 *   mycelium init --force     # Overwrites existing configuration
 */

import { Command } from "commander";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { stringify as yamlStringify } from "yaml";
import { expandPath, ensureDir, pathExists } from "@mycelium/core";

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

/**
 * Commander.js command for `mycelium init`
 */
export const initCommand = new Command("init")
  .description("Initialize Mycelium configuration")
  .option("-g, --global", "Initialize global configuration at ~/.mycelium/")
  .option("-f, --force", "Overwrite existing configuration")
  .action(async (options: { global?: boolean; force?: boolean }) => {
    const force = options.force ?? false;

    if (options.global) {
      const result = await initGlobal({ force });
      if (result.skipped) {
        console.log(result.message);
      } else {
        console.log(`Global Mycelium configuration initialized at ${result.path}`);
      }
    } else {
      const result = await initProject({ force });
      if (result.skipped) {
        console.log(result.message);
      } else {
        console.log(`Project Mycelium configuration initialized at ${result.path}`);
      }
    }
  });
