import { describe, it, expect } from "vitest";
import { parseTeamConfig, generateTeamManifest } from "./agent-teams.js";

describe("agent-teams", () => {
  it("parses a team config YAML", () => {
    const yaml = `
name: backend-team
agents:
  - name: architect
    role: "Design system architecture"
    model: opus
  - name: implementer
    role: "Write implementation code"
    model: sonnet
  - name: tester
    role: "Write and run tests"
    model: haiku
`;
    const team = parseTeamConfig(yaml);
    expect(team.name).toBe("backend-team");
    expect(team.agents).toHaveLength(3);
    expect(team.agents[0].name).toBe("architect");
    expect(team.agents[0].role).toBe("Design system architecture");
    expect(team.agents[0].model).toBe("opus");
  });

  it("generates Claude Code team manifest", () => {
    const team = {
      name: "backend-team",
      agents: [
        { name: "architect", role: "Design", model: "opus" },
        { name: "coder", role: "Implement", model: "sonnet" },
      ],
    };
    const manifest = generateTeamManifest(team);
    expect(manifest).toContain("architect");
    expect(manifest).toContain("opus");
    expect(manifest).toContain("backend-team");
  });

  it("handles team config with optional fields", () => {
    const yaml = `
name: simple-team
agents:
  - name: worker
    role: "Do work"
`;
    const team = parseTeamConfig(yaml);
    expect(team.name).toBe("simple-team");
    expect(team.agents[0].model).toBeUndefined();
  });

  it("throws on invalid YAML without name", () => {
    const yaml = `
agents:
  - name: worker
    role: "Do work"
`;
    expect(() => parseTeamConfig(yaml)).toThrow();
  });

  it("throws on config without agents", () => {
    const yaml = `
name: empty-team
`;
    expect(() => parseTeamConfig(yaml)).toThrow();
  });
});
