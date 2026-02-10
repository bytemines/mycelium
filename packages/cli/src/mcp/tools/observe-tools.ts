import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerObserveTools(server: McpServer): void {
  server.registerTool("mycelium_report", {
    title: "Query Traces",
    description:
      "Query the mycelium trace database. Filter by tool, scope, level, item, command, etc. Returns structured log entries for debugging.",
    inputSchema: {
      tool: z.string().optional().describe("Filter by tool ID"),
      level: z.string().optional().describe("Filter by level (debug, info, warn, error)"),
      cmd: z.string().optional().describe("Filter by command (sync, mcp, init, etc.)"),
      scope: z.string().optional().describe("Filter by scope"),
      item: z.string().optional().describe("Filter by item name"),
      since: z.string().optional().describe("Time filter (e.g. '1h', '30m', '1d')"),
      limit: z.number().optional().describe("Max entries to return (default 50)"),
    },
  }, async ({ tool, level, cmd, scope, item, since, limit }) => {
    const { getTracer } = await import("../../core/global-tracer.js");
    const tracer = getTracer();

    let sinceTs: number | undefined;
    if (since) {
      const match = since.match(/^(\d+)([hmds])$/);
      if (match) {
        const [, num, unit] = match;
        const ms = { h: 3600000, m: 60000, d: 86400000, s: 1000 }[unit!]!;
        sinceTs = Date.now() - parseInt(num!) * ms;
      }
    }

    const entries = tracer.query({
      tool, level, cmd, scope, item,
      since: sinceTs,
      limit: limit ?? 50,
    });

    return {
      content: [{ type: "text" as const, text: JSON.stringify(entries, null, 2) }],
    };
  });
}
