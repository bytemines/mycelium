/**
 * Tool Adapter — CLI-first MCP management with file-edit fallback.
 * Each tool gets an adapter that knows how to add/remove/disable MCPs
 * using the tool's native CLI (if available) or by editing config files.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { type ToolId, type McpServerConfig, SUPPORTED_TOOLS, expandPath } from "@mycelium/core";
import { readFileIfExists, mkdirp } from "./fs-helpers.js";
import { replaceMcpSection } from "./toml-helpers.js";

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AdapterResult {
  success: boolean;
  method: "cli" | "file";
  message?: string;
  error?: string;
}

export interface ToolAdapter {
  toolId: ToolId;
  hasCli(): Promise<boolean>;
  addViaCli(name: string, config: McpServerConfig): Promise<AdapterResult>;
  removeViaCli(name: string): Promise<AdapterResult>;
  disableViaCli(name: string): Promise<AdapterResult>;
  enableViaCli(name: string): Promise<AdapterResult>;
  writeToFile(mcps: Record<string, McpServerConfig>): Promise<AdapterResult>;
  removeFromFile(name: string): Promise<AdapterResult>;
  disableInFile(name: string): Promise<AdapterResult>;
  enableInFile(name: string): Promise<AdapterResult>;
  syncAll(mcps: Record<string, McpServerConfig>): Promise<AdapterResult>;
  add(name: string, config: McpServerConfig): Promise<AdapterResult>;
  remove(name: string): Promise<AdapterResult>;
  disable(name: string): Promise<AdapterResult>;
  enable(name: string): Promise<AdapterResult>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export async function commandExists(cmd: string): Promise<boolean> {
  try {
    await execFileAsync("which", [cmd]);
    return true;
  } catch {
    return false;
  }
}

export async function execCli(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(cmd, args, { timeout: 30000 });
}

// ---------------------------------------------------------------------------
// Base class
// ---------------------------------------------------------------------------

abstract class BaseToolAdapter implements ToolAdapter {
  abstract toolId: ToolId;

  abstract addViaCli(name: string, config: McpServerConfig): Promise<AdapterResult>;
  abstract removeViaCli(name: string): Promise<AdapterResult>;
  abstract writeToFile(mcps: Record<string, McpServerConfig>): Promise<AdapterResult>;
  abstract removeFromFile(name: string): Promise<AdapterResult>;

  async disableViaCli(_name: string): Promise<AdapterResult> {
    return { success: false, method: "cli", error: "Disable via CLI not supported" };
  }
  async enableViaCli(_name: string): Promise<AdapterResult> {
    return { success: false, method: "cli", error: "Enable via CLI not supported" };
  }
  async disableInFile(_name: string): Promise<AdapterResult> {
    return { success: false, method: "file", error: "Disable in file not supported — use remove instead" };
  }
  async enableInFile(_name: string): Promise<AdapterResult> {
    return { success: false, method: "file", error: "Enable in file not supported — use add instead" };
  }

  async hasCli(): Promise<boolean> {
    const toolConfig = SUPPORTED_TOOLS[this.toolId];
    if (!toolConfig.cliCommand) return false;
    return commandExists(toolConfig.cliCommand);
  }

  async syncAll(mcps: Record<string, McpServerConfig>): Promise<AdapterResult> {
    if (await this.hasCli()) {
      const errors: string[] = [];
      for (const [name, config] of Object.entries(mcps)) {
        if (config.enabled === false) continue;
        const result = await this.addViaCli(name, config);
        if (!result.success) errors.push(`${name}: ${result.error}`);
      }
      if (errors.length > 0) {
        return { success: false, method: "cli", error: errors.join("; ") };
      }
      return { success: true, method: "cli", message: `Synced ${Object.keys(mcps).length} MCPs via CLI` };
    }
    return this.writeToFile(mcps);
  }

  async add(name: string, config: McpServerConfig): Promise<AdapterResult> {
    if (await this.hasCli()) return this.addViaCli(name, config);
    return this.writeToFile({ [name]: config });
  }

  async remove(name: string): Promise<AdapterResult> {
    if (await this.hasCli()) return this.removeViaCli(name);
    return this.removeFromFile(name);
  }

  async disable(name: string): Promise<AdapterResult> {
    if (await this.hasCli()) {
      const cliResult = await this.disableViaCli(name);
      if (cliResult.success) return cliResult;
    }
    const fileResult = await this.disableInFile(name);
    if (fileResult.success) return fileResult;
    return this.remove(name);
  }

  async enable(name: string): Promise<AdapterResult> {
    if (await this.hasCli()) {
      const cliResult = await this.enableViaCli(name);
      if (cliResult.success) return cliResult;
    }
    return this.enableInFile(name);
  }
}

// ---------------------------------------------------------------------------
// Claude Code
// ---------------------------------------------------------------------------

export class ClaudeCodeAdapter extends BaseToolAdapter {
  toolId: ToolId = "claude-code";

  async addViaCli(name: string, config: McpServerConfig): Promise<AdapterResult> {
    try {
      const jsonConfig: Record<string, unknown> = {
        type: "stdio",
        command: config.command,
      };
      if (config.args?.length) jsonConfig.args = config.args;
      if (config.env && Object.keys(config.env).length > 0) jsonConfig.env = config.env;

      // Remove existing first to avoid "already exists" error
      try { await execCli("claude", ["mcp", "remove", name]); } catch { /* ignore */ }

      await execCli("claude", [
        "mcp", "add-json", name, JSON.stringify(jsonConfig), "--scope", "user",
      ]);
      return { success: true, method: "cli", message: `Added ${name} via claude CLI` };
    } catch (err) {
      return { success: false, method: "cli", error: String(err) };
    }
  }

  async removeViaCli(name: string): Promise<AdapterResult> {
    try {
      await execCli("claude", ["mcp", "remove", name, "--scope", "user"]);
      return { success: true, method: "cli" };
    } catch (err) {
      return { success: false, method: "cli", error: String(err) };
    }
  }

  async disableInFile(name: string): Promise<AdapterResult> {
    try {
      const configPath = expandPath("~/.claude.json");
      const content = await readFileIfExists(configPath);
      if (!content) return { success: false, method: "file", error: "Config not found" };
      const config = JSON.parse(content);

      if (config.mcpServers?.[name]) {
        delete config.mcpServers[name];
        await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
        return { success: true, method: "file", message: `Removed ${name} from mcpServers` };
      }
      return { success: false, method: "file", error: `${name} not found in mcpServers` };
    } catch (err) {
      return { success: false, method: "file", error: String(err) };
    }
  }

  async writeToFile(mcps: Record<string, McpServerConfig>): Promise<AdapterResult> {
    try {
      const configPath = expandPath("~/.claude.json");
      const existing = await readFileIfExists(configPath);
      const config: Record<string, unknown> = existing ? JSON.parse(existing) : {};

      const cleanMcps: Record<string, unknown> = {};
      for (const [name, mcp] of Object.entries(mcps)) {
        if (mcp.enabled === false) continue;
        const entry: Record<string, unknown> = { command: mcp.command };
        if (mcp.args?.length) entry.args = mcp.args;
        if (mcp.env && Object.keys(mcp.env).length > 0) entry.env = mcp.env;
        cleanMcps[name] = entry;
      }
      config.mcpServers = cleanMcps;

      await mkdirp(path.dirname(configPath));
      await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
      return { success: true, method: "file", message: "Wrote mcpServers to ~/.claude.json" };
    } catch (err) {
      return { success: false, method: "file", error: String(err) };
    }
  }

  async removeFromFile(name: string): Promise<AdapterResult> {
    return this.disableInFile(name);
  }
}

