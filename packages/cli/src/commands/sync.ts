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
  ALL_TOOL_IDS,
  TOOL_REGISTRY,
  resolvePath,
  expandPath,
} from "@mycelium/core";
import {
  loadAndMergeAllConfigs,
  loadGlobalConfig,
  loadProjectConfig,
} from "../core/config-merger.js";
import { detectConflicts, type PartialConfig } from "../core/conflict-detector.js";
import { syncSkillsToTool } from "../core/symlink-manager.js";
import {
  filterMcpsForTool,
  resolveEnvVarsInMcps,
} from "../core/mcp-injector.js";
import { syncMemoryToTool, getMemoryFilesForTool } from "../core/memory-scoper.js";
import { startWatcher } from "../core/watcher.js";
import { restoreBackups, dryRunSync } from "../core/sync-writer.js";
import {
  loadMachineOverrides,
  applyMachineOverrides,
  rescanOverrides,
} from "../core/machine-overrides.js";

// ============================================================================
// Types
// ============================================================================

export interface SyncOptions {
  verbose?: boolean;
  tool?: ToolId;
  watch?: boolean;
  dryRun?: boolean;
  restore?: boolean;
  rescan?: boolean;
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
  const desc = TOOL_REGISTRY[toolId];
  const toolSkillsDir = resolvePath(desc.paths.skills) ?? "";

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

    // 3. Sync MCPs via tool adapter (CLI-first, file fallback)
    const { getAdapter } = await import("../core/tool-adapter.js");
    const adapter = getAdapter(toolId);
    await adapter.syncAll(resolvedMcps);

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
  envVars: Record<string, string> = {},
  options: { rescan?: boolean } = {}
): Promise<SyncResult> {
  const result: SyncResult = {
    success: true,
    tools: [],
    errors: [],
    warnings: [],
  };

  // Load and merge all configs
  const mergedConfig = await loadAndMergeAllConfigs(projectRoot);

  // Apply machine-level overrides to MCP commands
  if (options.rescan) {
    const overrides = await rescanOverrides(mergedConfig.mcps);
    const overrideCount = Object.keys(overrides.mcps).length;
    if (overrideCount > 0) {
      result.warnings.push(`Rescanned: ${overrideCount} MCP command override(s) detected`);
    }
    mergedConfig.mcps = applyMachineOverrides(mergedConfig.mcps, overrides);
  } else {
    const overrides = await loadMachineOverrides();
    mergedConfig.mcps = applyMachineOverrides(mergedConfig.mcps, overrides);
  }

  // Detect conflicts between config levels
  const globalConfig = await loadGlobalConfig();
  const projectConfig = await loadProjectConfig(projectRoot);
  const conflicts = detectConflicts(
    globalConfig as PartialConfig,
    projectConfig as PartialConfig
  );
  for (const conflict of conflicts) {
    result.warnings.push(conflict.message);
  }

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
  .option("-w, --watch", "Watch for config changes and auto-sync")
  .option("--dry-run", "Show what would change without writing")
  .option("--restore", "Restore tool configs from backups")
  .option("--rescan", "Force re-detect machine overrides")
  .action(async (options: SyncOptions) => {
    const projectRoot = process.cwd();

    // Load env vars from .env.local
    const globalEnvPath = expandPath("~/.mycelium/.env.local");
    const projectEnvPath = path.join(projectRoot, ".mycelium", ".env.local");

    const globalEnvVars = await loadEnvFile(globalEnvPath);
    const projectEnvVars = await loadEnvFile(projectEnvPath);
    const envVars = { ...globalEnvVars, ...projectEnvVars };

    // Get enabled tools from manifest (default all enabled)
    const enabledTools: Record<string, { enabled: boolean }> = Object.fromEntries(
      ALL_TOOL_IDS.map(id => [id, { enabled: true }])
    );

    if (options.tool) {
      // Sync only the specified tool
      const toolId = options.tool as ToolId;
      if (!TOOL_REGISTRY[toolId]) {
        console.error(`Unknown tool: ${toolId}`);
        process.exit(1);
      }

      // Disable all tools except the specified one
      for (const id of Object.keys(enabledTools)) {
        enabledTools[id as ToolId].enabled = id === toolId;
      }
    }

    // Handle --restore
    if (options.restore) {
      const restoreResult = await restoreBackups();
      if (restoreResult.restored.length > 0) {
        console.log("Restored:");
        for (const r of restoreResult.restored) {
          console.log(`  - ${r}`);
        }
      } else {
        console.log("No backups found to restore.");
      }
      if (restoreResult.errors.length > 0) {
        console.error("Errors:");
        for (const e of restoreResult.errors) {
          console.error(`  - ${e}`);
        }
      }
      return;
    }

    // Handle --dry-run
    if (options.dryRun) {
      const mergedConfig = await loadAndMergeAllConfigs(projectRoot);
      for (const [toolId, config] of Object.entries(enabledTools)) {
        if (!config.enabled) continue;
        const diff = await dryRunSync(toolId as ToolId, mergedConfig.mcps);
        console.log(`${toolId} (${diff.configPath}):`);
        if (diff.currentContent === diff.newContent) {
          console.log("  No changes");
        } else if (!diff.currentContent) {
          console.log("  Would create new config");
        } else {
          console.log("  Would update config");
        }
        if (options.verbose) {
          console.log("  New content preview:");
          console.log("  " + diff.newContent.split("\n").join("\n  "));
        }
      }
      return;
    }

    const result = await syncAll(projectRoot, enabledTools, envVars, {
      rescan: options.rescan,
    });

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

    if (result.warnings.length > 0) {
      console.warn("\nWarnings:");
      for (const warning of result.warnings) {
        console.warn(`  - ${warning}`);
      }
    }

    if (!result.success) {
      console.error("\nErrors:");
      for (const error of result.errors) {
        console.error(`  - ${error}`);
      }
      if (!options.watch) {
        process.exit(1);
      }
    }

    if (options.watch) {
      console.log("\nWatching for config changes... (Ctrl+C to stop)");
      const stop = startWatcher(projectRoot, async () => {
        console.log("\nConfig change detected, re-syncing...");
        const watchResult = await syncAll(projectRoot, enabledTools, envVars);
        for (const toolStatus of watchResult.tools) {
          const statusIcon = toolStatus.status === "synced" ? "\u2713" : "\u2717";
          console.log(
            `${statusIcon} ${toolStatus.tool}: ${toolStatus.skillsCount} skills, ${toolStatus.mcpsCount} MCPs`
          );
        }
      });

      process.on("SIGINT", () => {
        stop();
        process.exit(0);
      });

      // Keep process alive
      await new Promise(() => {});
    }
  });
