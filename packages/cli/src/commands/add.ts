/**
 * add command - Add skills and MCPs to Mycelium configuration
 *
 * Usage:
 *   mycelium add skill <source>     # Add a skill from GitHub (owner/repo) or local path (./local/skill)
 *   mycelium add mcp <name>         # Add an MCP server configuration
 *
 * Examples:
 *   mycelium add skill anthropic/claude-skills --global
 *   mycelium add skill ./my-local-skill
 *   mycelium add mcp context7 --command "npx" --args "-y @context7/mcp" --global
 */

import { Command } from "commander";
import {
  addSkill,
  addMcp,
  fetchMcpFromRegistry,
} from "../core/add-helpers.js";
import { getTracer } from "../core/global-tracer.js";
import { ALL_TOOL_IDS } from "@mycelish/core";
import { syncAll } from "./sync.js";

// Re-export types and functions for backward compatibility
export type {
  SkillSourceInfo,
  AddSkillOptions,
  AddSkillResult,
  McpNameInfo,
  AddMcpOptions,
  AddMcpResult,
} from "../core/add-helpers.js";
export { parseSkillSource, addSkill, parseMcpName, addMcp } from "../core/add-helpers.js";

/**
 * skill subcommand: mycelium add skill <source>
 */
const skillCommand = new Command("skill")
  .description("Add a skill from GitHub (owner/repo) or local path (./local/skill)")
  .argument("<source>", "Skill source (owner/repo for GitHub or ./path for local)")
  .option("-g, --global", "Add to global configuration (~/.mycelium/)")
  .option("-f, --force", "Overwrite existing skill")
  .action(async (source: string, options: { global?: boolean; force?: boolean }) => {
    const log = getTracer().createTrace("add");
    log.info({ scope: "skill", op: "add", msg: `Adding skill from ${source}`, item: source });
    const result = await addSkill(source, {
      global: options.global ?? true,
      force: options.force ?? false,
    });

    if (result.success) {
      log.info({ scope: "skill", op: "add", msg: result.message ?? "Added", item: source });
      console.log(result.message);
      try {
        const enabledTools = Object.fromEntries(ALL_TOOL_IDS.map(id => [id, { enabled: true }]));
        await syncAll(process.cwd(), enabledTools);
      } catch { /* sync failure shouldn't break add */ }
    } else {
      log.error({ scope: "skill", op: "add", msg: result.error ?? "Failed", item: source, error: result.error });
      console.error(`Error: ${result.error}`);
      process.exit(1);
    }
  });

/**
 * mcp subcommand: mycelium add mcp <name>
 */
const mcpCommand = new Command("mcp")
  .description("Add an MCP server configuration")
  .argument("<name>", "MCP server name")
  .option("-c, --command <command>", "Command to run the MCP server")
  .option("-a, --args <args...>", "Arguments for the command")
  .option("-e, --env <env...>", "Environment variables (KEY=value)")
  .option("--enabled", "Enable the MCP server (default: true)")
  .option("-g, --global", "Add to global configuration (~/.mycelium/)")
  .option("-f, --force", "Overwrite existing MCP")
  .option("--from-registry", "Fetch config from the MCP registry")
  .action(
    async (
      name: string,
      options: {
        command?: string;
        args?: string[];
        env?: string[];
        enabled?: boolean;
        global?: boolean;
        force?: boolean;
        fromRegistry?: boolean;
      }
    ) => {
      if (options.fromRegistry) {
        const registryConfig = await fetchMcpFromRegistry(name);
        if (!registryConfig) {
          console.error(`Error: MCP "${name}" not found in registry`);
          process.exit(1);
        }
        options.command = registryConfig.command;
        options.args = registryConfig.args;
        if (registryConfig.env) {
          options.env = registryConfig.env;
        }
      }

      const log = getTracer().createTrace("add");
      log.info({ scope: "mcp", op: "add", msg: `Adding MCP ${name}`, item: name });

      if (!options.command) {
        console.error("Error: --command is required (or use --from-registry)");
        process.exit(1);
      }

      const env: Record<string, string> = {};
      if (options.env) {
        for (const envVar of options.env) {
          const [key, ...valueParts] = envVar.split("=");
          if (key && valueParts.length > 0) {
            env[key] = valueParts.join("=");
          }
        }
      }

      const result = await addMcp(name, {
        command: options.command,
        args: options.args,
        env: Object.keys(env).length > 0 ? env : undefined,
        enabled: options.enabled,
        global: options.global ?? true,
        force: options.force ?? false,
      });

      if (result.success) {
        log.info({ scope: "mcp", op: "add", msg: result.message ?? "Added", item: name });
        console.log(result.message);
        try {
          const enabledTools = Object.fromEntries(ALL_TOOL_IDS.map(id => [id, { enabled: true }]));
          await syncAll(process.cwd(), enabledTools);
        } catch { /* sync failure shouldn't break add */ }
      } else {
        log.error({ scope: "mcp", op: "add", msg: result.error ?? "Failed", item: name, error: result.error });
        console.error(`Error: ${result.error}`);
        process.exit(1);
      }
    }
  );

/**
 * Commander.js command for `mycelium add`
 */
export const addCommand = new Command("add")
  .description("Add skills or MCPs to Mycelium configuration")
  .addCommand(skillCommand)
  .addCommand(mcpCommand);
