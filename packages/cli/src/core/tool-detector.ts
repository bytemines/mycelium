/**
 * Tool Detector - Detects which AI coding tools are installed on the system
 */
import { execFileSync } from "child_process";
import * as os from "os";
import * as path from "path";

export interface ToolInfo {
  id: string;
  name: string;
  command: string;
  configPath: string;
}

export interface DetectedTool extends ToolInfo {
  installed: boolean;
  status: "synced" | "pending" | "error" | "disabled";
}

// All supported AI coding tools
const SUPPORTED_TOOLS: ToolInfo[] = [
  {
    id: "claude-code",
    name: "Claude Code",
    command: "claude",
    configPath: path.join(os.homedir(), ".claude"),
  },
  {
    id: "codex",
    name: "Codex CLI",
    command: "codex",
    configPath: path.join(os.homedir(), ".codex"),
  },
  {
    id: "gemini",
    name: "Gemini CLI",
    command: "gemini",
    configPath: path.join(os.homedir(), ".gemini"),
  },
  {
    id: "opencode",
    name: "OpenCode",
    command: "opencode",
    configPath: path.join(os.homedir(), ".config", "opencode"),
  },
  {
    id: "openclaw",
    name: "OpenClaw",
    command: "openclaw",
    configPath: path.join(os.homedir(), ".openclaw"),
  },
  {
    id: "aider",
    name: "Aider",
    command: "aider",
    configPath: path.join(os.homedir(), ".aider"),
  },
];

/**
 * Check if a command exists on the system
 */
function commandExists(command: string): boolean {
  try {
    const whichCommand = process.platform === "win32" ? "where" : "which";
    execFileSync(whichCommand, [command], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a specific tool is installed
 */
export async function isToolInstalled(toolId: string): Promise<boolean> {
  const tool = SUPPORTED_TOOLS.find((t) => t.id === toolId);
  if (!tool) return false;
  return commandExists(tool.command);
}

/**
 * Get info about a specific tool
 */
export function getToolInfo(toolId: string): ToolInfo | undefined {
  return SUPPORTED_TOOLS.find((t) => t.id === toolId);
}

/**
 * Detect all installed AI coding tools
 */
export async function detectInstalledTools(): Promise<DetectedTool[]> {
  return SUPPORTED_TOOLS.map((tool) => {
    const installed = commandExists(tool.command);
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
  return SUPPORTED_TOOLS.map((t) => t.id);
}
