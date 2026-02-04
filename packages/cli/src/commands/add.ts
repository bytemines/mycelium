/**
 * add command - Add skills and MCPs to Mycelium configuration
 *
 * Usage:
 *   mycelium add skill <source>     # Add a skill from GitHub (owner/repo) or local path (./local/skill)
 *   mycelium add mcp <name>         # Add an MCP server configuration
 *
 * Examples:
 *   mycelium add skill anthropic/claude-skills --global
 *   mycelium add skill ./my-local-skill
 *   mycelium add mcp context7 --command "npx" --args "-y @context7/mcp" --global
 */

import { Command } from "commander";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { parse as yamlParse, stringify as yamlStringify } from "yaml";
import { expandPath, ensureDir, pathExists, getGlobalMyceliumPath } from "@mycelium/core";

const execAsync = promisify(exec);

// ============================================================================
// Types
// ============================================================================

export interface SkillSourceInfo {
  type: "github" | "local";
  name: string;
  // GitHub-specific
  owner?: string;
  repo?: string;
  subpath?: string;
  // Local-specific
  path?: string;
}

export interface AddSkillOptions {
  global?: boolean;
  force?: boolean;
  projectRoot?: string;
}

export interface AddSkillResult {
  success: boolean;
  name?: string;
  path?: string;
  message?: string;
  error?: string;
}

export interface McpNameInfo {
  name: string;
  isValid: boolean;
  error?: string;
}

export interface AddMcpOptions {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  enabled?: boolean;
  global?: boolean;
  force?: boolean;
  projectRoot?: string;
}

export interface AddMcpResult {
  success: boolean;
  name?: string;
  message?: string;
  error?: string;
}

// ============================================================================
// Skill Source Parsing
// ============================================================================

/**
 * Parse a skill source string to determine if it's a GitHub repo or local path
 */
export function parseSkillSource(source: string): SkillSourceInfo {
  // Empty or whitespace-only source is invalid
  if (!source || !source.trim()) {
    throw new Error("Invalid skill source: source cannot be empty");
  }

  const trimmedSource = source.trim();

  // Check for GitHub URL format: https://github.com/owner/repo
  const githubUrlMatch = trimmedSource.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+)(?:\/(.*))?$/
  );
  if (githubUrlMatch) {
    const [, owner, repo, subpath] = githubUrlMatch;
    const cleanRepo = repo.replace(/\.git$/, "");
    return {
      type: "github",
      owner,
      repo: cleanRepo,
      subpath: subpath || undefined,
      name: subpath ? path.basename(subpath) : cleanRepo,
    };
  }

  // Check for local path (starts with ./, ../, or /)
  if (
    trimmedSource.startsWith("./") ||
    trimmedSource.startsWith("../") ||
    trimmedSource.startsWith("/")
  ) {
    return {
      type: "local",
      path: trimmedSource,
      name: path.basename(trimmedSource),
    };
  }

  // Check for GitHub owner/repo format
  const githubShortMatch = trimmedSource.match(/^([^/]+)\/([^/]+)(?:\/(.*))?$/);
  if (githubShortMatch) {
    const [, owner, repo, subpath] = githubShortMatch;
    return {
      type: "github",
      owner,
      repo,
      subpath: subpath || undefined,
      name: subpath ? path.basename(subpath) : repo,
    };
  }

  // Invalid source format
  throw new Error(
    `Invalid skill source: "${source}". Use owner/repo for GitHub or ./path for local skills.`
  );
}

// ============================================================================
// Add Skill Implementation
// ============================================================================

/**
 * Add a skill from GitHub or local path
 */
