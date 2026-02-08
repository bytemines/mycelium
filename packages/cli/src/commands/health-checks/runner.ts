/**
 * Orchestrates running all doctor health checks.
 */

import {
  type ToolId,
  SUPPORTED_TOOLS,
  expandPath,
  pathExists,
} from "@mycelium/core";
import {
  checkGlobalMyceliumExists,
  checkManifestValid,
  checkToolPathExists,
  checkBrokenSymlinks,
  checkMcpConfigJson,
  checkMcpConfigYaml,
  checkOrphanedConfigs,
} from "./config-check.js";
import { checkMemoryFilesExist, checkMemoryFileSize, MEMORY_LINE_LIMIT } from "./memory-check.js";
import { checkToolVersions } from "./tool-version-check.js";
import type { DiagnosticResult, DoctorResult } from "./types.js";

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
    "claude-code": MEMORY_LINE_LIMIT,
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
