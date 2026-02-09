/**
 * Status Command for Mycelium CLI
 *
 * Shows sync status of all tools including:
 * - Skills count (symlinked to tool)
 * - MCPs count (injected into tool config)
 * - Memory files count (synced to tool)
 * - Sync status: synced, pending, error, disabled
 */

import { Command } from "commander";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  type ToolId,
  type SyncStatus,
  type ToolSyncStatus,
  TOOL_REGISTRY,
  ALL_TOOL_IDS,
  resolvePath,
  expandPath,
  pathExists,
  formatStatus,
} from "@mycelium/core";

// ============================================================================
// Types
// ============================================================================

export interface ToolPathOptions {
  myceliumPath: string;
  toolSkillsPath: string;
  toolMcpPath: string;
  toolMemoryPath: string;
  isDisabled?: boolean;
}

export interface StatusOutputOptions {
  globalConfigPath?: string;
  projectConfigPath?: string;
  projectConfigExists?: boolean;
}

// Memory scope mapping - derived from registry
const TOOL_MEMORY_SCOPES: Record<string, string[]> = Object.fromEntries(
  Object.values(TOOL_REGISTRY).map(desc => [desc.id, desc.scopes])
);

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Count the number of skills synced to a tool's skills directory
 */
async function countSkills(skillsPath: string): Promise<number> {
  try {
    const entries = await fs.readdir(skillsPath, { withFileTypes: true });
    // Count symlinks (synced skills) and directories
    let count = 0;
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue; // Skip hidden files
      const entryPath = path.join(skillsPath, entry.name);
      try {
        const stats = await fs.lstat(entryPath);
        if (stats.isSymbolicLink() || stats.isDirectory()) {
          count++;
        }
      } catch {
        // Skip entries we can't stat
      }
    }
    return count;
  } catch {
    return 0;
  }
}

/**
 * Count the number of MCPs in a tool's MCP config file
 */
async function countMcps(mcpPath: string): Promise<number> {
  try {
    const content = await fs.readFile(mcpPath, "utf-8");
    const config = JSON.parse(content);
    // Handle different config formats
    const mcps = config.mcpServers || config.mcps || {};
    return Object.keys(mcps).length;
  } catch {
    return 0;
  }
}

/**
 * Get memory files applicable to a tool based on its scopes
 */
async function getMemoryFilesForTool(
  myceliumPath: string,
  toolId: ToolId
): Promise<string[]> {
  const scopes = TOOL_MEMORY_SCOPES[toolId] || [];
  const files: string[] = [];

  for (const scope of scopes) {
    const scopePath = path.join(myceliumPath, "global", "memory", scope);
    try {
      const entries = await fs.readdir(scopePath);
      const mdFiles = entries.filter((f) => f.endsWith(".md"));
      files.push(...mdFiles);
    } catch {
      // Scope directory doesn't exist, skip
    }
  }

  return files;
}

/**
 * Determine sync status based on skill and MCP counts
 */
function determineSyncStatus(
  isDisabled: boolean,
  skillsCount: number,
  mcpsCount: number,
  toolPathExists: boolean
): SyncStatus {
  if (isDisabled) {
    return "disabled";
  }

  if (!toolPathExists && skillsCount === 0 && mcpsCount === 0) {
    return "pending";
  }

  if (skillsCount > 0 || mcpsCount > 0) {
    return "synced";
  }

  return "pending";
}

/**
 * Get status for a specific tool using explicit paths (for testing)
 */
export async function getToolStatusFromPath(
  toolId: ToolId,
  options: ToolPathOptions
): Promise<ToolSyncStatus> {
  const { myceliumPath, toolSkillsPath, toolMcpPath, isDisabled = false } = options;

  // Count skills synced to tool
  const skillsCount = await countSkills(toolSkillsPath);

  // Count MCPs in tool config
  const mcpsCount = await countMcps(toolMcpPath);

  // Get memory files for tool
  const memoryFiles = await getMemoryFilesForTool(myceliumPath, toolId);

  // Check if tool path exists
  const toolPathExists = await pathExists(toolSkillsPath);

  // Determine status
  const status = determineSyncStatus(isDisabled, skillsCount, mcpsCount, toolPathExists);

  return {
    tool: toolId,
    status,
    skillsCount,
    mcpsCount,
    memoryFiles,
  };
}

/**
 * Get status for a specific tool using default paths
 */
export async function getToolStatus(toolId: ToolId): Promise<ToolSyncStatus> {
  const myceliumPath = expandPath("~/.mycelium");
  const desc = TOOL_REGISTRY[toolId];

  // Check if tool is disabled in manifest
  let isDisabled = !desc.enabled;
  try {
    const manifestPath = path.join(myceliumPath, "manifest.json");
    const manifestContent = await fs.readFile(manifestPath, "utf-8");
    const manifest = JSON.parse(manifestContent);
    if (manifest.tools?.[toolId]?.enabled === false) {
      isDisabled = true;
    }
  } catch {
    // Manifest doesn't exist or is invalid
  }

  return getToolStatusFromPath(toolId, {
    myceliumPath,
    toolSkillsPath: resolvePath(desc.paths.skills) ?? "",
    toolMcpPath: resolvePath(desc.paths.mcp) ?? "",
    toolMemoryPath: resolvePath(desc.paths.globalMemory) ?? "",
    isDisabled,
  });
}

