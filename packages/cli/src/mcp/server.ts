/**
 * Mycelium MCP Server factory.
 * Creates and configures an McpServer with all tool/resource/prompt registrations.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerConfigTools } from "./tools/config-tools.js";
import { registerItemTools } from "./tools/item-tools.js";
import { registerMarketplaceTools } from "./tools/marketplace-tools.js";
import { registerObserveTools } from "./tools/observe-tools.js";
import { registerResources } from "./resources.js";
import { registerPrompts } from "./prompts.js";

export function createMyceliumMcpServer(): McpServer {
  const server = new McpServer({
    name: "mycelium",
    version: "0.1.0",
  });

  registerConfigTools(server);
  registerItemTools(server);
  registerMarketplaceTools(server);
  registerObserveTools(server);

  registerResources(server);
  registerPrompts(server);

  return server;
}
