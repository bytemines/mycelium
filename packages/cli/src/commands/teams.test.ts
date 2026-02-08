import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:fs/promises", () => ({
  readdir: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock("@mycelium/core", () => ({
  ensureDir: vi.fn(),
  pathExists: vi.fn(),
  getGlobalMyceliumPath: () => "/mock/home/.mycelium",
}));

describe("parseTeamConfig", () => {
  it("parses valid team config YAML", async () => {
    const { parseTeamConfig } = await import("../core/agent-teams.js");
    const yaml = `
name: my-team
agents:
  - name: lead
    role: Coordinate work
    model: opus
  - name: dev
    role: Write code
`;
    const config = parseTeamConfig(yaml);
    expect(config.name).toBe("my-team");
    expect(config.agents).toHaveLength(2);
    expect(config.agents[0].name).toBe("lead");
    expect(config.agents[0].model).toBe("opus");
  });

  it("throws when name is missing", async () => {
    const { parseTeamConfig } = await import("../core/agent-teams.js");
    expect(() => parseTeamConfig("agents:\n  - name: a\n    role: r\n")).toThrow("name");
  });

  it("throws when agents is empty", async () => {
    const { parseTeamConfig } = await import("../core/agent-teams.js");
    expect(() => parseTeamConfig("name: x\nagents: []\n")).toThrow("at least one agent");
  });
});

describe("generateTeamManifest", () => {
  it("generates YAML from team config", async () => {
    const { generateTeamManifest } = await import("../core/agent-teams.js");
    const yaml = generateTeamManifest({
      name: "test-team",
      agents: [
        { name: "lead", role: "Lead" },
        { name: "dev", role: "Dev", model: "sonnet" },
      ],
    });
    expect(yaml).toContain("test-team");
    expect(yaml).toContain("lead");
    expect(yaml).toContain("sonnet");
  });

  it("omits model when not specified", async () => {
    const { generateTeamManifest } = await import("../core/agent-teams.js");
    const yaml = generateTeamManifest({
      name: "t",
      agents: [{ name: "a", role: "r" }],
    });
    expect(yaml).not.toContain("model");
  });
});

describe("listTeams", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns team names from yaml files", async () => {
    const { pathExists } = await import("@mycelium/core");
    const fs = await import("node:fs/promises");
    vi.mocked(pathExists).mockResolvedValue(true);
    vi.mocked(fs.readdir).mockResolvedValue(["team-a.yaml", "team-b.yml", "readme.txt"] as any);

    const { listTeams } = await import("./teams.js");
    const teams = await listTeams("/mock/teams");

    expect(teams).toEqual(["team-a", "team-b"]);
  });

  it("returns empty array when dir does not exist", async () => {
    const { pathExists } = await import("@mycelium/core");
    vi.mocked(pathExists).mockResolvedValue(false);

    const { listTeams } = await import("./teams.js");
    const teams = await listTeams("/missing/dir");

    expect(teams).toEqual([]);
  });
});

describe("teamsCommand", () => {
  it("exports a Command named 'teams'", async () => {
    const { teamsCommand } = await import("./teams.js");
    expect(teamsCommand.name()).toBe("teams");
  });

  it("has list and create subcommands", async () => {
    const { teamsCommand } = await import("./teams.js");
    const names = teamsCommand.commands.map((c) => c.name());
    expect(names).toContain("list");
    expect(names).toContain("create");
  });
});
