/**
 * add-helpers — business logic for `mycelium add skill` and `mycelium add mcp`
 *
 * Extracted from commands/add.ts to keep the Commander command thin.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { parse as yamlParse, stringify as yamlStringify } from "yaml";
import { expandPath, ensureDir, pathExists, getGlobalMyceliumPath } from "@mycelish/core";
import { getRegistryEntry, parseRegistryEntry } from "./mcp-registry.js";
import { parseSkillMd, isValidSkillMd } from "./skill-parser.js";

const execAsync = promisify(exec);

// ============================================================================
// Types
// ============================================================================

export interface SkillSourceInfo {
  type: "github" | "local";
  name: string;
  owner?: string;
  repo?: string;
  subpath?: string;
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

export function parseSkillSource(source: string): SkillSourceInfo {
  if (!source || !source.trim()) {
    throw new Error("Invalid skill source: source cannot be empty");
  }

  const trimmedSource = source.trim();

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

  throw new Error(
    `Invalid skill source: "${source}". Use owner/repo for GitHub or ./path for local skills.`
  );
}

// ============================================================================
// GitHub clone helper
// ============================================================================

async function cloneFromGitHub(
  sourceInfo: SkillSourceInfo,
  skillDestPath: string
): Promise<{ success: boolean; error?: string }> {
  const repoUrl = `https://github.com/${sourceInfo.owner}/${sourceInfo.repo}.git`;
  try {
    if (sourceInfo.subpath) {
      const tempDir = path.join(path.dirname(skillDestPath), `.temp-${Date.now()}`);
      await execAsync(`git clone --depth 1 ${repoUrl} "${tempDir}"`);
      const subpathSource = path.join(tempDir, sourceInfo.subpath);
      await fs.cp(subpathSource, skillDestPath, { recursive: true });
      await fs.rm(tempDir, { recursive: true, force: true });
    } else {
      if (await pathExists(skillDestPath)) {
        await fs.rm(skillDestPath, { recursive: true, force: true });
      }
      await execAsync(`git clone --depth 1 ${repoUrl} "${skillDestPath}"`);
    }
    return { success: true };
  } catch (gitError) {
    return { success: false, error: `Failed to clone repository: ${(gitError as Error).message}` };
  }
}

// ============================================================================
// Local copy helper
// ============================================================================

async function copyFromLocal(
  sourceInfo: SkillSourceInfo,
  skillDestPath: string
): Promise<{ success: boolean; error?: string }> {
  const localPath = path.isAbsolute(sourceInfo.path!)
    ? sourceInfo.path!
    : path.resolve(process.cwd(), sourceInfo.path!);

  if (!(await pathExists(localPath))) {
    return { success: false, error: `Local path not found: ${sourceInfo.path}` };
  }

  await fs.cp(localPath, skillDestPath, { recursive: true });
  return { success: true };
}

// ============================================================================
// Manifest update helper
// ============================================================================

async function updateManifestWithSkill(
  manifestPath: string,
  manifestExists: boolean,
  sourceInfo: SkillSourceInfo,
  source: string,
  skillDestPath: string
): Promise<void> {
  let manifest: Record<string, unknown> = {};
  if (manifestExists) {
    const manifestContent = await fs.readFile(manifestPath, "utf-8");
    manifest = yamlParse(manifestContent) || {};
  }

  if (!manifest.skills) {
    manifest.skills = {};
  }

  let skillEntry: Record<string, unknown> = {
    source,
    path: `global/skills/${sourceInfo.name}`,
    enabled: true,
  };

  const skillMdPath = path.join(skillDestPath, "SKILL.md");
  if (await pathExists(skillMdPath)) {
    const skillMdContent = await fs.readFile(skillMdPath, "utf-8");
    if (isValidSkillMd(skillMdContent)) {
      const metadata = parseSkillMd(skillMdContent);
      skillEntry = {
        ...skillEntry,
        ...(metadata.description && { description: metadata.description }),
        ...(metadata.tools.length > 0 && { tools: metadata.tools }),
        ...(metadata.model && { model: metadata.model }),
        ...(metadata.color && { color: metadata.color }),
      };
    }
  }

  (manifest.skills as Record<string, unknown>)[sourceInfo.name] = skillEntry;
  await fs.writeFile(manifestPath, yamlStringify(manifest), "utf-8");
}

// ============================================================================
// Add Skill
// ============================================================================

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

    await ensureDir(skillsDir);

    if (sourceInfo.type === "github") {
      const result = cloneFromGitHub(sourceInfo, skillDestPath);
      const cloneResult = await result;
      if (!cloneResult.success) {
        return { success: false, name: sourceInfo.name, error: cloneResult.error };
      }
    }

    if (sourceInfo.type === "local") {
      const result = await copyFromLocal(sourceInfo, skillDestPath);
      if (!result.success) {
        return { success: false, name: sourceInfo.name, error: result.error };
      }
    }

    await updateManifestWithSkill(manifestPath, manifestExists, sourceInfo, source, skillDestPath);

    return {
      success: true,
      name: sourceInfo.name,
      path: skillDestPath,
      message: `Skill "${sourceInfo.name}" added successfully.`,
    };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

// ============================================================================
// MCP Name Parsing
// ============================================================================

export function parseMcpName(name: string): McpNameInfo {
  if (!name || name.trim() === "") {
    return { name: "", isValid: false, error: "MCP name cannot be empty" };
  }

  const trimmedName = name.trim();
  const validPattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
  if (!validPattern.test(trimmedName)) {
    return {
      name: trimmedName,
      isValid: false,
      error: `MCP name contains invalid characters: "${trimmedName}". Use only letters, numbers, hyphens, and underscores.`,
    };
  }

  return { name: trimmedName, isValid: true };
}

// ============================================================================
// Add MCP
// ============================================================================

export async function addMcp(
  name: string,
  options: AddMcpOptions
): Promise<AddMcpResult> {
  try {
    const nameInfo = parseMcpName(name);
    if (!nameInfo.isValid) {
      return { success: false, error: nameInfo.error };
    }

    const globalPath = getGlobalMyceliumPath();
    const basePath = options.global
      ? path.join(globalPath, "global")
      : options.projectRoot
        ? path.join(options.projectRoot, ".mycelium")
        : path.join(process.cwd(), ".mycelium");

    const mcpsPath = path.join(basePath, "mcps.yaml");
    await ensureDir(basePath);

    let mcpsConfig: { mcps: Record<string, unknown> } = { mcps: {} };
    const mcpsExists = await pathExists(mcpsPath);

    if (mcpsExists) {
      try {
        const mcpsContent = await fs.readFile(mcpsPath, "utf-8");
        mcpsConfig = yamlParse(mcpsContent) || { mcps: {} };
        if (!mcpsConfig.mcps) mcpsConfig.mcps = {};
      } catch {
        mcpsConfig = { mcps: {} };
      }
    }

    if (mcpsConfig.mcps[nameInfo.name] && !options.force) {
      return {
        success: false,
        name: nameInfo.name,
        error: `MCP "${nameInfo.name}" already exists. Use --force to overwrite.`,
      };
    }

    const mcpEntry: Record<string, unknown> = { command: options.command };
    if (options.args && options.args.length > 0) mcpEntry.args = options.args;
    if (options.env && Object.keys(options.env).length > 0) mcpEntry.env = options.env;
    if (options.enabled !== undefined) mcpEntry.enabled = options.enabled;

    mcpsConfig.mcps[nameInfo.name] = mcpEntry;
    await fs.writeFile(mcpsPath, yamlStringify(mcpsConfig), "utf-8");

    return {
      success: true,
      name: nameInfo.name,
      message: `MCP "${nameInfo.name}" added successfully.`,
    };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

// ============================================================================
// Registry fetch helper (used by mcp command --from-registry)
// ============================================================================

export async function fetchMcpFromRegistry(
  name: string
): Promise<{ command: string; args?: string[]; env?: string[] } | null> {
  const entry = await getRegistryEntry(name);
  if (!entry) return null;
  const config = parseRegistryEntry(entry);
  const result: { command: string; args?: string[]; env?: string[] } = {
    command: config.command,
    args: config.args,
  };
  if (config.env) {
    result.env = Object.entries(config.env).map(([k, v]) => `${k}=${v}`);
  }
  return result;
}
