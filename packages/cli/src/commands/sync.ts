/**
 * Sync Command Module
 *
 * Syncs all configurations to all enabled tools:
 * 1. Load and merge configs (global + machine + project)
 * 2. For each enabled tool:
 *    a. Sync skills via symlinks
 *    b. Inject MCP configs
 *    c. Sync memory files
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Command } from "commander";
import {
  type ToolId,
  type MergedConfig,
  type SyncResult,
  type ToolSyncStatus,
  SUPPORTED_TOOLS,
  expandPath,
} from "@mycelium/core";
import { loadAndMergeAllConfigs } from "../core/config-merger.js";
import { syncSkillsToTool } from "../core/symlink-manager.js";
import {
  injectMcpsToTool,
  filterMcpsForTool,
  resolveEnvVarsInMcps,
} from "../core/mcp-injector.js";
import { syncMemoryToTool, getMemoryFilesForTool } from "../core/memory-scoper.js";

// ============================================================================
// Types
// ============================================================================

export interface SyncOptions {
  verbose?: boolean;
  tool?: ToolId;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Load environment variables from a .env file
 */
export async function loadEnvFile(
  envPath: string
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};

  try {
    const content = await fs.readFile(envPath, "utf-8");
    const lines = content.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      // Parse KEY=VALUE format
      const equalsIndex = trimmed.indexOf("=");
      if (equalsIndex === -1) {
        continue;
      }

      const key = trimmed.slice(0, equalsIndex).trim();
      let value = trimmed.slice(equalsIndex + 1).trim();

      // Handle quoted values
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      result[key] = value;
    }
  } catch {
    // File doesn't exist or can't be read - return empty object
  }

  return result;
}

// ============================================================================
// Core Sync Functions
// ============================================================================

/**
 * Sync a single tool
 */
export async function syncTool(
  toolId: ToolId,
  mergedConfig: MergedConfig,
  envVars: Record<string, string> = {}
): Promise<ToolSyncStatus> {
  const toolConfig = SUPPORTED_TOOLS[toolId];
  const toolSkillsDir = expandPath(toolConfig.skillsPath);
  const toolMcpConfigPath = expandPath(toolConfig.mcpConfigPath);

  try {
    // 1. Sync skills via symlinks
    const skills = Object.values(mergedConfig.skills);
    const skillResult = await syncSkillsToTool(skills, toolSkillsDir);
    const skillsCount =
      skillResult.created.length +
      skillResult.updated.length +
      skillResult.unchanged.length;

    // 2. Filter and resolve MCPs for this tool
    const filteredMcps = filterMcpsForTool(mergedConfig.mcps, toolId);
    const resolvedMcps = resolveEnvVarsInMcps(filteredMcps, envVars);
    const mcpsCount = Object.keys(resolvedMcps).length;

    // 3. Inject MCPs into tool config
    await injectMcpsToTool(toolId, resolvedMcps, toolMcpConfigPath);

    // 4. Sync memory files
    const memoryResult = await syncMemoryToTool(toolId);

    if (!memoryResult.success) {
      return {
        tool: toolId,
        status: "error",
        skillsCount,
        mcpsCount,
        memoryFiles: [],
        error: memoryResult.error,
      };
    }

    // 5. Get memory files for status reporting
    const memoryFiles = await getMemoryFilesForTool(toolId);

    return {
      tool: toolId,
      status: "synced",
      skillsCount,
      mcpsCount,
      memoryFiles: memoryFiles.map((f) => f.filename),
      lastSync: new Date(),
    };
  } catch (error) {
    return {
      tool: toolId,
      status: "error",
      skillsCount: 0,
      mcpsCount: 0,
      memoryFiles: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Sync all enabled tools
 */
export async function syncAll(
  projectRoot: string,
  enabledTools: Record<ToolId, { enabled: boolean }>,
  envVars: Record<string, string> = {}
): Promise<SyncResult> {
  const result: SyncResult = {
    success: true,
    tools: [],
    errors: [],
    warnings: [],
  };

  // Load and merge all configs
  const mergedConfig = await loadAndMergeAllConfigs(projectRoot);

  // Sync each enabled tool
  for (const [toolId, config] of Object.entries(enabledTools)) {
    if (!config.enabled) {
      continue;
    }

    const toolStatus = await syncTool(toolId as ToolId, mergedConfig, envVars);
    result.tools.push(toolStatus);

    if (toolStatus.status === "error") {
      result.success = false;
      result.errors.push(`${toolId}: ${toolStatus.error}`);
    }
  }

  return result;
}

// ============================================================================
// Commander.js Command
// ============================================================================

export const syncCommand = new Command("sync")
  .description("Sync configurations to all tools")
  .option("-t, --tool <tool>", "Sync to specific tool only")
  .option("-v, --verbose", "Show detailed output")
  .action(async (options: SyncOptions) => {
    const projectRoot = process.cwd();

    // Load env vars from .env.local
    const globalEnvPath = expandPath("~/.mycelium/.env.local");
    const projectEnvPath = path.join(projectRoot, ".mycelium", ".env.local");

    const globalEnvVars = await loadEnvFile(globalEnvPath);
    const projectEnvVars = await loadEnvFile(projectEnvPath);
    const envVars = { ...globalEnvVars, ...projectEnvVars };

    // Get enabled tools from manifest (default all enabled)
    const enabledTools: Record<ToolId, { enabled: boolean }> = {
      "claude-code": { enabled: true },
      codex: { enabled: true },
      "gemini-cli": { enabled: true },
      opencode: { enabled: true },
      openclaw: { enabled: true },
      aider: { enabled: true },
    };

    if (options.tool) {
      // Sync only the specified tool
      const toolId = options.tool as ToolId;
      if (!SUPPORTED_TOOLS[toolId]) {
        console.error(`Unknown tool: ${toolId}`);
        process.exit(1);
      }

      // Disable all tools except the specified one
      for (const id of Object.keys(enabledTools)) {
        enabledTools[id as ToolId].enabled = id === toolId;
      }
    }

    const result = await syncAll(projectRoot, enabledTools, envVars);

    if (options.verbose) {
      console.log("Sync result:", JSON.stringify(result, null, 2));
    } else {
      for (const toolStatus of result.tools) {
        const statusIcon = toolStatus.status === "synced" ? "\u2713" : "\u2717";
        console.log(
          `${statusIcon} ${toolStatus.tool}: ${toolStatus.skillsCount} skills, ${toolStatus.mcpsCount} MCPs`
        );
      }
    }

    if (!result.success) {
      console.error("\nErrors:");
      for (const error of result.errors) {
        console.error(`  - ${error}`);
      }
      process.exit(1);
    }
  });
