/**
 * MCP server connectivity and self-registration checks for doctor command.
 */

import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import { promisify } from "node:util";
import { TOOL_REGISTRY, resolvePath, pathExists } from "@mycelish/core";
import type { DiagnosticResult } from "./types.js";

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
 * Check if mycelium is self-registered as an MCP in detected tool configs.
 */
export async function checkSelfRegistration(): Promise<DiagnosticResult[]> {
  const results: DiagnosticResult[] = [];

  for (const [toolId, desc] of Object.entries(TOOL_REGISTRY)) {
    const mcpPath = resolvePath(desc.paths.mcp);
    if (!mcpPath) continue;

    if (!(await pathExists(mcpPath))) continue;

    try {
      const raw = await fs.readFile(mcpPath, "utf-8");
      const hasMycelium = raw.includes('"mycelium"') || raw.includes("mycelium:");

      results.push({
        name: `MCP Self-Registration (${toolId})`,
        status: hasMycelium ? "pass" : "warn",
        message: hasMycelium
          ? `Mycelium MCP entry found in ${toolId}`
          : `Mycelium MCP entry missing in ${toolId}`,
        fix: hasMycelium ? undefined : "Run `mycelium init` to register",
      });
    } catch {
      // Can't read config — skip
    }
  }

  return results;
}
