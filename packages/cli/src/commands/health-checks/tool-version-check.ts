/**
 * Tool installation and version detection checks for doctor command.
 */

import { TOOL_REGISTRY, resolvePath, pathExists } from "@mycelish/core";
import type { DiagnosticResult } from "./types.js";

/**
 * Check which supported tools are installed and report versions
 */
export async function checkToolVersions(): Promise<DiagnosticResult> {
  const installed: string[] = [];
  const missing: string[] = [];

  for (const [toolId, desc] of Object.entries(TOOL_REGISTRY)) {
    const skillsPath = resolvePath(desc.paths.skills);
    const configPath = resolvePath(desc.paths.mcp);
    if ((skillsPath && await pathExists(skillsPath)) || (configPath && await pathExists(configPath))) {
      installed.push(desc.display.name);
    } else {
      missing.push(desc.display.name);
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
