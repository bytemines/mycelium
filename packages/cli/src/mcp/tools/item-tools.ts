/**
 * MCP item tools — enable, disable, add, remove items from mycelium config.
 * Delegates to existing CLI business logic modules.
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const itemTypeSchema = z
  .enum(["mcp", "skill", "plugin"])
  .describe("Type of item to manage");

const nameSchema = z.string().describe("Name of the item (e.g. 'my-mcp-server')");

const scopeSchema = z
  .enum(["global", "project"])
  .optional()
  .describe("Config scope (default: project if in a project, else global)");

export function registerItemTools(server: McpServer): void {
  server.registerTool("mycelium_enable", {
    title: "Enable Item",
    description: "Enable a skill, MCP, or plugin. Sets state to 'enabled' in manifest. May release a taken-over plugin if all its skills are re-enabled (experimental).",
    inputSchema: { name: nameSchema, type: itemTypeSchema, scope: scopeSchema },
  }, async ({ name, scope }) => {
    const { enableSkillOrMcp } = await import("../../commands/enable.js");
    const isGlobal = scope === "global";
    const result = await enableSkillOrMcp({ name, global: isGlobal });
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result) }],
    };
  });

  server.registerTool("mycelium_disable", {
    title: "Disable Item",
    description: "Disable a skill, MCP, or plugin. Sets state to 'disabled' in manifest. For skills from Claude Code plugins, may trigger plugin takeover (experimental).",
    inputSchema: { name: nameSchema, type: itemTypeSchema, scope: scopeSchema },
  }, async ({ name, scope }) => {
    const { disableSkillOrMcp } = await import("../../commands/disable.js");
    const isGlobal = scope === "global";
    const result = await disableSkillOrMcp({ name, global: isGlobal });
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result) }],
    };
  });

  server.registerTool("mycelium_add", {
    title: "Add Item",
    description:
      "Add a new MCP server or skill to mycelium config. For MCPs, provide command+args. For skills, provide the source path or owner/repo.",
    inputSchema: {
      name: nameSchema,
      type: itemTypeSchema,
      command: z.string().optional().describe("MCP command (e.g. 'npx')"),
      args: z.array(z.string()).optional().describe("MCP command args"),
      env: z.record(z.string(), z.string()).optional().describe("MCP env vars"),
      source: z.string().optional().describe("Skill source (owner/repo or ./path)"),
      scope: scopeSchema,
    },
  }, async ({ name, type, command, args, env, source, scope }) => {
    // Default to global for add (matches CLI behavior)
    const isGlobal = scope ? scope === "global" : true;

    if (type === "mcp") {
      if (!command) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: "command is required for MCP items" }) }],
        };
      }
      const { addMcp } = await import("../../core/add-helpers.js");
      const result = await addMcp(name, {
        command,
        args,
        env: env && Object.keys(env).length > 0 ? env : undefined,
        global: isGlobal,
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
      };
    }

    if (type === "skill") {
      const skillSource = source ?? name;
      const { addSkill } = await import("../../core/add-helpers.js");
      const result = await addSkill(skillSource, { global: isGlobal });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
      };
    }

    return {
      content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: `Unsupported type for add: ${type}` }) }],
    };
  });

  server.registerTool("mycelium_remove", {
    title: "Remove Item",
    description: "Remove a skill, MCP, or plugin from mycelium config (sets state to 'deleted').",
    inputSchema: { name: nameSchema, type: itemTypeSchema, scope: scopeSchema },
  }, async ({ name, type }) => {
    const { removeItem } = await import("../../commands/remove.js");
    const result = await removeItem(name, { type });
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result) }],
    };
  });
}
