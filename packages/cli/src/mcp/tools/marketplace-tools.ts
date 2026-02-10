import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerMarketplaceTools(server: McpServer): void {
  server.registerTool("mycelium_marketplace_search", {
    title: "Search Marketplace",
    description:
      "Search across all configured marketplace sources for skills, MCPs, and plugins. Returns matching items with source, description, and install info.",
    inputSchema: {
      query: z.string().describe("Search query (e.g. 'git', 'docker', 'testing')"),
      source: z.string().optional().describe("Filter by marketplace source name"),
    },
  }, async ({ query, source }) => {
    const { loadMarketplaceRegistry } = await import(
      "../../core/marketplace-registry.js"
    );
    const registry = await loadMarketplaceRegistry();

    const sources = source
      ? { [source]: registry[source] }
      : registry;

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({ query, sources, hint: "Use mycelium marketplace list for full results" }, null, 2),
      }],
    };
  });

  server.registerTool("mycelium_marketplace_list_sources", {
    title: "List Marketplace Sources",
    description: "List all configured marketplace sources and their status.",
    inputSchema: {},
  }, async () => {
    const { loadMarketplaceRegistry } = await import(
      "../../core/marketplace-registry.js"
    );
    const registry = await loadMarketplaceRegistry();
    return {
      content: [{ type: "text" as const, text: JSON.stringify(registry, null, 2) }],
    };
  });
}
