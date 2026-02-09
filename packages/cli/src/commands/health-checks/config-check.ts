/**
 * Config file validation checks for doctor command.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as yaml from "yaml";
import {
  type ToolId,
  TOOL_REGISTRY,
  resolvePath,
  expandPath,
  pathExists,
} from "@mycelsh/core";
import type { DiagnosticResult } from "./types.js";

/**
 * Check if global ~/.mycelium directory exists
 */
export async function checkGlobalMyceliumExists(): Promise<DiagnosticResult> {
  const globalPath = expandPath("~/.mycelium");
  const exists = await pathExists(globalPath);

  if (exists) {
    return {
      name: "Global Mycelium Directory",
      status: "pass",
      message: `~/.mycelium exists`,
    };
  }

  return {
    name: "Global Mycelium Directory",
    status: "fail",
    message: "~/.mycelium not found",
    fix: "Run: mycelium init --global",
  };
}

/**
 * Check if manifest.yaml is valid
 */
export async function checkManifestValid(): Promise<DiagnosticResult> {
  const manifestPath = expandPath("~/.mycelium/manifest.yaml");
  const exists = await pathExists(manifestPath);

  if (!exists) {
    return {
      name: "Manifest Configuration",
      status: "fail",
      message: "manifest.yaml not found",
      fix: "Run: mycelium init --global",
    };
  }

  try {
    const content = await fs.readFile(manifestPath, "utf-8");
    yaml.parse(content);

    return {
      name: "Manifest Configuration",
      status: "pass",
      message: "manifest.yaml is valid",
    };
  } catch (error) {
    return {
      name: "Manifest Configuration",
      status: "fail",
      message: `Invalid YAML syntax: ${error instanceof Error ? error.message : String(error)}`,
      fix: "Check manifest.yaml for syntax errors",
    };
  }
}

/**
 * Check if tool skills directory exists
 */
export async function checkToolPathExists(
  toolId: ToolId
): Promise<DiagnosticResult> {
  const desc = TOOL_REGISTRY[toolId];
  const skillsPath = resolvePath(desc.paths.skills);
  const exists = skillsPath ? await pathExists(skillsPath) : false;

  if (exists) {
    return {
      name: `${desc.display.name} Skills Path`,
      status: "pass",
      message: `Skills directory exists: ${skillsPath}`,
    };
  }

  return {
    name: `${desc.display.name} Skills Path`,
    status: "warn",
    message: `Skills directory not found: ${skillsPath ?? "(none)"}`,
    fix: "Run: mycelium sync",
  };
}

/**
 * Check for broken symlinks in a directory
 */
export async function checkBrokenSymlinks(
  dirPath: string
): Promise<DiagnosticResult> {
  const exists = await pathExists(dirPath);

  if (!exists) {
    return {
      name: "Symlink Check",
      status: "pass",
      message: `Directory not present: ${dirPath}`,
    };
  }

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const symlinks = entries.filter((e) => e.isSymbolicLink());

    if (symlinks.length === 0) {
      return {
        name: "Symlink Check",
        status: "pass",
        message: "All symlinks are valid (no symlinks found)",
      };
    }

    const brokenSymlinks: string[] = [];

    for (const symlink of symlinks) {
      const symlinkPath = path.join(dirPath, symlink.name);
      try {
        await fs.stat(symlinkPath); // stat follows symlinks
      } catch {
        brokenSymlinks.push(symlink.name);
      }
    }

    if (brokenSymlinks.length === 0) {
      return {
        name: "Symlink Check",
        status: "pass",
        message: `All ${symlinks.length} symlinks are valid`,
      };
    }

    return {
      name: "Symlink Check",
      status: "fail",
      message: `${brokenSymlinks.length} broken symlinks: ${brokenSymlinks.join(", ")}`,
      fix: "Run: mycelium sync --force",
    };
  } catch (error) {
    return {
      name: "Symlink Check",
      status: "fail",
      message: `Error checking symlinks: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Check if MCP JSON config is valid
 */
export async function checkMcpConfigJson(
  configPath: string
): Promise<DiagnosticResult> {
  const exists = await pathExists(configPath);

  if (!exists) {
    return {
      name: "MCP JSON Config",
      status: "pass",
      message: `Config not present: ${configPath}`,
    };
  }

  try {
    const content = await fs.readFile(configPath, "utf-8");
    JSON.parse(content);

    return {
      name: "MCP JSON Config",
      status: "pass",
      message: `Config is valid: ${configPath}`,
    };
  } catch (error) {
    return {
      name: "MCP JSON Config",
      status: "fail",
      message: `Invalid JSON syntax in ${configPath}: ${error instanceof Error ? error.message : String(error)}`,
      fix: `Check ${configPath} for syntax errors`,
    };
  }
}

/**
 * Check if MCP YAML config is valid
 */
export async function checkMcpConfigYaml(
  configPath: string
): Promise<DiagnosticResult> {
  const exists = await pathExists(configPath);

  if (!exists) {
    return {
      name: "MCP YAML Config",
      status: "pass",
      message: `Config not present: ${configPath}`,
    };
  }

  try {
    const content = await fs.readFile(configPath, "utf-8");
    yaml.parse(content);

    return {
      name: "MCP YAML Config",
      status: "pass",
      message: `Config is valid: ${configPath}`,
    };
  } catch (error) {
    return {
      name: "MCP YAML Config",
      status: "fail",
      message: `Invalid YAML syntax in ${configPath}: ${error instanceof Error ? error.message : String(error)}`,
      fix: `Check ${configPath} for syntax errors`,
    };
  }
}

/**
 * Check for orphaned configs (skills synced to disabled tools)
 */
export async function checkOrphanedConfigs(): Promise<DiagnosticResult> {
  const manifestPath = expandPath("~/.mycelium/manifest.yaml");
  const exists = await pathExists(manifestPath);

  if (!exists) {
    return {
      name: "Orphaned Configs",
      status: "pass",
      message: "No manifest to check against",
    };
  }

  try {
    const content = await fs.readFile(manifestPath, "utf-8");
    const manifest = yaml.parse(content);
    const disabledTools: ToolId[] = [];

    // Find disabled tools
    for (const [toolId, config] of Object.entries(manifest.tools || {})) {
      if ((config as { enabled: boolean }).enabled === false) {
        disabledTools.push(toolId as ToolId);
      }
    }

    if (disabledTools.length === 0) {
      return {
        name: "Orphaned Configs",
        status: "pass",
        message: "No disabled tools to check",
      };
    }

    // Check if disabled tools have skills synced
    const orphanedTools: string[] = [];
    for (const toolId of disabledTools) {
      const desc = TOOL_REGISTRY[toolId];
      if (!desc) continue;

      const skillsPath = resolvePath(desc.paths.skills);
      if (skillsPath && await pathExists(skillsPath)) {
        try {
          const entries = await fs.readdir(skillsPath, { withFileTypes: true });
          const symlinks = entries.filter((e) => e.isSymbolicLink());
          if (symlinks.length > 0) {
            orphanedTools.push(desc.display.name);
          }
        } catch {
          // Ignore read errors
        }
      }
    }

    if (orphanedTools.length === 0) {
      return {
        name: "Orphaned Configs",
        status: "pass",
        message: "No orphaned skill symlinks found",
      };
    }

    return {
      name: "Orphaned Configs",
      status: "warn",
      message: `Found orphaned skill symlinks in: ${orphanedTools.join(", ")}`,
      fix: "Run: mycelium sync --force",
    };
  } catch (error) {
    return {
      name: "Orphaned Configs",
      status: "warn",
      message: `Error checking orphaned configs: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
