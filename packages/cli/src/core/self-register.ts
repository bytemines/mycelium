/**
 * Self-registration — writes mycelium MCP entry into all detected tool configs.
 * Called during `mycelium init`.
 */
import { execFileSync } from "node:child_process";
import type { McpServerConfig } from "@mycelish/core";
import { ALL_TOOL_IDS } from "@mycelish/core";
import { syncToTool } from "./sync-writer.js";
import type { TraceLogger } from "./tracer.js";

export function buildSelfMcpEntry(): McpServerConfig {
  let useDirectBinary = false;
  try {
    execFileSync("which", ["mycelium"], { stdio: "pipe" });
    useDirectBinary = true;
  } catch {
    // not in PATH — use npx
  }

  if (useDirectBinary) {
    return { command: "mycelium", args: ["mcp"], state: "enabled", source: "self" };
  }

  return {
    command: "npx",
    args: ["-y", "@mycelish/cli", "mcp"],
    state: "enabled",
    source: "self",
  };
}

export async function selfRegister(log?: TraceLogger): Promise<Record<string, boolean>> {
  const entry = buildSelfMcpEntry();
  const mcps = { mycelium: entry };
  const results: Record<string, boolean> = {};

  for (const toolId of ALL_TOOL_IDS) {
    try {
      const result = await syncToTool(toolId, mcps, undefined, log);
      results[toolId] = result.success;
      log?.info({ scope: "global", op: "self-register", tool: toolId, msg: `Self-register ${result.success ? "ok" : "failed"}` });
    } catch {
      results[toolId] = false;
    }
  }

  return results;
}
