import { z } from "zod";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import os from "node:os";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const MEMORY_BASE = path.join(os.homedir(), ".mycelium", "global", "memory");
const SCOPES = ["shared", "coding", "personal"] as const;

const scopeSchema = z
  .enum(SCOPES)
  .describe("Memory scope: shared (all tools), coding (dev tools), personal (personal tools)");

export function registerMemoryTools(server: McpServer): void {
  server.registerTool("mycelium_memory_list", {
    title: "List Memory Files",
    description:
      "List all memory files across scopes, or filter by scope. Memory files are markdown docs synced to AI tools.",
    inputSchema: {
      scope: scopeSchema.optional(),
    },
  }, async ({ scope }) => {
    const scopes = scope ? [scope] : [...SCOPES];
    const result: Record<string, string[]> = {};

    for (const s of scopes) {
      const dir = path.join(MEMORY_BASE, s);
      try {
        const files = await fs.readdir(dir);
        result[s] = files.filter((f) => f.endsWith(".md"));
      } catch {
        result[s] = [];
      }
    }

    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool("mycelium_memory_read", {
    title: "Read Memory File",
    description: "Read the contents of a memory file by scope and filename.",
    inputSchema: {
      scope: scopeSchema,
      name: z.string().describe("Filename (e.g. 'patterns.md')"),
    },
  }, async ({ scope, name }) => {
    const safeName = path.basename(name);
    const filePath = path.join(MEMORY_BASE, scope, safeName);

    try {
      const content = await fs.readFile(filePath, "utf-8");
      return { content: [{ type: "text", text: content }] };
    } catch {
      return { content: [{ type: "text", text: `File not found: ${scope}/${safeName}` }] };
    }
  });

  server.registerTool("mycelium_memory_write", {
    title: "Write Memory File",
    description:
      "Create or overwrite a memory file. Will be synced to all tools in the scope on next sync.",
    inputSchema: {
      scope: scopeSchema,
      name: z.string().describe("Filename (e.g. 'patterns.md')"),
      content: z.string().describe("Markdown content to write"),
    },
  }, async ({ scope, name, content }) => {
    const safeName = path.basename(name);
    const dir = path.join(MEMORY_BASE, scope);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, safeName), content, "utf-8");

    return {
      content: [{ type: "text", text: JSON.stringify({ success: true, path: `${scope}/${safeName}` }) }],
    };
  });
}
