/**
 * Auto-Adapter Factory — generates a GenericAdapter from any ToolDescriptor.
 * Custom adapters (OpenClaw, Aider) are returned for tools that need special handling.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as jsonc from "jsonc-parser";
import type { McpServerConfig } from "@mycelium/core";
import { type ToolDescriptor, resolvePath } from "@mycelium/core";
import { readFileIfExists, mkdirp } from "./fs-helpers.js";
import { replaceMcpSection } from "./toml-helpers.js";
import {
  type AdapterResult,
  BaseToolAdapter,
  commandExists,
  execCli,
} from "./adapter-base.js";

// ---------------------------------------------------------------------------
// GenericAdapter
// ---------------------------------------------------------------------------

export class GenericAdapter extends BaseToolAdapter {
  toolId: string;
  private desc: ToolDescriptor;

  constructor(desc: ToolDescriptor) {
    super();
    this.toolId = desc.id;
    this.desc = desc;
  }

  async hasCli(): Promise<boolean> {
    if (!this.desc.cli?.mcp) return false;
    return commandExists(this.desc.cli.command);
  }

  async addViaCli(name: string, config: McpServerConfig): Promise<AdapterResult> {
    const cli = this.desc.cli;
    if (!cli?.mcp) return { success: false, method: "cli", error: "No CLI MCP support" };

    try {
      const entry = this.shapeEntry(config);

      if (this.desc.id === "claude-code") {
        // claude mcp add-json <name> <json> --scope user
        // CLI requires type: "stdio" in the JSON entry
        const cliEntry = { type: "stdio", ...entry };
        try { await execCli(cli.command, ["mcp", "remove", name]); } catch { /* ignore */ }
        await execCli(cli.command, [
          ...cli.mcp.add, name, JSON.stringify(cliEntry), "--scope", "user",
        ]);
      } else if (this.desc.id === "codex") {
        // codex mcp add <name> -- <command> <args...>
        const args = [...cli.mcp.add, name, "--", config.command];
        if (config.args?.length) args.push(...config.args);
        await execCli(cli.command, args);
      } else if (this.desc.id === "gemini-cli") {
        // gemini mcp add <name> --command <cmd> [--args ...] [-e K=V] -s user
        const args = [...cli.mcp.add, name, "--command", config.command];
        if (config.args?.length) args.push("--args", ...config.args);
        if (config.env) {
          for (const [k, v] of Object.entries(config.env)) {
            args.push("-e", `${k}=${v}`);
          }
        }
        args.push("-s", "user");
        await execCli(cli.command, args);
      } else {
        // Generic: pass JSON as argument
        await execCli(cli.command, [...cli.mcp.add, name, JSON.stringify(entry)]);
      }
      return { success: true, method: "cli", message: `Added ${name} via ${cli.command} CLI` };
    } catch (err) {
      return { success: false, method: "cli", error: String(err) };
    }
  }

  async removeViaCli(name: string): Promise<AdapterResult> {
    const cli = this.desc.cli;
    if (!cli?.mcp) return { success: false, method: "cli", error: "No CLI MCP support" };

    try {
      const args = [...cli.mcp.remove, name];
      if (this.desc.id === "claude-code") args.push("--scope", "user");
      await execCli(cli.command, args);
      return { success: true, method: "cli" };
    } catch (err) {
      return { success: false, method: "cli", error: String(err) };
    }
  }

  async disableViaCli(name: string): Promise<AdapterResult> {
    const cli = this.desc.cli;
    if (!cli?.mcp?.disable) return { success: false, method: "cli", error: "Disable via CLI not supported" };

    try {
      await execCli(cli.command, [...cli.mcp.disable, name]);
      return { success: true, method: "cli" };
    } catch (err) {
      return { success: false, method: "cli", error: String(err) };
    }
  }

  async enableViaCli(name: string): Promise<AdapterResult> {
    const cli = this.desc.cli;
    if (!cli?.mcp?.enable) return { success: false, method: "cli", error: "Enable via CLI not supported" };

    try {
      await execCli(cli.command, [...cli.mcp.enable, name]);
      return { success: true, method: "cli" };
    } catch (err) {
      return { success: false, method: "cli", error: String(err) };
    }
  }

  async writeToFile(mcps: Record<string, McpServerConfig>): Promise<AdapterResult> {
    const configPath = resolvePath(this.desc.paths.mcp);
    if (!configPath) return { success: false, method: "file", error: "No MCP config path" };

    try {
      const format = this.desc.mcp.format;

      if (format === "toml") {
        return this.writeToml(configPath, mcps);
      }

      // json or jsonc
      const existing = await readFileIfExists(configPath);
      const config: Record<string, unknown> = existing
        ? (format === "jsonc" ? jsonc.parse(existing) : JSON.parse(existing))
        : {};

      const entries: Record<string, unknown> = {};
      for (const [name, mcp] of Object.entries(mcps)) {
        if (mcp.enabled === false) continue;
        entries[name] = this.shapeEntry(mcp);
      }

      this.setNestedKey(config, this.desc.mcp.key, entries);

      await mkdirp(path.dirname(configPath));
      await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
      return { success: true, method: "file", message: `Wrote MCPs to ${configPath}` };
    } catch (err) {
      return { success: false, method: "file", error: String(err) };
    }
  }

  async removeFromFile(name: string): Promise<AdapterResult> {
    const configPath = resolvePath(this.desc.paths.mcp);
    if (!configPath) return { success: false, method: "file", error: "No MCP config path" };

    try {
      const existing = await readFileIfExists(configPath);
      if (!existing) return { success: false, method: "file", error: "Config not found" };

      const format = this.desc.mcp.format;

      if (format === "toml") {
        return this.removeFromToml(configPath, existing, name);
      }

      const config = format === "jsonc" ? jsonc.parse(existing) : JSON.parse(existing);
      const section = this.getNestedKey(config, this.desc.mcp.key);
      if (section?.[name]) {
        delete section[name];
        await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
        return { success: true, method: "file" };
      }
      return { success: false, method: "file", error: `${name} not found` };
    } catch (err) {
      return { success: false, method: "file", error: String(err) };
    }
  }

  async disableInFile(name: string): Promise<AdapterResult> {
    if (this.desc.mcp.entryShape !== "opencode") {
      return { success: false, method: "file", error: "Disable in file not supported — use remove instead" };
    }

    const configPath = resolvePath(this.desc.paths.mcp);
    if (!configPath) return { success: false, method: "file", error: "No MCP config path" };

    try {
      const existing = await readFileIfExists(configPath);
      if (!existing) return { success: false, method: "file", error: "Config not found" };
      const config = JSON.parse(existing);
      const section = this.getNestedKey(config, this.desc.mcp.key);

      if (section?.[name]) {
        section[name].enabled = false;
        await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
        return { success: true, method: "file" };
      }
      return { success: false, method: "file", error: `${name} not found` };
    } catch (err) {
      return { success: false, method: "file", error: String(err) };
    }
  }

  async enableInFile(name: string): Promise<AdapterResult> {
    if (this.desc.mcp.entryShape !== "opencode") {
      return { success: false, method: "file", error: "Enable in file not supported — use add instead" };
    }

    const configPath = resolvePath(this.desc.paths.mcp);
    if (!configPath) return { success: false, method: "file", error: "No MCP config path" };

    try {
      const existing = await readFileIfExists(configPath);
      if (!existing) return { success: false, method: "file", error: "Config not found" };
      const config = JSON.parse(existing);
      const section = this.getNestedKey(config, this.desc.mcp.key);

      if (section?.[name]) {
        section[name].enabled = true;
        await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
        return { success: true, method: "file" };
      }
      return { success: false, method: "file", error: `${name} not found` };
    } catch (err) {
      return { success: false, method: "file", error: String(err) };
    }
  }

  // ---------------------------------------------------------------------------
  // Entry shaping
  // ---------------------------------------------------------------------------

  shapeEntry(mcp: McpServerConfig): Record<string, unknown> {
    const hasArgs = mcp.args && mcp.args.length > 0;
    const hasEnv = mcp.env && Object.keys(mcp.env).length > 0;

    switch (this.desc.mcp.entryShape) {
      case "vscode": {
        const e: Record<string, unknown> = { type: "stdio", command: mcp.command };
        if (hasArgs) e.args = mcp.args;
        if (hasEnv) e.env = mcp.env;
        return e;
      }
      case "opencode": {
        const e: Record<string, unknown> = {
          type: "local",
          command: [mcp.command, ...(mcp.args || [])],
          enabled: true,
        };
        if (hasEnv) e.environment = mcp.env;
        return e;
      }
      case "standard":
      default: {
        const e: Record<string, unknown> = { command: mcp.command };
        if (hasArgs) e.args = mcp.args;
        if (hasEnv) e.env = mcp.env;
        return e;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // TOML helpers
  // ---------------------------------------------------------------------------

  private async writeToml(configPath: string, mcps: Record<string, McpServerConfig>): Promise<AdapterResult> {
    const existing = await readFileIfExists(configPath);

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
  }

  private removeFromToml(configPath: string, existing: string, name: string): Promise<AdapterResult> {
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

    return fs.writeFile(configPath, result.join("\n"), "utf-8").then(
      () => ({ success: true as const, method: "file" as const }),
      (err) => ({ success: false as const, method: "file" as const, error: String(err) }),
    );
  }

  // ---------------------------------------------------------------------------
  // Nested key helpers (for keys like "mcp" or "mcpServers" or "plugins.entries")
  // ---------------------------------------------------------------------------

  private setNestedKey(obj: Record<string, unknown>, key: string, value: unknown): void {
    const parts = key.split(".");
    let current: Record<string, unknown> = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]] || typeof current[parts[i]] !== "object") {
        current[parts[i]] = {};
      }
      current = current[parts[i]] as Record<string, unknown>;
    }
    current[parts[parts.length - 1]] = value;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getNestedKey(obj: Record<string, unknown>, key: string): any {
    const parts = key.split(".");
    let current: unknown = obj;
    for (const part of parts) {
      if (current == null || typeof current !== "object") return undefined;
      current = (current as Record<string, unknown>)[part];
    }
    return current as Record<string, unknown> | undefined;
  }
}

