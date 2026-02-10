/**
 * mcp command — starts the Mycelium MCP server (stdio transport).
 *
 * Usage:
 *   mycelium mcp              # Start MCP server on stdio
 */
import { Command } from "commander";

export const mcpCommand = new Command("mcp")
  .description("Start Mycelium MCP server (stdio transport)")
  .action(async () => {
    const { StdioServerTransport } = await import(
      "@modelcontextprotocol/sdk/server/stdio.js"
    );
    const { createMyceliumMcpServer } = await import("../mcp/server.js");

    const server = createMyceliumMcpServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
  });
