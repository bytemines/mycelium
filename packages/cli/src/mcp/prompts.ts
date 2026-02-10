/**
 * MCP Prompts — guided workflows exposed to AI tools via the MCP protocol.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "debug_mycelium",
    { description: "Step-by-step diagnostic workflow for troubleshooting Mycelium issues" },
    async () => {
      const skillPath = path.resolve(__dirname, "../../skills/debug-mycelium.md");
      let content: string;
      try {
        content = await fs.readFile(skillPath, "utf-8");
      } catch {
        content = "Debug skill not found. Run `mycelium init` to install bundled skills.";
      }
      return { messages: [{ role: "user" as const, content: { type: "text" as const, text: content } }] };
    },
  );

  server.registerPrompt(
    "mycelium_setup",
    { description: "Interactive setup guide for new Mycelium users" },
    async () => ({
      messages: [{
        role: "user" as const,
        content: {
          type: "text" as const,
          text: [
            "Help me set up Mycelium. Here's what to do:",
            "",
            "1. Run `mycelium doctor` to check what tools are detected",
            "2. Run `mycelium status` to see current config state",
            "3. If nothing is configured, run `mycelium init` for auto-setup",
            "4. Use `mycelium marketplace list` to discover skills and MCPs",
            "5. Use `mycelium sync` to push config to all tools",
            "",
            "Start by calling mycelium_doctor to check system health.",
          ].join("\n"),
        },
      }],
    }),
  );
}
