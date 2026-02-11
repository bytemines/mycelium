import { describe, it, expect, vi, beforeEach } from "vitest";
import * as os from "node:os";
import * as path from "node:path";

// Mock os.homedir before importing
vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return { ...actual, homedir: vi.fn(() => "/Users/conrado") };
});

vi.mock("node:fs/promises", async () => {
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  return {
    ...actual,
    readdir: vi.fn().mockRejectedValue(new Error("ENOENT")),
    readFile: vi.fn().mockRejectedValue(new Error("ENOENT")),
    stat: vi.fn().mockRejectedValue(new Error("ENOENT")),
    access: vi.fn().mockRejectedValue(new Error("ENOENT")),
  };
});

// Mock fsSync.statSync to simulate directory structure
const fsDirs = new Set([
  "/Users/conrado/code",
  "/Users/conrado/code/mycelium",
  "/Users/conrado/code/bytemines-io",
  "/Users/conrado/code/Argusito",
  "/Users/conrado/work",
  "/Users/conrado/work/clients",
  "/Users/conrado/work/clients/acme-app",
  "/Users/conrado/mycelium",
]);
vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    statSync: vi.fn((p: string) => {
      if (fsDirs.has(p)) return { isDirectory: () => true };
      throw new Error("ENOENT");
    }),
  };
});

vi.mock("../fs-helpers.js", () => ({
  readFileIfExists: vi.fn().mockResolvedValue(null),
  MYCELIUM_HOME: "/mock/.mycelium",
  mkdirp: vi.fn(),
}));

vi.mock("../skill-parser.js", () => ({
  parseSkillMd: vi.fn().mockReturnValue({ name: "test", description: "test" }),
}));

vi.mock("../tool-detector.js", () => ({
  detectInstalledTools: vi.fn().mockResolvedValue([]),
}));

vi.mock("../plugin-scanner.js", () => ({
  scanPluginCache: vi.fn().mockResolvedValue([]),
}));

const { decodeProjectName, scanOpenCode, scanTool } = await import("./scanners.js");

describe("decodeProjectName", () => {
  it("resolves to project basename via filesystem", () => {
    // ~/code/mycelium → basename is "mycelium"
    expect(decodeProjectName("-Users-conrado-code-mycelium")).toBe("mycelium");
  });

  it("preserves hyphens in real directory names", () => {
    // ~/code/bytemines-io (single dir with hyphen) → "bytemines-io"
    expect(decodeProjectName("-Users-conrado-code-bytemines-io")).toBe("bytemines-io");
  });

  it("handles deeply nested paths", () => {
    // ~/work/clients/acme-app → "acme-app"
    expect(decodeProjectName("-Users-conrado-work-clients-acme-app")).toBe("acme-app");
  });

  it("handles slug without leading dash", () => {
    expect(decodeProjectName("mycelium")).toBe("mycelium");
  });

  it("handles slug that doesn't match home prefix", () => {
    expect(decodeProjectName("-Other-user-project")).toBe("Other-user-project");
  });

  it("handles single segment after home prefix", () => {
    // ~/mycelium → "mycelium"
    expect(decodeProjectName("-Users-conrado-mycelium")).toBe("mycelium");
  });

  it("falls back gracefully when dirs don't exist on disk", () => {
    // Nothing in fsDirs matches "unknown-project"
    expect(decodeProjectName("-Users-conrado-unknown-project")).toBe("unknown-project");
  });

  it("resolves Argusito correctly", () => {
    expect(decodeProjectName("-Users-conrado-code-Argusito")).toBe("Argusito");
  });
});

describe("scanOpenCode", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue("/Users/conrado");
  });

  it("returns empty result when no config exists", async () => {
    const result = await scanOpenCode();
    expect(result.toolId).toBe("opencode");
    expect(result.toolName).toBe("OpenCode");
    expect(result.installed).toBe(true);
    expect(result.mcps).toEqual([]);
    expect(result.memory).toEqual([]);
    expect(result.skills).toEqual([]);
  });

  it("scans local MCP servers from config", async () => {
    const { readFileIfExists } = await import("../fs-helpers.js");
    const configPath = path.join("/Users/conrado", ".config", "opencode", "opencode.json");

    vi.mocked(readFileIfExists).mockImplementation(async (p: string) => {
      if (p === configPath) {
        return JSON.stringify({
          mcp: {
            "my-server": {
              type: "local",
              command: ["npx", "-y", "my-mcp-server"],
              environment: { API_KEY: "test" },
            },
          },
        });
      }
      return null;
    });

    const result = await scanOpenCode();
    expect(result.mcps).toHaveLength(1);
    expect(result.mcps[0]).toEqual({
      name: "my-server",
      config: {
        command: "npx",
        args: ["-y", "my-mcp-server"],
        env: { API_KEY: "test" },
      },
      source: "opencode",
    });
  });

  it("scans remote MCP servers from config", async () => {
    const { readFileIfExists } = await import("../fs-helpers.js");
    const configPath = path.join("/Users/conrado", ".config", "opencode", "opencode.json");

    vi.mocked(readFileIfExists).mockImplementation(async (p: string) => {
      if (p === configPath) {
        return JSON.stringify({
          mcp: {
            "remote-server": {
              type: "remote",
              url: "https://mcp.example.com",
            },
          },
        });
      }
      return null;
    });

    const result = await scanOpenCode();
    expect(result.mcps).toHaveLength(1);
    expect(result.mcps[0]).toEqual({
      name: "remote-server",
      config: { command: "https://mcp.example.com", args: ["remote"] },
      source: "opencode",
    });
  });

  it("scans AGENTS.md memory", async () => {
    const { readFileIfExists } = await import("../fs-helpers.js");
    const agentsPath = path.join("/Users/conrado", ".config", "opencode", "AGENTS.md");

    vi.mocked(readFileIfExists).mockImplementation(async (p: string) => {
      if (p === agentsPath) return "# Agents\nSome agent config";
      return null;
    });

    const result = await scanOpenCode();
    expect(result.memory).toHaveLength(1);
    expect(result.memory[0].name).toBe("AGENTS");
    expect(result.memory[0].source).toBe("opencode");
    expect(result.memory[0].content).toBe("# Agents\nSome agent config");
  });

  it("scans commands as skills", async () => {
    const fs = await import("node:fs/promises");
    const commandsDir = path.join("/Users/conrado", ".config", "opencode", "commands");

    vi.mocked(fs.readdir).mockImplementation(async (dir: any) => {
      if (dir === commandsDir) {
        return [
          { name: "review.md", isDirectory: () => false, isFile: () => true },
          { name: "deploy.md", isDirectory: () => false, isFile: () => true },
        ] as any;
      }
      throw new Error("ENOENT");
    });

    const result = await scanOpenCode();
    expect(result.skills).toHaveLength(2);
    expect(result.skills[0].name).toBe("review");
    expect(result.skills[1].name).toBe("deploy");
    expect(result.skills[0].source).toBe("opencode");
  });
});

describe("scanTool routing", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue("/Users/conrado");
  });

  it("routes opencode to scanOpenCode", async () => {
    const result = await scanTool("opencode");
    expect(result.toolId).toBe("opencode");
    expect(result.installed).toBe(true);
  });
});
