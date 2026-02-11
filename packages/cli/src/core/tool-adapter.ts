/**
 * Tool Adapter — re-exports base types and provides custom adapters + factory.
 * Generic adapters are built by auto-adapter.ts from ToolDescriptors.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { McpServerConfig } from "@mycelish/core";
import { TOOL_REGISTRY, expandPath } from "@mycelish/core";
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
import type { TraceLogger } from "./tracer.js";

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

      // OpenClaw expects plugins.entries as an object keyed by plugin name
      const plugins = (config.plugins ?? {}) as Record<string, unknown>;
      const existingEntries = (
        plugins.entries && typeof plugins.entries === "object" && !Array.isArray(plugins.entries)
      ) ? { ...(plugins.entries as Record<string, Record<string, unknown>>) } : {};

      // Preserve non-MCP entries, replace MCP entries
      const entries: Record<string, Record<string, unknown>> = {};
      for (const [name, entry] of Object.entries(existingEntries)) {
        if (entry.type !== "mcp-adapter") {
          entries[name] = entry;
        }
      }

      for (const [name, mcp] of Object.entries(mcps)) {
        if (mcp.state && mcp.state !== "enabled") continue;
        const shaped: Record<string, unknown> = {
          type: "mcp-adapter",
          command: mcp.command,
          args: mcp.args || [],
          ...(mcp.env && Object.keys(mcp.env).length > 0 ? { env: mcp.env } : {}),
        };
        const prev = existingEntries[name];
        entries[name] = prev ? { ...prev, ...shaped } : shaped;
      }

      if (!config.plugins) config.plugins = {};
      (config.plugins as Record<string, unknown>).entries = entries;

      await mkdirp(path.dirname(configPath));
      await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
      return { success: true, method: "file" };
    } catch (err) {
      this.log?.error({
        scope: "mcp", op: "write", msg: String(err), tool: "openclaw",
        method: "file", format: "json", entryShape: "openclaw",
        path: expandPath("~/.openclaw/openclaw.json"), error: String(err),
      });
      return { success: false, method: "file", error: String(err) };
    }
  }

  async removeFromFile(name: string): Promise<AdapterResult> {
    try {
      const configPath = expandPath("~/.openclaw/openclaw.json");
      const existing = await readFileIfExists(configPath);
      if (!existing) return { success: false, method: "file", error: "Config not found" };
      const config = JSON.parse(existing);

      const entries = config.plugins?.entries;
      if (entries && typeof entries === "object" && !Array.isArray(entries)) {
        if (name in entries) {
          delete entries[name];
          await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
          return { success: true, method: "file" };
        }
      }
      return { success: false, method: "file", error: `${name} not found` };
    } catch (err) {
      this.log?.error({
        scope: "mcp", op: "remove", msg: String(err), tool: "openclaw",
        item: name, method: "file", format: "json", entryShape: "openclaw",
        path: expandPath("~/.openclaw/openclaw.json"), error: String(err),
      });
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

export function createAdapter(desc: import("@mycelish/core").ToolDescriptor): import("./adapter-base.js").ToolAdapter {
  if (desc.mcp.entryShape === "openclaw") return new OpenClawAdapter();
  return new GenericAdapter(desc);
}