/**
 * Get status for all tools using explicit mycelium path (for testing)
 */
export async function getAllStatusFromPath(
  myceliumPath: string
): Promise<ToolSyncStatus[]> {
  const toolIds = ALL_TOOL_IDS;
  const statuses: ToolSyncStatus[] = [];

  // Load manifest to check disabled tools
  let disabledTools: Set<ToolId> = new Set();
  try {
    const manifestPath = path.join(myceliumPath, "manifest.json");
    const manifestContent = await fs.readFile(manifestPath, "utf-8");
    const manifest = JSON.parse(manifestContent);
    for (const [toolId, config] of Object.entries(manifest.tools || {})) {
      if ((config as { enabled: boolean }).enabled === false) {
        disabledTools.add(toolId as ToolId);
      }
    }
  } catch {
    // Manifest doesn't exist or is invalid
  }

  for (const toolId of toolIds) {
    const desc = TOOL_REGISTRY[toolId];
    const isDisabled = !desc.enabled || disabledTools.has(toolId);

    const status = await getToolStatusFromPath(toolId, {
      myceliumPath,
      toolSkillsPath: resolvePath(desc.paths.skills) ?? "",
      toolMcpPath: resolvePath(desc.paths.mcp) ?? "",
      toolMemoryPath: resolvePath(desc.paths.globalMemory) ?? "",
      isDisabled,
    });
    statuses.push(status);
  }

  return statuses;
}

/**
 * Get status for all supported tools
 */
export async function getAllStatus(): Promise<ToolSyncStatus[]> {
  const myceliumPath = expandPath("~/.mycelium");
  return getAllStatusFromPath(myceliumPath);
}

// ============================================================================
// Formatting Functions
// ============================================================================

/**
 * Format status output for terminal display
 */
export function formatStatusOutput(
  statuses: ToolSyncStatus[],
  options: StatusOutputOptions = {}
): string {
  const lines: string[] = [];

  // Header
  lines.push("Mycelium Status");
  lines.push("===============");
  lines.push("");
  lines.push("Tools:");

  // Format each tool status
  for (const status of statuses) {
    const desc2 = TOOL_REGISTRY[status.tool];
    const toolName = desc2.display.name.padEnd(14);
    const statusStr = formatStatus(status.status);

    if (status.status === "disabled") {
      lines.push(`  ${toolName}${statusStr}`);
    } else {
      const skills = `Skills: ${status.skillsCount}`.padEnd(12);
      const mcps = `MCPs: ${status.mcpsCount}`.padEnd(10);
      const memory = `Memory: ${status.memoryFiles.length} files`;
      lines.push(`  ${toolName}${statusStr}    ${skills}${mcps}${memory}`);
    }
  }

  // Config paths
  if (options.globalConfigPath || options.projectConfigPath) {
    lines.push("");
    if (options.globalConfigPath) {
      lines.push(`Global Config: ${options.globalConfigPath}`);
    }
    if (options.projectConfigPath) {
      const suffix = options.projectConfigExists ? "" : " (not found)";
      lines.push(`Project Config: ${options.projectConfigPath}${suffix}`);
    }
  }

  return lines.join("\n");
}

/**
 * Format status output as JSON
 */
export function formatStatusJson(
  statuses: ToolSyncStatus[],
  options: StatusOutputOptions = {}
): string {
  return JSON.stringify(
    {
      tools: statuses,
      config: {
        global: options.globalConfigPath,
        project: options.projectConfigPath,
        projectExists: options.projectConfigExists,
      },
    },
    null,
    2
  );
}

// ============================================================================
// Commander.js Command
// ============================================================================

export const statusCommand = new Command("status")
  .description("Show sync status of all tools")
  .option("-j, --json", "Output as JSON")
  .option("-v, --verbose", "Show detailed status")
  .action(async (options) => {
    try {
      const statuses = await getAllStatus();
      const myceliumPath = expandPath("~/.mycelium");
      const projectPath = ".mycelium/";
      const projectExists = await pathExists(path.join(process.cwd(), projectPath));

      const outputOptions: StatusOutputOptions = {
        globalConfigPath: "~/.mycelium/",
        projectConfigPath: projectPath,
        projectConfigExists: projectExists,
      };

      if (options.json) {
        console.log(formatStatusJson(statuses, outputOptions));
      } else {
        console.log(formatStatusOutput(statuses, outputOptions));
      }
    } catch (error) {
      console.error(
        "Error getting status:",
        error instanceof Error ? error.message : String(error)
      );
      process.exit(1);
    }
  });
