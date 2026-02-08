/**
 * Agent Team Config Management
 * Parse and generate Claude Code Agent Teams configurations
 */
import { parse as yamlParse, stringify as yamlStringify } from "yaml";
import type { AgentConfig, TeamConfig } from "@mycelium/core";

/**
 * Parse a team config from YAML string
 */
export function parseTeamConfig(yaml: string): TeamConfig {
  const parsed = yamlParse(yaml);

  if (!parsed || !parsed.name) {
    throw new Error("Team config must have a 'name' field");
  }

  if (!parsed.agents || !Array.isArray(parsed.agents) || parsed.agents.length === 0) {
    throw new Error("Team config must have at least one agent");
  }

  return {
    name: parsed.name,
    agents: parsed.agents.map((a: Record<string, unknown>) => ({
      name: a.name as string,
      role: a.role as string,
      model: a.model as string | undefined,
    })),
  };
}

/**
 * Generate a Claude Code team manifest from a TeamConfig
 */
export function generateTeamManifest(team: TeamConfig): string {
  const manifest = {
    name: team.name,
    agents: team.agents.map((agent) => ({
      name: agent.name,
      role: agent.role,
      ...(agent.model ? { model: agent.model } : {}),
    })),
  };

  return yamlStringify(manifest);
}
