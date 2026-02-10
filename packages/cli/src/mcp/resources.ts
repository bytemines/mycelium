/**
 * MCP Resources — read-only data exposed to AI tools via the MCP protocol.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerResources(server: McpServer): void {
  server.registerResource(
    "mycelium_config",
    "mycelium://config",
    { description: "Current merged mycelium configuration (MCPs, skills, memory scopes)" },
    async () => {
      const { loadAndMergeAllConfigs } = await import("../core/config-merger.js");
      const config = await loadAndMergeAllConfigs(process.cwd());
      return {
        contents: [{
          uri: "mycelium://config",
          text: JSON.stringify(config, null, 2),
          mimeType: "application/json",
        }],
      };
    },
  );

  server.registerResource(
    "mycelium_tools",
    "mycelium://tools",
    { description: "Tool registry — all 9 supported tools with capabilities, paths, and formats" },
    async () => {
      const { TOOL_REGISTRY } = await import("@mycelish/core");
      return {
        contents: [{
          uri: "mycelium://tools",
          text: JSON.stringify(TOOL_REGISTRY, null, 2),
          mimeType: "application/json",
        }],
      };
    },
  );
}
