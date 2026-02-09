/**
 * teams command - Manage Claude Code Agent Teams configs
 *
 * Usage:
 *   mycelium teams list       # List team configs
 *   mycelium teams create     # Create a new team config from template
 */

import { Command } from "commander";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { stringify as yamlStringify } from "yaml";
import { ensureDir, pathExists, getGlobalMyceliumPath } from "@mycelish/core";
import { parseTeamConfig, generateTeamManifest } from "../core/agent-teams.js";

/**
 * List all team configs in ~/.mycelium/teams/
 */
export async function listTeams(teamsDir: string): Promise<string[]> {
  const exists = await pathExists(teamsDir);
  if (!exists) return [];

  const files = await fs.readdir(teamsDir);
  return files
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    .map((f) => f.replace(/\.ya?ml$/, ""));
}

/**
 * Create a team config from a template
 */
export async function createTeamTemplate(
  name: string,
  teamsDir: string
): Promise<string> {
  await ensureDir(teamsDir);
  const filePath = path.join(teamsDir, `${name}.yaml`);

  const template = yamlStringify({
    name,
    agents: [
      { name: "lead", role: "Coordinate work and review", model: "opus" },
      { name: "developer", role: "Implement features", model: "sonnet" },
      { name: "tester", role: "Write and run tests", model: "haiku" },
    ],
  });

  await fs.writeFile(filePath, template, "utf-8");
  return filePath;
}

const listCommand = new Command("list")
  .description("List all team configurations")
  .action(async () => {
    const teamsDir = path.join(getGlobalMyceliumPath(), "teams");
    const teams = await listTeams(teamsDir);

    if (teams.length === 0) {
      console.log("No team configs found. Use 'mycelium teams create <name>' to create one.");
      return;
    }

    console.log("Teams:");
    for (const team of teams) {
      console.log(`  - ${team}`);
    }
  });

const createCommand = new Command("create")
  .description("Create a new team config from template")
  .argument("<name>", "Team name")
  .action(async (name: string) => {
    const teamsDir = path.join(getGlobalMyceliumPath(), "teams");
    const filePath = await createTeamTemplate(name, teamsDir);
    console.log(`Team config created: ${filePath}`);
  });

export const teamsCommand = new Command("teams")
  .description("Manage Claude Code Agent Teams configurations")
  .addCommand(listCommand)
  .addCommand(createCommand);