export async function addSkill(
  source: string,
  options: AddSkillOptions
): Promise<AddSkillResult> {
  try {
    const sourceInfo = parseSkillSource(source);
    const globalPath = getGlobalMyceliumPath();
    const basePath = options.global
      ? globalPath
      : options.projectRoot
        ? path.join(options.projectRoot, ".mycelium")
        : path.join(process.cwd(), ".mycelium");

    const skillsDir = path.join(basePath, "global/skills");
    const manifestPath = path.join(basePath, "manifest.yaml");
    const skillDestPath = path.join(skillsDir, sourceInfo.name);

    // Check if skill already exists
    const manifestExists = await pathExists(manifestPath);
    if (manifestExists) {
      const manifestContent = await fs.readFile(manifestPath, "utf-8");
      const manifest = yamlParse(manifestContent) || {};

      if (manifest.skills && manifest.skills[sourceInfo.name] && !options.force) {
        return {
          success: false,
          name: sourceInfo.name,
          error: `Skill "${sourceInfo.name}" already exists. Use --force to overwrite.`,
        };
      }
    }

    // Ensure skills directory exists
    await ensureDir(skillsDir);

    // Handle GitHub source
    if (sourceInfo.type === "github") {
      const repoUrl = `https://github.com/${sourceInfo.owner}/${sourceInfo.repo}.git`;

      try {
        // Clone the repository
        if (sourceInfo.subpath) {
          // Clone to a temp directory first, then copy the subpath
          const tempDir = path.join(skillsDir, `.temp-${Date.now()}`);
          await execAsync(`git clone --depth 1 ${repoUrl} "${tempDir}"`);
          const subpathSource = path.join(tempDir, sourceInfo.subpath);
          await fs.cp(subpathSource, skillDestPath, { recursive: true });
          await fs.rm(tempDir, { recursive: true, force: true });
        } else {
          // Clone directly to the skill destination
          if (await pathExists(skillDestPath)) {
            await fs.rm(skillDestPath, { recursive: true, force: true });
          }
          await execAsync(`git clone --depth 1 ${repoUrl} "${skillDestPath}"`);
        }
      } catch (gitError) {
        return {
          success: false,
          name: sourceInfo.name,
          error: `Failed to clone repository: ${(gitError as Error).message}`,
        };
      }
    }

    // Handle local source
    if (sourceInfo.type === "local") {
      const localPath = path.isAbsolute(sourceInfo.path!)
        ? sourceInfo.path!
        : path.resolve(process.cwd(), sourceInfo.path!);

      const localExists = await pathExists(localPath);
      if (!localExists) {
        return {
          success: false,
          name: sourceInfo.name,
          error: `Local path not found: ${sourceInfo.path}`,
        };
      }

      // Copy the local skill to the skills directory
      await fs.cp(localPath, skillDestPath, { recursive: true });
    }

    // Update manifest.yaml with the new skill
    let manifest: Record<string, unknown> = {};
    if (manifestExists) {
      const manifestContent = await fs.readFile(manifestPath, "utf-8");
      manifest = yamlParse(manifestContent) || {};
    }

    if (!manifest.skills) {
      manifest.skills = {};
    }

    (manifest.skills as Record<string, unknown>)[sourceInfo.name] = {
      source: source,
      path: `global/skills/${sourceInfo.name}`,
      enabled: true,
    };

    await fs.writeFile(manifestPath, yamlStringify(manifest), "utf-8");

    return {
      success: true,
      name: sourceInfo.name,
      path: skillDestPath,
      message: `Skill "${sourceInfo.name}" added successfully.`,
    };
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

// ============================================================================
// MCP Name Parsing
// ============================================================================

/**
 * Parse and validate an MCP name
 */
export function parseMcpName(name: string): McpNameInfo {
  if (!name || name.trim() === "") {
    return {
      name: "",
      isValid: false,
      error: "MCP name cannot be empty",
    };
  }

  const trimmedName = name.trim();

  // MCP names can contain alphanumeric characters, hyphens, and underscores
  const validPattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
  if (!validPattern.test(trimmedName)) {
    return {
      name: trimmedName,
      isValid: false,
      error: `MCP name contains invalid characters: "${trimmedName}". Use only letters, numbers, hyphens, and underscores.`,
    };
  }

  return {
    name: trimmedName,
    isValid: true,
  };
}

// ============================================================================
// Add MCP Implementation
// ============================================================================

/**
 * Add an MCP server configuration
 */
export async function addMcp(
  name: string,
  options: AddMcpOptions
): Promise<AddMcpResult> {
  try {
    const nameInfo = parseMcpName(name);
    if (!nameInfo.isValid) {
      return {
        success: false,
        error: nameInfo.error,
      };
    }

    const globalPath = getGlobalMyceliumPath();
    const basePath = options.global
      ? path.join(globalPath, "global")
      : options.projectRoot
        ? path.join(options.projectRoot, ".mycelium")
        : path.join(process.cwd(), ".mycelium");

    const mcpsPath = path.join(basePath, "mcps.yaml");

    // Ensure the directory exists
    await ensureDir(basePath);

    // Load existing mcps.yaml or create empty structure
    let mcpsConfig: { mcps: Record<string, unknown> } = { mcps: {} };
    const mcpsExists = await pathExists(mcpsPath);

    if (mcpsExists) {
      try {
        const mcpsContent = await fs.readFile(mcpsPath, "utf-8");
        mcpsConfig = yamlParse(mcpsContent) || { mcps: {} };
        if (!mcpsConfig.mcps) {
          mcpsConfig.mcps = {};
        }
      } catch {
        // If parsing fails, start with empty config
        mcpsConfig = { mcps: {} };
      }
    }

    // Check if MCP already exists
    if (mcpsConfig.mcps[nameInfo.name] && !options.force) {
      return {
        success: false,
        name: nameInfo.name,
        error: `MCP "${nameInfo.name}" already exists. Use --force to overwrite.`,
      };
    }

    // Build the MCP config
    const mcpEntry: Record<string, unknown> = {
      command: options.command,
    };

    if (options.args && options.args.length > 0) {
      mcpEntry.args = options.args;
    }

    if (options.env && Object.keys(options.env).length > 0) {
      mcpEntry.env = options.env;
    }

    if (options.enabled !== undefined) {
      mcpEntry.enabled = options.enabled;
    }

    // Add the MCP to the config
    mcpsConfig.mcps[nameInfo.name] = mcpEntry;

    // Write the updated config
    await fs.writeFile(mcpsPath, yamlStringify(mcpsConfig), "utf-8");

    return {
      success: true,
      name: nameInfo.name,
      message: `MCP "${nameInfo.name}" added successfully.`,
    };
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

// ============================================================================
// Commander.js Commands
// ============================================================================

/**
 * skill subcommand: mycelium add skill <source>
 */
const skillCommand = new Command("skill")
  .description("Add a skill from GitHub (owner/repo) or local path (./local/skill)")
  .argument("<source>", "Skill source (owner/repo for GitHub or ./path for local)")
  .option("-g, --global", "Add to global configuration (~/.mycelium/)")
  .option("-f, --force", "Overwrite existing skill")
  .action(async (source: string, options: { global?: boolean; force?: boolean }) => {
    const result = await addSkill(source, {
      global: options.global ?? true,
      force: options.force ?? false,
    });

    if (result.success) {
      console.log(result.message);
    } else {
      console.error(`Error: ${result.error}`);
      process.exit(1);
    }
  });

/**
 * mcp subcommand: mycelium add mcp <name>
 */
const mcpCommand = new Command("mcp")
  .description("Add an MCP server configuration")
  .argument("<name>", "MCP server name")
  .option("-c, --command <command>", "Command to run the MCP server")
  .option("-a, --args <args...>", "Arguments for the command")
  .option("-e, --env <env...>", "Environment variables (KEY=value)")
  .option("--enabled", "Enable the MCP server (default: true)")
  .option("-g, --global", "Add to global configuration (~/.mycelium/)")
  .option("-f, --force", "Overwrite existing MCP")
  .action(
    async (
      name: string,
      options: {
        command?: string;
        args?: string[];
        env?: string[];
        enabled?: boolean;
        global?: boolean;
        force?: boolean;
      }
    ) => {
      if (!options.command) {
        console.error("Error: --command is required");
        process.exit(1);
      }

      // Parse environment variables from KEY=value format
      const env: Record<string, string> = {};
      if (options.env) {
        for (const envVar of options.env) {
          const [key, ...valueParts] = envVar.split("=");
          if (key && valueParts.length > 0) {
            env[key] = valueParts.join("=");
          }
        }
      }

      const result = await addMcp(name, {
        command: options.command,
        args: options.args,
        env: Object.keys(env).length > 0 ? env : undefined,
        enabled: options.enabled,
        global: options.global ?? true,
        force: options.force ?? false,
      });

      if (result.success) {
        console.log(result.message);
      } else {
        console.error(`Error: ${result.error}`);
        process.exit(1);
      }
    }
  );

/**
 * Commander.js command for `mycelium add`
 */
export const addCommand = new Command("add")
  .description("Add skills or MCPs to Mycelium configuration")
  .addCommand(skillCommand)
  .addCommand(mcpCommand);
