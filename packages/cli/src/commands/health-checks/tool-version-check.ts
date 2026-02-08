/**
 * Tool installation and version detection checks for doctor command.
 */

import { SUPPORTED_TOOLS, expandPath, pathExists } from "@mycelium/core";
import type { DiagnosticResult } from "./types.js";

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
