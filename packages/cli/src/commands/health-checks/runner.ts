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

  // 3. Check each tool's paths and configs
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

  // 4. Check for orphaned configs
  if (globalExists) {
    checks.push(await checkOrphanedConfigs());
  }

  // 5. Check tool versions
  checks.push(await checkToolVersions());

  // 6. Check taken-over plugins
  try {
    const { checkTakenOverPlugins } = await import("./plugin-takeover-check.js");
    const pluginChecks = await checkTakenOverPlugins();
    checks.push(...pluginChecks);
  } catch {
    // plugin takeover check is optional
  }

  // 7. Check for item updates
  try {
    const { checkForUpdates } = await import("../../core/marketplace.js");
    const updates = await checkForUpdates();
    if (updates.length > 0) {
      checks.push({
        name: "Item Updates",
        status: "warn",
        message: `${updates.length} item(s) have updates available: ${updates.map(u => u.name).join(", ")}`,
      });
    } else {
      checks.push({
        name: "Item Updates",
        status: "pass",
        message: "All installed items are up to date",
      });
    }
  } catch {
    // update check is optional — network may be unavailable
  }

  // 8. Check MCP self-registration
  try {
    const { checkSelfRegistration } = await import("./mcp-check.js");
    const selfRegChecks = await checkSelfRegistration();
    checks.push(...selfRegChecks);
  } catch {
    // self-registration check is optional
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
