/**
 * Orchestrates running all doctor health checks.
 */

import {
  type ToolId,
  TOOL_REGISTRY,
  resolvePath,
  pathExists,
} from "@mycelish/core";
import {
  checkGlobalMyceliumExists,
  checkManifestValid,
  checkToolPathExists,
  checkBrokenSymlinks,
  checkMcpConfigJson,
  checkMcpConfigYaml,
  checkOrphanedConfigs,
} from "./config-check.js";
import { checkMemoryFilesExist, checkMemoryFileSize } from "./memory-check.js";
import { TOOL_MAX_LINES } from "../../core/fs-helpers.js";
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
  for (const [toolId, desc] of Object.entries(TOOL_REGISTRY)) {
    // Check skills path
    checks.push(await checkToolPathExists(toolId as ToolId));

    // Check for broken symlinks in skills directory
    const skillsPath = resolvePath(desc.paths.skills);
    if (skillsPath && await pathExists(skillsPath)) {
      checks.push(await checkBrokenSymlinks(skillsPath));
    }

    // Check MCP config validity based on format
    const mcpConfigPath = resolvePath(desc.paths.mcp);
    const fmt = desc.mcp.format === "jsonc" ? "json" : desc.mcp.format;
    if (mcpConfigPath) {
      if (fmt === "json") {
        checks.push(await checkMcpConfigJson(mcpConfigPath));
      } else if (fmt === "yaml") {
        checks.push(await checkMcpConfigYaml(mcpConfigPath));
      }
    }
  }

  // 5. Check for orphaned configs
  if (globalExists) {
    checks.push(await checkOrphanedConfigs());
  }

  // 6. Check tool versions
  checks.push(await checkToolVersions());

  // 7. Check memory file sizes for tools with limits
  for (const [toolId, maxLines] of Object.entries(TOOL_MAX_LINES)) {
    if (maxLines == null) continue;
    const desc = TOOL_REGISTRY[toolId];
    const memoryPath = resolvePath(desc.paths.globalMemory) ?? "";
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
