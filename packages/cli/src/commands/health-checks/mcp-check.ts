/**
 * MCP server connectivity checks for doctor command.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
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
