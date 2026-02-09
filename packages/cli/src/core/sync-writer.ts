/**
 * Sync Writer — pushes mycelium config INTO tool config files (reverse of migration).
 * Section-only replace: only touch MCP/skills/hooks sections, preserve everything else.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";

import type { McpServerConfig, ScannedHook } from "@mycelsh/core";
import { TOOL_REGISTRY, resolvePath, expandPath } from "@mycelsh/core";
import { readFileIfExists, mkdirp } from "./fs-helpers.js";
import { getAdapter } from "./tool-adapter.js";

// ============================================================================
// Types
// ============================================================================

export interface SyncWriteResult {
  configPath: string;
  backupPath: string;
  sectionsUpdated: string[];
  success: boolean;
  error?: string;
}

// ============================================================================
// Backup / Restore
// ============================================================================

export async function backupConfig(configPath: string): Promise<string> {
  const backupPath = `${configPath}.mycelium-backup`;
  await fs.copyFile(configPath, backupPath);
  return backupPath;
}

export async function restoreBackups(): Promise<{ restored: string[]; errors: string[] }> {
  const restored: string[] = [];
  const errors: string[] = [];

  const searchDirs = [...new Set(
    Object.values(TOOL_REGISTRY).flatMap(t =>
      t.paths.backupDirs.map(d => expandPath(d))
    )
  )];

  for (const dir of searchDirs) {
    try {
      const entries = await fs.readdir(dir);
      for (const entry of entries) {
        if (entry.endsWith(".mycelium-backup")) {
          const backupPath = path.join(dir, entry);
          const originalPath = backupPath.replace(/\.mycelium-backup$/, "");
          try {
            await fs.copyFile(backupPath, originalPath);
            await fs.unlink(backupPath);
            restored.push(originalPath);
          } catch (err) {
            errors.push(`Failed to restore ${originalPath}: ${err}`);
          }
        }
      }
    } catch {
      // directory doesn't exist
    }
  }

  return { restored, errors };
}


// ============================================================================
// Public API
// ============================================================================

export async function syncToTool(
  toolId: string,
  mcps: Record<string, McpServerConfig>,
  hooks?: ScannedHook[],
): Promise<SyncWriteResult> {
  const desc = TOOL_REGISTRY[toolId];
  if (!desc) {
    return { configPath: "", backupPath: "", sectionsUpdated: [], success: false, error: `Unsupported tool: ${toolId}` };
  }

  let adapter;
  try {
    adapter = getAdapter(toolId);
  } catch {
    return { configPath: "", backupPath: "", sectionsUpdated: [], success: false, error: `Unsupported tool: ${toolId}` };
  }

  const result = await adapter.syncAll(mcps);

  // Handle hooks separately (Claude Code only)
  if (toolId === "claude-code" && hooks?.length) {
    await writeClaudeCodeHooks(hooks);
  }

  return {
    configPath: resolvePath(desc.paths.mcp) ?? "",
    backupPath: "",
    sectionsUpdated: result.success ? ["mcpServers"] : [],
    success: result.success,
    error: result.error,
  };
}

async function writeClaudeCodeHooks(hooks: ScannedHook[]): Promise<void> {
  const settingsPath = expandPath("~/.claude/settings.json");
  const settingsRaw = await readFileIfExists(settingsPath);
  const settings: Record<string, unknown> = settingsRaw ? JSON.parse(settingsRaw) : {};

  if (settingsRaw) {
    await backupConfig(settingsPath);
  }

  const hooksObj: Record<string, unknown[]> = {};
  for (const hook of hooks) {
    const event = hook.event ?? "PostToolUse";
    if (!hooksObj[event]) hooksObj[event] = [];
    const hookEntry: Record<string, unknown> = {};
    if (hook.matchers?.length) hookEntry.matchers = hook.matchers;
    if (hook.command) hookEntry.command = hook.command;
    if (hook.timeout) hookEntry.timeout = hook.timeout;
    hooksObj[event].push(hookEntry);
  }
  settings.hooks = hooksObj;

  await mkdirp(path.dirname(settingsPath));
  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), "utf-8");
}

export async function dryRunSync(
  toolId: string,
  mcps: Record<string, McpServerConfig>,
): Promise<{ configPath: string; currentContent: string | null; newContent: string }> {
  const desc = TOOL_REGISTRY[toolId];
  const configPath = resolvePath(desc?.paths.mcp) ?? "";
  const currentContent = configPath ? await readFileIfExists(configPath) : null;

  // Build what the new content would be
  let newContent: string;
  if (desc?.mcp.format === "toml") {
    const lines: string[] = [];
    for (const [name, mcp] of Object.entries(mcps)) {
      lines.push(`[mcp.servers."${name}"]`);
      lines.push(`command = "${mcp.command}"`);
      if (mcp.args?.length) {
        lines.push(`args = [${mcp.args.map((a) => `"${a}"`).join(", ")}]`);
      }
      lines.push("");
    }
    newContent = lines.join("\n");
  } else if (desc?.mcp.entryShape === "openclaw") {
    const config: Record<string, unknown> = currentContent ? JSON.parse(currentContent) : {};
    const plugins = (config.plugins as Record<string, unknown>) ?? {};
    const existingEntries = (plugins.entries as Array<Record<string, unknown>>) ?? [];
    const nonMcpEntries = existingEntries.filter((e) => e.type !== "mcp-adapter");
    const mcpEntries = Object.entries(mcps).map(([name, mcp]) => ({
      type: "mcp-adapter",
      name,
      command: mcp.command,
      args: mcp.args || [],
      ...(mcp.env && Object.keys(mcp.env).length > 0 ? { env: mcp.env } : {}),
    }));
    config.plugins = { ...plugins, entries: [...nonMcpEntries, ...mcpEntries] };
    newContent = JSON.stringify(config, null, 2);
  } else {
    // JSON tools
    const config: Record<string, unknown> = currentContent ? JSON.parse(currentContent) : {};
    const cleanMcps: Record<string, unknown> = {};
    for (const [name, mcp] of Object.entries(mcps)) {
      const entry: Record<string, unknown> = { command: mcp.command };
      if (mcp.args?.length) entry.args = mcp.args;
      if (mcp.env && Object.keys(mcp.env).length > 0) entry.env = mcp.env;
      cleanMcps[name] = entry;
    }
    const key = desc?.mcp.key ?? "mcpServers";
    config[key] = cleanMcps;
    newContent = JSON.stringify(config, null, 2);
  }

  return { configPath, currentContent, newContent };
}
