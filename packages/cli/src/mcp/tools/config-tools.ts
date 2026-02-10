import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ALL_TOOL_IDS, type McpServerConfig } from "@mycelish/core";

export function registerConfigTools(server: McpServer): void {
  server.registerTool("mycelium_status", {
    title: "Mycelium Status",
    description:
      "Show current config state: all MCPs, skills, and memory scopes with their state (enabled/disabled) and source (global/machine/project).",
    inputSchema: {
      tool: z
        .string()
        .optional()
        .describe("Filter status for a specific tool ID"),
    },
  }, async ({ tool }) => {
    const { loadAndMergeAllConfigs } = await import(
      "../../core/config-merger.js"
    );
    const merged = await loadAndMergeAllConfigs(process.cwd());

    const result = tool
      ? { mcps: filterByTool(merged.mcps, tool), sources: merged.sources }
      : merged;

    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  });

  server.registerTool("mycelium_sync", {
    title: "Sync Config",
    description:
      "Push mycelium config (MCPs, skills, memory) to detected AI tools. Performs overlay sync — only touches mycelium-managed sections.",
    inputSchema: {
      tool: z
        .string()
        .optional()
        .describe("Sync only this tool (e.g. 'claude-code', 'cursor')"),
    },
  }, async ({ tool }) => {
    const { loadAndMergeAllConfigs } = await import(
      "../../core/config-merger.js"
    );
    const { syncToTool } = await import("../../core/sync-writer.js");
    const { getTracer } = await import("../../core/global-tracer.js");

    const tracer = getTracer();
    const log = tracer.createTrace("mcp");
    const merged = await loadAndMergeAllConfigs(process.cwd());

    const toolIds = tool ? [tool] : [...ALL_TOOL_IDS];
    const results: Record<string, { success: boolean; error?: string }> = {};

    for (const id of toolIds) {
      try {
        const result = await syncToTool(id, merged.mcps, undefined, log);
        results[id] = { success: result.success, error: result.error };
        log.info({ scope: "mcp", op: "sync", tool: id, msg: `Sync ${result.success ? "ok" : "failed"}` });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        results[id] = { success: false, error: msg };
        log.warn({ scope: "mcp", op: "sync", tool: id, msg, error: msg });
      }
    }

    return {
      content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }],
    };
  });

  server.registerTool("mycelium_doctor", {
    title: "Doctor",
    description:
      "Run health checks: tool detection, MCP connectivity, config integrity, memory size, self-registration status.",
    inputSchema: {},
  }, async () => {
    const { runAllChecks, formatDoctorJson } = await import(
      "../../commands/health-checks/index.js"
    );
    const result = await runAllChecks();
    return {
      content: [{ type: "text" as const, text: formatDoctorJson(result) }],
    };
  });
}

function filterByTool(
  mcps: Record<string, McpServerConfig>,
  tool: string,
): Record<string, McpServerConfig> {
  const filtered: Record<string, McpServerConfig> = {};
  for (const [name, config] of Object.entries(mcps)) {
    if (config.tools && !config.tools.includes(tool)) continue;
    if (config.excludeTools?.includes(tool)) continue;
    filtered[name] = config;
  }
  return filtered;
}
