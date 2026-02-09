/**
 * Tool Adapter — re-exports base types and provides custom adapters + factory.
 * Generic adapters are built by auto-adapter.ts from ToolDescriptors.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { McpServerConfig } from "@mycelium/core";
import { TOOL_REGISTRY, expandPath } from "@mycelium/core";
import { readFileIfExists, mkdirp } from "./fs-helpers.js";
import { GenericAdapter } from "./auto-adapter.js";

// Re-export everything from the base module
export {
  type AdapterResult,
  type ToolAdapter,
  BaseToolAdapter,
  commandExists,
  execCli,
} from "./adapter-base.js";

import { BaseToolAdapter, type AdapterResult } from "./adapter-base.js";

// ---------------------------------------------------------------------------
// OpenClaw (custom: array-based plugins.entries)
// ---------------------------------------------------------------------------

export class OpenClawAdapter extends BaseToolAdapter {
  toolId = "openclaw";

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
// Aider (custom: dual-file with mcp-servers.json + .aider.conf.yml)
// ---------------------------------------------------------------------------

export class AiderAdapter extends BaseToolAdapter {
  toolId = "aider";

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

export function getAdapter(toolId: string): import("./adapter-base.js").ToolAdapter {
  const desc = TOOL_REGISTRY[toolId];
  if (!desc) throw new Error(`No adapter for tool: ${toolId}`);
  return createAdapter(desc);
}

export function createAdapter(desc: import("@mycelium/core").ToolDescriptor): import("./adapter-base.js").ToolAdapter {
  if (desc.mcp.entryShape === "openclaw") return new OpenClawAdapter();
  if (desc.id === "aider") return new AiderAdapter();
  return new GenericAdapter(desc);
}
