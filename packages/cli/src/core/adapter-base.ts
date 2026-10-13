/**
 * Adapter Base — shared types, helpers, and abstract base class for tool adapters.
 * Extracted to avoid circular dependencies between tool-adapter.ts and auto-adapter.ts.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { McpServerConfig } from "@mycelish/core";
import type { TraceLogger } from "./tracer.js";

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
  toolId: string;
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
  const secrets: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (["-e", "--env"].includes(args[i])) {
      const pair = args[++i] ?? "";
      if (pair.includes("=")) secrets.push(pair.slice(pair.indexOf("=") + 1));
    } else if (["--api-key", "--token", "--client-secret", "--oauth-client-secret"].includes(args[i])) {
      secrets.push(args[++i] ?? "");
    } else if (args[i].startsWith("{")) {
      try {
        const entry = JSON.parse(args[i]);
        secrets.push(...Object.values(entry.env ?? entry.environment ?? {}).filter((v): v is string => typeof v === "string"));
      } catch { /* Not a JSON MCP entry. */ }
    }
  }
  const redact = (text: string): string => {
    for (const secret of secrets.filter(Boolean).sort((a, b) => b.length - a.length)) {
      // JSON arguments escape quotes/backslashes; stderr may echo the literal value.
      for (const value of new Set([secret, JSON.stringify(secret).slice(1, -1)])) {
        text = text.split(value).join("[REDACTED]");
      }
    }
    return text;
  };
  try {
    const result = await execFileAsync(cmd, args, { timeout: 30000 });
    return { stdout: redact(result.stdout), stderr: redact(result.stderr) };
  } catch (err) {
    const failure = err as Error & { code?: string | number; stdout?: string; stderr?: string; signal?: string; killed?: boolean };
    throw Object.assign(new Error(redact(String(err))), {
      code: failure.code, signal: failure.signal, killed: failure.killed,
      stdout: redact(failure.stdout ?? ""), stderr: redact(failure.stderr ?? ""),
    });
  }
}

export function isAbsentCliRemoval(toolId: string, name: string, err: unknown): boolean {
  // Verified in https://unpkg.com/@anthropic-ai/claude-code@2.1.15/cli.js (DS6 + remove handler).
  // shortcut: only this verified response; add other versions/tools after checking their fixtures.
  if (toolId !== "claude-code" || !(err instanceof Error)) return false;
  const failure = err as Error & { code?: number; stderr?: string; stdout?: string; signal?: string; killed?: boolean };
  return failure.code === 1 && !failure.signal && !failure.killed && !failure.stdout?.trim()
    && failure.stderr?.trim() === `No user-scoped MCP server found with name: ${name}`;
}

// ---------------------------------------------------------------------------
// Base class
// ---------------------------------------------------------------------------

export abstract class BaseToolAdapter implements ToolAdapter {
  abstract toolId: string;
  log?: TraceLogger;

  abstract addViaCli(name: string, config: McpServerConfig): Promise<AdapterResult>;
  abstract removeViaCli(name: string): Promise<AdapterResult>;
  abstract writeToFile(mcps: Record<string, McpServerConfig>): Promise<AdapterResult>;
  abstract removeFromFile(name: string): Promise<AdapterResult>;

  async hasCli(): Promise<boolean> {
    return false;
  }

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

  async syncAll(mcps: Record<string, McpServerConfig>): Promise<AdapterResult> {
    if (await this.hasCli()) {
      const errors: string[] = [];
      for (const [name, config] of Object.entries(mcps)) {
        const result = config.state && config.state !== "enabled"
          ? await this.removeViaCli(name)
          : await this.addViaCli(name, config);
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
    const result = await this.removeFromFile(name);
    // A tool without a config/registration is already reconciled, not a failed native operation.
    if (!result.success && (result.error === "Config not found" || result.error === `${name} not found`)) {
      return { success: true, method: "file", message: `${name} already absent` };
    }
    return result;
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
