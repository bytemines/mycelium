import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ALL_TOOL_IDS, toolIdSchema, type McpServerConfig } from "@mycelish/core";

export function registerConfigTools(server: McpServer): void {
  server.registerTool("mycelium_status", {
    title: "Mycelium Status",
    description:
      "Show current config state: all MCPs, skills, agents, rules, and commands with their state (enabled/disabled) and source (global/machine/project).",
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
      "Push mycelium config (MCPs, skills, agents, rules, commands) to detected AI tools. Performs overlay sync — only touches mycelium-managed sections.",
    inputSchema: {
      tool: toolIdSchema.optional().describe("Sync only this tool (e.g. 'claude-code', 'cursor')"),
    },
  }, async ({ tool }) => {
    const { syncAll } = await import("../../commands/sync.js");
    const enabledTools = Object.fromEntries(ALL_TOOL_IDS.map(id => [id, { enabled: !tool || id === tool }]));
    const toolIds = tool ? [tool] : [...ALL_TOOL_IDS];
    const results: Record<string, { success: boolean; error?: string }> = {};
    let isError = false;
    try {
      const result = await syncAll(process.cwd(), enabledTools);
      isError = !result.success;
      for (const status of result.tools) {
        const success = status.status === "synced";
        results[status.tool] = { success, error: status.error };
        if (!success) isError = true;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      for (const id of toolIds) results[id] = { success: false, error: msg };
      const { getTracer } = await import("../../core/global-tracer.js");
      getTracer().createTrace("mcp").error({ scope: "mcp", op: "sync", msg, error: msg });
      isError = true;
    }

    return {
      isError,
      content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }],
    };
  });

  server.registerTool("mycelium_doctor", {
    title: "Doctor",
    description:
      "Run health checks: tool detection, MCP connectivity, config integrity, self-registration status.",
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
