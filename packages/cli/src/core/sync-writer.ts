/**
 * Sync Writer — pushes mycelium config INTO tool config files (reverse of migration).
 * Section-only replace: only touch MCP/skills/hooks sections, preserve everything else.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

import { type ToolId, type McpServerConfig, type ScannedHook, SUPPORTED_TOOLS, expandPath } from "@mycelium/core";
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

  const searchDirs = [
    path.join(os.homedir(), ".claude"),
    path.join(os.homedir(), ".codex"),
    path.join(os.homedir(), ".gemini"),
    path.join(os.homedir(), ".openclaw"),
    path.join(os.homedir(), ".config", "opencode"),
    os.homedir(), // for ~/.claude.json
  ];

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
// Tool-specific writers
// ============================================================================

async function writeClaudeCode(
  mcps: Record<string, McpServerConfig>,
  hooks?: ScannedHook[],
): Promise<SyncWriteResult> {
  const configPath = expandPath("~/.claude.json");
  const sectionsUpdated: string[] = [];

  try {
    // Read existing or start fresh
    const existing = await readFileIfExists(configPath);
    const config: Record<string, unknown> = existing ? JSON.parse(existing) : {};

    // Backup if file exists
    let backupPath = "";
    if (existing) {
      backupPath = await backupConfig(configPath);
    }

    // Replace only mcpServers
    const cleanMcps: Record<string, unknown> = {};
    for (const [name, mcp] of Object.entries(mcps)) {
      const entry: Record<string, unknown> = { command: mcp.command };
      if (mcp.args?.length) entry.args = mcp.args;
      if (mcp.env && Object.keys(mcp.env).length > 0) entry.env = mcp.env;
      cleanMcps[name] = entry;
    }
    config.mcpServers = cleanMcps;
    sectionsUpdated.push("mcpServers");

    await mkdirp(path.dirname(configPath));
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");

    // Optionally write hooks to settings.json
    if (hooks && hooks.length > 0) {
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
      sectionsUpdated.push("hooks");

      await mkdirp(path.dirname(settingsPath));
      await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), "utf-8");
    }

    return { configPath, backupPath, sectionsUpdated, success: true };
  } catch (err) {
    return { configPath, backupPath: "", sectionsUpdated, success: false, error: String(err) };
  }
}

async function writeCodex(
  mcps: Record<string, McpServerConfig>,
): Promise<SyncWriteResult> {
  const configPath = expandPath("~/.codex/config.toml");
  const sectionsUpdated: string[] = [];

  try {
    const existing = await readFileIfExists(configPath);
    let backupPath = "";
    if (existing) {
      backupPath = await backupConfig(configPath);
    }

    // Preserve non-MCP lines
    const preservedLines: string[] = [];
    if (existing) {
      const lines = existing.split("\n");
      let inMcpServers = false;
      for (const line of lines) {
        if (line.startsWith("[mcp.servers.")) {
          inMcpServers = true;
          continue;
        }
        if (line.startsWith("[") && inMcpServers) {
          if (!line.startsWith("[mcp.servers")) {
            inMcpServers = false;
            preservedLines.push(line);
          }
          continue;
        }
        if (!inMcpServers) {
          preservedLines.push(line);
        }
      }
    }

    // Generate TOML for MCP servers
    const mcpLines: string[] = [];
    for (const [name, mcp] of Object.entries(mcps)) {
      mcpLines.push(`[mcp.servers."${name}"]`);
      mcpLines.push(`command = "${mcp.command}"`);
      if (mcp.args?.length) {
        mcpLines.push(`args = [${mcp.args.map((a) => `"${a}"`).join(", ")}]`);
      }
      if (mcp.env && Object.keys(mcp.env).length > 0) {
        mcpLines.push(`[mcp.servers."${name}".env]`);
        for (const [k, v] of Object.entries(mcp.env)) {
          mcpLines.push(`${k} = "${v}"`);
        }
      }
      mcpLines.push("");
    }

    const preserved = preservedLines.join("\n").trim();
    const mcpSection = mcpLines.join("\n");
    const content = preserved ? `${preserved}\n\n${mcpSection}` : mcpSection;
    sectionsUpdated.push("mcp.servers");

    await mkdirp(path.dirname(configPath));
    await fs.writeFile(configPath, content, "utf-8");

    return { configPath, backupPath, sectionsUpdated, success: true };
  } catch (err) {
    return { configPath, backupPath: "", sectionsUpdated, success: false, error: String(err) };
  }
}

async function writeGemini(
  memory: string,
): Promise<SyncWriteResult> {
  const configPath = expandPath("~/.gemini/GEMINI.md");

  try {
    let backupPath = "";
    const existing = await readFileIfExists(configPath);
    if (existing) {
      backupPath = await backupConfig(configPath);
    }

    await mkdirp(path.dirname(configPath));
    await fs.writeFile(configPath, memory, "utf-8");

    return { configPath, backupPath, sectionsUpdated: ["memory"], success: true };
  } catch (err) {
    return { configPath, backupPath: "", sectionsUpdated: [], success: false, error: String(err) };
  }
}

async function writeOpenClaw(
  mcps: Record<string, McpServerConfig>,
  skills?: Array<{ name: string; path: string; enabled?: boolean }>,
): Promise<SyncWriteResult> {
  const configPath = expandPath("~/.openclaw/openclaw.json");
  const sectionsUpdated: string[] = [];

  try {
    const existing = await readFileIfExists(configPath);
    let backupPath = "";
    const config: Record<string, unknown> = existing ? JSON.parse(existing) : {};

    if (existing) {
      backupPath = await backupConfig(configPath);
    }

    // Replace plugins.entries[] where type=mcp-adapter
    const plugins = (config.plugins as Record<string, unknown>) ?? {};
    const existingEntries = (plugins.entries as Array<Record<string, unknown>>) ?? [];
    const nonMcpEntries = existingEntries.filter((e) => e.type !== "mcp-adapter");

    const mcpEntries = Object.entries(mcps).map(([name, mcp]) => ({
      name,
      type: "mcp-adapter",
      enabled: true,
      config: {
        serverUrl: mcp.command,
        transport: mcp.args?.[0] ?? "stdio",
      },
    }));

    config.plugins = { ...plugins, entries: [...nonMcpEntries, ...mcpEntries] };
    sectionsUpdated.push("plugins");

    if (skills) {
      const skillsObj = (config.skills as Record<string, unknown>) ?? {};
      const skillEntries = skills.map((s) => ({
        name: s.name,
        path: s.path,
        enabled: s.enabled ?? true,
      }));
      config.skills = { ...skillsObj, entries: skillEntries };
      sectionsUpdated.push("skills");
    }

    await mkdirp(path.dirname(configPath));
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");

    return { configPath, backupPath, sectionsUpdated, success: true };
  } catch (err) {
    return { configPath, backupPath: "", sectionsUpdated, success: false, error: String(err) };
  }
}

async function writeOpenCode(
  mcps: Record<string, McpServerConfig>,
): Promise<SyncWriteResult> {
  const configPath = expandPath("~/.config/opencode/opencode.json");
  const sectionsUpdated: string[] = [];

  try {
    const existing = await readFileIfExists(configPath);
    let backupPath = "";
    const config: Record<string, unknown> = existing ? JSON.parse(existing) : {};

    if (existing) {
      backupPath = await backupConfig(configPath);
    }

    const cleanMcps: Record<string, unknown> = {};
    for (const [name, mcp] of Object.entries(mcps)) {
      const entry: Record<string, unknown> = { command: mcp.command };
      if (mcp.args?.length) entry.args = mcp.args;
      if (mcp.env && Object.keys(mcp.env).length > 0) entry.env = mcp.env;
      cleanMcps[name] = entry;
    }
    config.mcpServers = cleanMcps;
    sectionsUpdated.push("mcpServers");

    await mkdirp(path.dirname(configPath));
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");

    return { configPath, backupPath, sectionsUpdated, success: true };
  } catch (err) {
    return { configPath, backupPath: "", sectionsUpdated, success: false, error: String(err) };
  }
}

// ============================================================================
// Public API
// ============================================================================

export async function syncToTool(
  toolId: ToolId,
  mcps: Record<string, McpServerConfig>,
  hooks?: ScannedHook[],
): Promise<SyncWriteResult> {
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
    configPath: expandPath(SUPPORTED_TOOLS[toolId].mcpConfigPath),
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
  toolId: ToolId,
  mcps: Record<string, McpServerConfig>,
): Promise<{ configPath: string; currentContent: string | null; newContent: string }> {
  const paths: Record<string, string> = {
    "claude-code": expandPath("~/.claude.json"),
    codex: expandPath("~/.codex/config.toml"),
    "gemini-cli": expandPath("~/.gemini/settings.json"),
    openclaw: expandPath("~/.openclaw/openclaw.json"),
    opencode: expandPath("~/.config/opencode/opencode.json"),
    aider: expandPath("~/.aider/mcp-servers.json"),
  };

  const configPath = paths[toolId] ?? "";
  const currentContent = await readFileIfExists(configPath);

  // Build what the new content would be
  let newContent: string;
  if (toolId === "codex") {
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
  } else if (toolId === "openclaw") {
    const config: Record<string, unknown> = currentContent ? JSON.parse(currentContent) : {};
    const plugins = (config.plugins as Record<string, unknown>) ?? {};
    const existingEntries = (plugins.entries as Array<Record<string, unknown>>) ?? [];
    const nonMcpEntries = existingEntries.filter((e) => e.type !== "mcp-adapter");
    const mcpEntries = Object.entries(mcps).map(([name, mcp]) => ({
      name,
      type: "mcp-adapter",
      enabled: true,
      config: { serverUrl: mcp.command, transport: mcp.args?.[0] ?? "stdio" },
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
    config.mcpServers = cleanMcps;
    newContent = JSON.stringify(config, null, 2);
  }

  return { configPath, currentContent, newContent };
}

export { writeClaudeCode, writeCodex, writeGemini, writeOpenClaw, writeOpenCode };
