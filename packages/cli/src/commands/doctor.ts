/**
 * Doctor Command for Mycelium CLI
 *
 * Checks system health and offers to fix issues:
 * - Checks if global mycelium dir exists
 * - Checks if manifest.yaml is valid
 * - Checks if each configured tool path exists
 * - Detects broken symlinks
 * - Validates MCP config JSON syntax
 * - Validates MCP config YAML syntax
 * - Reports all issues found
 * - Shows green checkmarks for passing checks
 * - Shows red X for failing checks
 * - Offers fix suggestions
 */

import { Command } from "commander";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as yaml from "yaml";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  type ToolId,
  SUPPORTED_TOOLS,
  expandPath,
  pathExists,
} from "@mycelium/core";

// ============================================================================
// Types
// ============================================================================

export interface DiagnosticResult {
  name: string;
  status: "pass" | "fail" | "warn";
  message: string;
  fix?: string;
}

export interface DoctorResult {
  success: boolean;
  checks: DiagnosticResult[];
  summary: {
    passed: number;
    failed: number;
    warnings: number;
  };
}

// ============================================================================
// Check Functions
// ============================================================================

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
  const toolConfig = SUPPORTED_TOOLS[toolId];
  const skillsPath = expandPath(toolConfig.skillsPath);
  const exists = await pathExists(skillsPath);

  if (exists) {
    return {
      name: `${toolConfig.name} Skills Path`,
      status: "pass",
      message: `Skills directory exists: ${toolConfig.skillsPath}`,
    };
  }

  return {
    name: `${toolConfig.name} Skills Path`,
    status: "warn",
    message: `Skills directory not found: ${toolConfig.skillsPath}`,
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
 * Check if memory files exist
 */
export async function checkMemoryFilesExist(): Promise<DiagnosticResult> {
  const memoryBasePath = expandPath("~/.mycelium/global/memory");
  const exists = await pathExists(memoryBasePath);

  if (!exists) {
    return {
      name: "Memory Files",
      status: "warn",
      message: "Memory directory not found",
      fix: "Run: mycelium init --global",
    };
  }

  try {
    const scopes = ["shared", "coding", "personal"];
    let totalFiles = 0;

    for (const scope of scopes) {
      const scopePath = path.join(memoryBasePath, scope);
      if (await pathExists(scopePath)) {
        const files = await fs.readdir(scopePath);
        const mdFiles = files.filter((f) => f.endsWith(".md"));
        totalFiles += mdFiles.length;
      }
    }

    if (totalFiles === 0) {
      return {
        name: "Memory Files",
        status: "warn",
        message: "No memory files found in any scope",
        fix: "Add .md files to ~/.mycelium/global/memory/{shared,coding,personal}/",
      };
    }

    return {
      name: "Memory Files",
      status: "pass",
      message: `${totalFiles} memory files found`,
    };
  } catch (error) {
    return {
      name: "Memory Files",
      status: "warn",
      message: `Error checking memory files: ${error instanceof Error ? error.message : String(error)}`,
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
      const toolConfig = SUPPORTED_TOOLS[toolId];
      if (!toolConfig) continue;

      const skillsPath = expandPath(toolConfig.skillsPath);
      if (await pathExists(skillsPath)) {
        try {
          const entries = await fs.readdir(skillsPath, { withFileTypes: true });
          const symlinks = entries.filter((e) => e.isSymbolicLink());
          if (symlinks.length > 0) {
            orphanedTools.push(toolConfig.name);
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

/**
 * Check if an MCP server command is accessible
 */
export async function checkMcpServerConnectivity(
  command: string,
  args: string[]
): Promise<DiagnosticResult> {
  const execFileAsync = promisify(execFile);
  try {
    await execFileAsync(command, args, { timeout: 5000 });
    return {
      name: "MCP Server Connectivity",
      status: "pass",
      message: `Command "${command}" is accessible`,
    };
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (err.code === "ENOENT") {
      return {
        name: "MCP Server Connectivity",
        status: "fail",
        message: `Command "${command}" not found`,
        fix: `Install or verify the path for "${command}"`,
      };
    }
    // Command exists but may have exited with error (still accessible)
    return {
      name: "MCP Server Connectivity",
      status: "pass",
      message: `Command "${command}" is accessible`,
    };
  }
}

/**
 * Check which supported tools are installed and report versions
 */
export async function checkToolVersions(): Promise<DiagnosticResult> {
  const installed: string[] = [];
  const missing: string[] = [];

  for (const [toolId, toolConfig] of Object.entries(SUPPORTED_TOOLS)) {
    const skillsPath = expandPath(toolConfig.skillsPath);
    const configPath = expandPath(toolConfig.mcpConfigPath);
    if ((await pathExists(skillsPath)) || (await pathExists(configPath))) {
      installed.push(toolConfig.name);
    } else {
      missing.push(toolConfig.name);
    }
  }

  if (installed.length === 0) {
    return {
      name: "Tool Versions",
      status: "warn",
      message: "No supported tools detected",
      fix: "Install at least one supported AI tool (Claude Code, Codex, etc.)",
    };
  }

  return {
    name: "Tool Versions",
    status: "pass",
    message: `${installed.length} tool(s) detected: ${installed.join(", ")}`,
  };
}

/**
 * Check if a memory file exceeds the line limit for a tool
 */
export async function checkMemoryFileSize(
  filePath: string,
  maxLines: number
): Promise<DiagnosticResult> {
  if (!(await pathExists(filePath))) {
    return {
      name: "Memory File Size",
      status: "pass",
      message: `File not present: ${filePath}`,
    };
  }

  try {
    const content = await fs.readFile(filePath, "utf-8");
    const lineCount = content.split("\n").length;

    if (lineCount > maxLines) {
      return {
        name: "Memory File Size",
        status: "warn",
        message: `${filePath} has ${lineCount} lines (limit: ${maxLines})`,
        fix: "Run: mycelium sync (smart compression will reduce it)",
      };
    }

    return {
      name: "Memory File Size",
      status: "pass",
      message: `${filePath} is within limits (${lineCount}/${maxLines} lines)`,
    };
  } catch (error) {
    return {
      name: "Memory File Size",
      status: "warn",
      message: `Error reading ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Run all diagnostic checks
 */
export async function runAllChecks(): Promise<DoctorResult> {
  const checks: DiagnosticResult[] = [];

  // 1. Check global mycelium directory
  checks.push(await checkGlobalMyceliumExists());

  // If global directory doesn't exist, many other checks will fail
  // But we still run them to give complete picture
  const globalExists = checks[0].status === "pass";

  // 2. Check manifest validity
  if (globalExists) {
    checks.push(await checkManifestValid());
  }

  // 3. Check memory files
  if (globalExists) {
    checks.push(await checkMemoryFilesExist());
  }

  // 4. Check each tool's paths and configs
  for (const [toolId, toolConfig] of Object.entries(SUPPORTED_TOOLS)) {
    // Check skills path
    checks.push(await checkToolPathExists(toolId as ToolId));

    // Check for broken symlinks in skills directory
    const skillsPath = expandPath(toolConfig.skillsPath);
    if (await pathExists(skillsPath)) {
      checks.push(await checkBrokenSymlinks(skillsPath));
    }

    // Check MCP config validity based on format
    const mcpConfigPath = expandPath(toolConfig.mcpConfigPath);
    if (toolConfig.mcpConfigFormat === "json") {
      checks.push(await checkMcpConfigJson(mcpConfigPath));
    } else if (toolConfig.mcpConfigFormat === "yaml") {
      checks.push(await checkMcpConfigYaml(mcpConfigPath));
    }
  }

  // 5. Check for orphaned configs
  if (globalExists) {
    checks.push(await checkOrphanedConfigs());
  }

  // 6. Check tool versions
  checks.push(await checkToolVersions());

  // 7. Check memory file sizes for tools with limits
  const memoryLimits: Partial<Record<ToolId, number>> = {
    "claude-code": 200,
  };
  for (const [toolId, maxLines] of Object.entries(memoryLimits)) {
    const toolConfig = SUPPORTED_TOOLS[toolId as ToolId];
    const memoryPath = expandPath(toolConfig.memoryPath);
    checks.push(await checkMemoryFileSize(memoryPath, maxLines));
  }

  // Calculate summary
  const summary = {
    passed: checks.filter((c) => c.status === "pass").length,
    failed: checks.filter((c) => c.status === "fail").length,
    warnings: checks.filter((c) => c.status === "warn").length,
  };

  return {
    success: summary.failed === 0,
    checks,
    summary,
  };
}

// ============================================================================
// Formatting Functions
// ============================================================================

/**
 * Format doctor output for terminal display
 */
export function formatDoctorOutput(result: DoctorResult): string {
  const lines: string[] = [];

  // Header
  lines.push("Mycelium Doctor");
  lines.push("===============");
  lines.push("");

  // Checks
  for (const check of result.checks) {
    let icon: string;
    let color: string;

    switch (check.status) {
      case "pass":
        icon = "\u2714"; // Checkmark
        color = "\u001b[32m"; // Green
        break;
      case "fail":
        icon = "\u2718"; // X mark
        color = "\u001b[31m"; // Red
        break;
      case "warn":
        icon = "\u26A0"; // Warning
        color = "\u001b[33m"; // Yellow
        break;
    }

    const reset = "\u001b[0m";
    lines.push(`${color}${icon}${reset} ${check.name}`);
    lines.push(`    ${check.message}`);

    if (check.fix && check.status !== "pass") {
      lines.push(`    ${color}Fix:${reset} ${check.fix}`);
    }

    lines.push("");
  }

  // Summary
  lines.push("Summary:");
  lines.push(`  ${result.summary.passed} passed`);
  if (result.summary.failed > 0) {
    lines.push(`  \u001b[31m${result.summary.failed} failed\u001b[0m`);
  } else {
    lines.push(`  ${result.summary.failed} failed`);
  }
  if (result.summary.warnings > 0) {
    lines.push(`  \u001b[33m${result.summary.warnings} warning${result.summary.warnings !== 1 ? "s" : ""}\u001b[0m`);
  } else {
    lines.push(`  ${result.summary.warnings} warnings`);
  }

  // Overall status
  lines.push("");
  if (result.success) {
    lines.push("\u001b[32m\u2714 System health check passed\u001b[0m");
  } else {
    lines.push("\u001b[31m\u2718 System health check failed\u001b[0m");
    lines.push("");
    lines.push("Run suggested fixes above to resolve issues.");
  }

  return lines.join("\n");
}

/**
 * Format doctor output as JSON
 */
export function formatDoctorJson(result: DoctorResult): string {
  return JSON.stringify(result, null, 2);
}

// ============================================================================
// Commander.js Command
// ============================================================================

export const doctorCommand = new Command("doctor")
  .description("Check system health and diagnose issues")
  .option("-j, --json", "Output as JSON")
  .option("-f, --fix", "Attempt to fix issues automatically")
  .action(async (options) => {
    try {
      const result = await runAllChecks();

      if (options.json) {
        console.log(formatDoctorJson(result));
      } else {
        console.log(formatDoctorOutput(result));
      }

      // Exit with non-zero if checks failed
      if (!result.success) {
        process.exit(1);
      }
    } catch (error) {
      console.error(
        "Error running doctor:",
        error instanceof Error ? error.message : String(error)
      );
      process.exit(1);
    }
  });