// ---------------------------------------------------------------------------
// Codex
// ---------------------------------------------------------------------------

export class CodexAdapter extends BaseToolAdapter {
  toolId: ToolId = "codex";

  async addViaCli(name: string, config: McpServerConfig): Promise<AdapterResult> {
    try {
      const args = ["mcp", "add", name, "--"];
      args.push(config.command);
      if (config.args?.length) args.push(...config.args);
      await execCli("codex", args);
      return { success: true, method: "cli" };
    } catch (err) {
      return { success: false, method: "cli", error: String(err) };
    }
  }

  async removeViaCli(name: string): Promise<AdapterResult> {
    try {
      await execCli("codex", ["mcp", "remove", name]);
      return { success: true, method: "cli" };
    } catch (err) {
      return { success: false, method: "cli", error: String(err) };
    }
  }

  async writeToFile(mcps: Record<string, McpServerConfig>): Promise<AdapterResult> {
    try {
      const configPath = expandPath("~/.codex/config.toml");
      const existing = await readFileIfExists(configPath);

      // Build MCP TOML sections
      const mcpLines: string[] = [];
      for (const [name, mcp] of Object.entries(mcps)) {
        if (mcp.enabled === false) continue;
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

      const mcpSection = mcpLines.join("\n");
      const content = existing ? replaceMcpSection(existing, mcpSection) : mcpSection;

      await mkdirp(path.dirname(configPath));
      await fs.writeFile(configPath, content, "utf-8");
      return { success: true, method: "file" };
    } catch (err) {
      return { success: false, method: "file", error: String(err) };
    }
  }

  async removeFromFile(name: string): Promise<AdapterResult> {
    try {
      const configPath = expandPath("~/.codex/config.toml");
      const existing = await readFileIfExists(configPath);
      if (!existing) return { success: false, method: "file", error: "Config not found" };

      const lines = existing.split("\n");
      const result: string[] = [];
      let inTarget = false;
      for (const line of lines) {
        if (line === `[mcp.servers."${name}"]`) {
          inTarget = true;
          continue;
        }
        if (inTarget && /^\[/.test(line)) {
          inTarget = false;
        }
        if (!inTarget) result.push(line);
      }

      await fs.writeFile(configPath, result.join("\n"), "utf-8");
      return { success: true, method: "file" };
    } catch (err) {
      return { success: false, method: "file", error: String(err) };
    }
  }
}

// ---------------------------------------------------------------------------
// Gemini CLI
// ---------------------------------------------------------------------------

export class GeminiAdapter extends BaseToolAdapter {
  toolId: ToolId = "gemini-cli";

  async addViaCli(name: string, config: McpServerConfig): Promise<AdapterResult> {
    try {
      const args = ["mcp", "add", name, "--command", config.command];
      if (config.args?.length) {
        args.push("--args", ...config.args);
      }
      if (config.env) {
        for (const [k, v] of Object.entries(config.env)) {
          args.push("-e", `${k}=${v}`);
        }
      }
      args.push("-s", "user");
      await execCli("gemini", args);
      return { success: true, method: "cli" };
    } catch (err) {
      return { success: false, method: "cli", error: String(err) };
    }
  }

  async removeViaCli(name: string): Promise<AdapterResult> {
    try {
      await execCli("gemini", ["mcp", "remove", name]);
      return { success: true, method: "cli" };
    } catch (err) {
      return { success: false, method: "cli", error: String(err) };
    }
  }

  async disableViaCli(name: string): Promise<AdapterResult> {
    try {
      await execCli("gemini", ["mcp", "disable", name]);
      return { success: true, method: "cli" };
    } catch (err) {
      return { success: false, method: "cli", error: String(err) };
    }
  }

  async enableViaCli(name: string): Promise<AdapterResult> {
    try {
      await execCli("gemini", ["mcp", "enable", name]);
      return { success: true, method: "cli" };
    } catch (err) {
      return { success: false, method: "cli", error: String(err) };
    }
  }

  async writeToFile(mcps: Record<string, McpServerConfig>): Promise<AdapterResult> {
    try {
      const configPath = expandPath("~/.gemini/settings.json");
      const existing = await readFileIfExists(configPath);
      const config: Record<string, unknown> = existing ? JSON.parse(existing) : {};

      const cleanMcps: Record<string, unknown> = {};
      for (const [name, mcp] of Object.entries(mcps)) {
        if (mcp.enabled === false) continue;
        const entry: Record<string, unknown> = { command: mcp.command };
        if (mcp.args?.length) entry.args = mcp.args;
        if (mcp.env && Object.keys(mcp.env).length > 0) entry.env = mcp.env;
        cleanMcps[name] = entry;
      }
      config.mcpServers = cleanMcps;

      await mkdirp(path.dirname(configPath));
      await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
      return { success: true, method: "file" };
    } catch (err) {
      return { success: false, method: "file", error: String(err) };
    }
  }

  async removeFromFile(name: string): Promise<AdapterResult> {
    try {
      const configPath = expandPath("~/.gemini/settings.json");
      const existing = await readFileIfExists(configPath);
      if (!existing) return { success: false, method: "file", error: "Config not found" };
      const config = JSON.parse(existing);

      if (config.mcpServers?.[name]) {
        delete config.mcpServers[name];
        await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
        return { success: true, method: "file" };
      }
      return { success: false, method: "file", error: `${name} not found` };
    } catch (err) {
      return { success: false, method: "file", error: String(err) };
    }
  }
}

// ---------------------------------------------------------------------------
// OpenCode
// ---------------------------------------------------------------------------

export class OpenCodeAdapter extends BaseToolAdapter {
  toolId: ToolId = "opencode";

  async hasCli(): Promise<boolean> {
    return false; // interactive-only CLI
  }

  async addViaCli(): Promise<AdapterResult> {
    return { success: false, method: "cli", error: "OpenCode MCP CLI is interactive-only" };
  }

  async removeViaCli(): Promise<AdapterResult> {
    return { success: false, method: "cli", error: "OpenCode MCP CLI is interactive-only" };
  }

  async writeToFile(mcps: Record<string, McpServerConfig>): Promise<AdapterResult> {
    try {
      const configPath = expandPath("~/.config/opencode/opencode.json");
      const existing = await readFileIfExists(configPath);
      const config: Record<string, unknown> = existing ? JSON.parse(existing) : {};

      const mcpSection: Record<string, unknown> = {};
      for (const [name, mcp] of Object.entries(mcps)) {
        if (mcp.enabled === false) continue;
        mcpSection[name] = {
          type: "local",
          command: [mcp.command, ...(mcp.args || [])],
          ...(mcp.env && Object.keys(mcp.env).length > 0 ? { environment: mcp.env } : {}),
          enabled: true,
        };
      }
      config.mcp = mcpSection;

      await mkdirp(path.dirname(configPath));
      await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
      return { success: true, method: "file" };
    } catch (err) {
      return { success: false, method: "file", error: String(err) };
    }
  }

  async disableInFile(name: string): Promise<AdapterResult> {
    try {
      const configPath = expandPath("~/.config/opencode/opencode.json");
      const existing = await readFileIfExists(configPath);
      if (!existing) return { success: false, method: "file", error: "Config not found" };
      const config = JSON.parse(existing);

      if (config.mcp?.[name]) {
        config.mcp[name].enabled = false;
        await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
        return { success: true, method: "file" };
      }
      return { success: false, method: "file", error: `${name} not found` };
    } catch (err) {
      return { success: false, method: "file", error: String(err) };
    }
  }

  async enableInFile(name: string): Promise<AdapterResult> {
    try {
      const configPath = expandPath("~/.config/opencode/opencode.json");
      const existing = await readFileIfExists(configPath);
      if (!existing) return { success: false, method: "file", error: "Config not found" };
      const config = JSON.parse(existing);

      if (config.mcp?.[name]) {
        config.mcp[name].enabled = true;
        await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
        return { success: true, method: "file" };
      }
      return { success: false, method: "file", error: `${name} not found` };
    } catch (err) {
      return { success: false, method: "file", error: String(err) };
    }
  }

  async removeFromFile(name: string): Promise<AdapterResult> {
    try {
      const configPath = expandPath("~/.config/opencode/opencode.json");
      const existing = await readFileIfExists(configPath);
      if (!existing) return { success: false, method: "file", error: "Config not found" };
      const config = JSON.parse(existing);

      if (config.mcp?.[name]) {
        delete config.mcp[name];
        await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
        return { success: true, method: "file" };
      }
      return { success: false, method: "file", error: `${name} not found` };
    } catch (err) {
      return { success: false, method: "file", error: String(err) };
    }
  }
}

// ---------------------------------------------------------------------------
// OpenClaw
// ---------------------------------------------------------------------------

export class OpenClawAdapter extends BaseToolAdapter {
  toolId: ToolId = "openclaw";

  async hasCli(): Promise<boolean> {
    return false;
  }

  async addViaCli(): Promise<AdapterResult> {
    return { success: false, method: "cli", error: "OpenClaw has no MCP CLI" };
  }

  async removeViaCli(): Promise<AdapterResult> {
    return { success: false, method: "cli", error: "OpenClaw has no MCP CLI" };
  }

  async writeToFile(mcps: Record<string, McpServerConfig>): Promise<AdapterResult> {
    try {
      const configPath = expandPath("~/.openclaw/openclaw.json");
      const existing = await readFileIfExists(configPath);
      const config: Record<string, unknown> = existing ? JSON.parse(existing) : {};

      const entries: unknown[] = [];
      // Preserve non-MCP entries
      if (Array.isArray((config as { plugins?: { entries?: unknown[] } }).plugins?.entries)) {
        for (const entry of (config as { plugins: { entries: Array<{ type?: string }> } }).plugins.entries) {
          if (entry.type !== "mcp-adapter") entries.push(entry);
        }
      }

      for (const [name, mcp] of Object.entries(mcps)) {
        if (mcp.enabled === false) continue;
        entries.push({
          type: "mcp-adapter",
          name,
          command: mcp.command,
          args: mcp.args || [],
          ...(mcp.env && Object.keys(mcp.env).length > 0 ? { env: mcp.env } : {}),
        });
      }

      if (!config.plugins) config.plugins = {};
      (config.plugins as Record<string, unknown>).entries = entries;

      await mkdirp(path.dirname(configPath));
      await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
      return { success: true, method: "file" };
    } catch (err) {
      return { success: false, method: "file", error: String(err) };
    }
  }

  async removeFromFile(name: string): Promise<AdapterResult> {
    try {
      const configPath = expandPath("~/.openclaw/openclaw.json");
      const existing = await readFileIfExists(configPath);
      if (!existing) return { success: false, method: "file", error: "Config not found" };
      const config = JSON.parse(existing);

      if (Array.isArray(config.plugins?.entries)) {
        config.plugins.entries = config.plugins.entries.filter(
          (e: { type?: string; name?: string }) => !(e.type === "mcp-adapter" && e.name === name),
        );
        await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
        return { success: true, method: "file" };
      }
      return { success: false, method: "file", error: `${name} not found` };
    } catch (err) {
      return { success: false, method: "file", error: String(err) };
    }
  }
}

// ---------------------------------------------------------------------------
// Aider
// ---------------------------------------------------------------------------

export class AiderAdapter extends BaseToolAdapter {
  toolId: ToolId = "aider";

  async hasCli(): Promise<boolean> {
    return false; // MCP CLI not yet available
  }

  async addViaCli(): Promise<AdapterResult> {
    return { success: false, method: "cli", error: "Aider MCP CLI not yet available" };
  }

  async removeViaCli(): Promise<AdapterResult> {
    return { success: false, method: "cli", error: "Aider MCP CLI not yet available" };
  }

  async writeToFile(mcps: Record<string, McpServerConfig>): Promise<AdapterResult> {
    try {
      const mcpFilePath = expandPath("~/.aider/mcp-servers.json");
      const confPath = expandPath("~/.aider.conf.yml");

      const mcpJson: Record<string, unknown> = { mcpServers: {} };
      for (const [name, mcp] of Object.entries(mcps)) {
        if (mcp.enabled === false) continue;
        const entry: Record<string, unknown> = {
          type: "stdio",
          command: mcp.command,
        };
        if (mcp.args?.length) entry.args = mcp.args;
        if (mcp.env && Object.keys(mcp.env).length > 0) entry.env = mcp.env;
        (mcpJson.mcpServers as Record<string, unknown>)[name] = entry;
      }

      await mkdirp(path.dirname(mcpFilePath));
      await fs.writeFile(mcpFilePath, JSON.stringify(mcpJson, null, 2), "utf-8");

      // Ensure .aider.conf.yml has mcp-servers-file reference
      const existingConf = await readFileIfExists(confPath);
      if (existingConf && !existingConf.includes("mcp-servers-file")) {
        await fs.appendFile(confPath, `\nmcp-servers-file: ${mcpFilePath}\n`);
      } else if (!existingConf) {
        await fs.writeFile(confPath, `mcp-servers-file: ${mcpFilePath}\n`);
      }

      return { success: true, method: "file" };
    } catch (err) {
      return { success: false, method: "file", error: String(err) };
    }
  }

  async removeFromFile(name: string): Promise<AdapterResult> {
    try {
      const mcpFilePath = expandPath("~/.aider/mcp-servers.json");
      const existing = await readFileIfExists(mcpFilePath);
      if (!existing) return { success: false, method: "file", error: "Config not found" };
      const config = JSON.parse(existing);

      if (config.mcpServers?.[name]) {
        delete config.mcpServers[name];
        await fs.writeFile(mcpFilePath, JSON.stringify(config, null, 2), "utf-8");
        return { success: true, method: "file" };
      }
      return { success: false, method: "file", error: `${name} not found` };
    } catch (err) {
      return { success: false, method: "file", error: String(err) };
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

const adapters: Record<ToolId, ToolAdapter> = {
  "claude-code": new ClaudeCodeAdapter(),
  codex: new CodexAdapter(),
  "gemini-cli": new GeminiAdapter(),
  opencode: new OpenCodeAdapter(),
  openclaw: new OpenClawAdapter(),
  aider: new AiderAdapter(),
};

export function getAdapter(toolId: ToolId): ToolAdapter {
  const adapter = adapters[toolId];
  if (!adapter) throw new Error(`No adapter for tool: ${toolId}`);
  return adapter;
}
