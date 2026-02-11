/**
 * Tool Detector - Detects which AI coding tools are installed on the system
 */
import { execFileSync } from "child_process";
import { existsSync } from "node:fs";
import { TOOL_REGISTRY, resolvePath } from "@mycelish/core";

export interface ToolInfo {
  id: string;
  name: string;
  command: string;
  configPath: string;
  detectPath: string;
}

export interface DetectedTool extends ToolInfo {
  installed: boolean;
  status: "synced" | "pending" | "error" | "disabled";
}

// Derive tool list from registry
const TOOL_LIST: ToolInfo[] = Object.values(TOOL_REGISTRY).map(desc => ({
  id: desc.id,
  name: desc.display.name,
  command: desc.cli?.command ?? "",
  configPath: resolvePath(desc.paths.mcp) ?? "",
  detectPath: resolvePath(desc.detectPath) ?? "",
}));

/**
 * Check if a command exists on the system
 */
function commandExists(command: string): boolean {
  if (!command) return false;
  try {
    const whichCommand = process.platform === "win32" ? "where" : "which";
    execFileSync(whichCommand, [command], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a tool is installed by CLI binary or detectPath file presence.
 * Priority: CLI command > detectPath > not installed.
 * detectPath is used for tools without a CLI (e.g., OpenCode) and must point
 * to a file the tool itself creates — NOT files mycelium may have created.
 */
function isInstalled(tool: ToolInfo): boolean {
  if (tool.command) return commandExists(tool.command);
  if (tool.detectPath) return existsSync(tool.detectPath);
  return false;
}

/**
 * Check if a specific tool is installed
 */
export async function isToolInstalled(toolId: string): Promise<boolean> {
  const tool = TOOL_LIST.find((t) => t.id === toolId);
  if (!tool) return false;
  return isInstalled(tool);
}

/**
 * Get info about a specific tool
 */
export function getToolInfo(toolId: string): ToolInfo | undefined {
  return TOOL_LIST.find((t) => t.id === toolId);
}

/**
 * Detect all installed AI coding tools
 */
export async function detectInstalledTools(): Promise<DetectedTool[]> {
  return TOOL_LIST.map((tool) => {
    const installed = isInstalled(tool);
    return {
      ...tool,
      installed,
      status: installed ? "synced" : "disabled",
    };
  });
}

/**
 * Get only the tools that are installed
 */
export async function getInstalledTools(): Promise<DetectedTool[]> {
  const all = await detectInstalledTools();
  return all.filter((t) => t.installed);
}

/**
 * Get all supported tool IDs
 */
export function getSupportedToolIds(): string[] {
  return TOOL_LIST.map((t) => t.id);
}
