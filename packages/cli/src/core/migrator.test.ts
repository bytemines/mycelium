/**
 * Tests for the Migrator module
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  generateMigrationPlan,
} from "./migrator/index.js";

import type {
  ToolScanResult,
  ScannedSkill,
  ScannedMcp,
  ScannedMemory,
  MigrationPlan,
} from "@mycelsh/core";

// ============================================================================
// Helpers
// ============================================================================

function makeSkill(name: string, source: string, lastUpdated?: Date): ScannedSkill {
  return { name, path: `/path/${name}`, source: source as any, lastUpdated };
}

function makeMcp(name: string, source: string, command = "npx", args: string[] = []): ScannedMcp {
  return { name, config: { command, args }, source: source as any };
}

function makeMemory(name: string, source: string): ScannedMemory {
  return { name, path: `/path/${name}.md`, source: source as any, scope: "shared" };
}

function makeScan(
  toolId: string,
  skills: ScannedSkill[] = [],
  mcps: ScannedMcp[] = [],
  memory: ScannedMemory[] = [],
): ToolScanResult {
  return { toolId: toolId as any, toolName: toolId, installed: true, skills, mcps, memory, hooks: [], components: [] };
}

// ============================================================================
// generateMigrationPlan
// ============================================================================

describe("generateMigrationPlan", () => {
  it("collects skills, mcps, memory from all scans", () => {
    const scans = [
      makeScan("claude-code", [makeSkill("s1", "claude-code")], [makeMcp("m1", "claude-code")], [makeMemory("mem1", "claude-code")]),
      makeScan("codex", [makeSkill("s2", "codex")]),
    ];
    const plan = generateMigrationPlan(scans);
    expect(plan.skills).toHaveLength(2);
    expect(plan.mcps).toHaveLength(1);
    expect(plan.memory).toHaveLength(1);
    expect(plan.conflicts).toHaveLength(0);
    expect(plan.strategy).toBe("latest");
  });

  it("returns empty plan for empty scans", () => {
    const plan = generateMigrationPlan([]);
    expect(plan.skills).toEqual([]);
    expect(plan.mcps).toEqual([]);
    expect(plan.memory).toEqual([]);
    expect(plan.conflicts).toEqual([]);
  });

  it("sets strategy in plan", () => {
    expect(generateMigrationPlan([], "all").strategy).toBe("all");
    expect(generateMigrationPlan([], "interactive").strategy).toBe("interactive");
  });

  describe("skill conflicts", () => {
    const conflictScans = () => [
      makeScan("claude-code", [makeSkill("tdd", "claude-code")]),
      makeScan("codex", [makeSkill("tdd", "codex")]),
    ];

    it("detects same-name skills from different tools", () => {
      const plan = generateMigrationPlan(conflictScans());
      expect(plan.conflicts).toHaveLength(1);
      expect(plan.conflicts[0].name).toBe("tdd");
      expect(plan.conflicts[0].type).toBe("skill");
      expect(plan.conflicts[0].entries).toHaveLength(2);
    });

    describe("latest strategy", () => {
      it("resolves by picking newest lastUpdated", () => {
        const scans = [
          makeScan("claude-code", [makeSkill("tdd", "claude-code", new Date("2025-01-01"))]),
          makeScan("codex", [makeSkill("tdd", "codex", new Date("2026-01-01"))]),
        ];
        const plan = generateMigrationPlan(scans, "latest");
        expect(plan.skills).toHaveLength(1);
        expect(plan.skills[0].source).toBe("codex");
        expect(plan.conflicts[0].resolved?.source).toBe("codex");
      });

      it("picks first when no dates", () => {
        const plan = generateMigrationPlan(conflictScans(), "latest");
        expect(plan.skills).toHaveLength(1);
        expect(plan.conflicts[0].resolved).toBeDefined();
      });
    });

    describe("all strategy", () => {
      it("namespaces as name@toolId", () => {
        const plan = generateMigrationPlan(conflictScans(), "all");
        expect(plan.skills).toHaveLength(2);
        const names = plan.skills.map((s) => s.name).sort();
        expect(names).toEqual(["tdd@claude-code", "tdd@codex"]);
      });
    });

    describe("interactive strategy", () => {
      it("leaves conflicts unresolved", () => {
        const plan = generateMigrationPlan(conflictScans(), "interactive");
        expect(plan.conflicts[0].resolved).toBeUndefined();
      });
    });
  });

  describe("MCP deduplication", () => {
    it("deduplicates identical MCP configs", () => {
      const scans = [
        makeScan("claude-code", [], [makeMcp("srv", "claude-code", "npx", ["--stdio"])]),
        makeScan("codex", [], [makeMcp("srv", "codex", "npx", ["--stdio"])]),
      ];
      const plan = generateMigrationPlan(scans);
      expect(plan.mcps).toHaveLength(1);
      expect(plan.conflicts).toHaveLength(0);
    });

    it("flags conflict when MCP configs differ", () => {
      const scans = [
        makeScan("claude-code", [], [makeMcp("srv", "claude-code", "npx")]),
        makeScan("codex", [], [makeMcp("srv", "codex", "node")]),
      ];
      const plan = generateMigrationPlan(scans);
      expect(plan.conflicts).toHaveLength(1);
      expect(plan.conflicts[0].type).toBe("mcp");
      expect(plan.conflicts[0].name).toBe("srv");
    });

    it("resolves MCP conflict with latest strategy", () => {
      const scans = [
        makeScan("claude-code", [], [makeMcp("srv", "claude-code", "npx")]),
        makeScan("codex", [], [makeMcp("srv", "codex", "node")]),
      ];
      const plan = generateMigrationPlan(scans, "latest");
      expect(plan.mcps).toHaveLength(1);
      expect(plan.conflicts[0].resolved).toBeDefined();
    });

    it("leaves MCP conflict unresolved with interactive strategy", () => {
      const scans = [
        makeScan("claude-code", [], [makeMcp("srv", "claude-code", "npx")]),
        makeScan("codex", [], [makeMcp("srv", "codex", "node")]),
      ];
      const plan = generateMigrationPlan(scans, "interactive");
      expect(plan.conflicts[0].resolved).toBeUndefined();
      expect(plan.mcps).toHaveLength(0);
    });
  });

  it("collects all memory from all tools", () => {
    const scans = [
      makeScan("claude-code", [], [], [makeMemory("proj1", "claude-code")]),
      makeScan("gemini-cli", [], [], [makeMemory("GEMINI", "gemini-cli")]),
    ];
    const plan = generateMigrationPlan(scans);
    expect(plan.memory).toHaveLength(2);
  });

  it("no conflicts when all skill names are unique", () => {
    const scans = [
      makeScan("claude-code", [makeSkill("a", "claude-code")]),
      makeScan("codex", [makeSkill("b", "codex")]),
      makeScan("openclaw", [makeSkill("c", "openclaw")]),
    ];
    const plan = generateMigrationPlan(scans);
    expect(plan.skills).toHaveLength(3);
    expect(plan.conflicts).toHaveLength(0);
  });
});

// ============================================================================
// Scanner tests (with fs mocks via vi.doMock + dynamic import)
// ============================================================================

function makeFsMock(overrides: Record<string, any> = {}) {
  return {
    readFile: vi.fn().mockRejectedValue(new Error("ENOENT")),
    readdir: vi.fn().mockRejectedValue(new Error("ENOENT")),
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    symlink: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockRejectedValue(new Error("ENOENT")),
    rm: vi.fn().mockResolvedValue(undefined),
    copyFile: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function mockDeps(fsMock: Record<string, any>) {
  vi.doMock("node:fs/promises", () => fsMock);
  vi.doMock("./tool-detector.js", () => ({
    detectInstalledTools: vi.fn().mockResolvedValue([]),
  }));
  vi.doMock("./skill-parser.js", () => ({
    parseSkillMd: vi.fn().mockReturnValue({ name: "", description: "", tools: [], body: "" }),
  }));
}

describe("scanners", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe("scanTool", () => {
    it("returns installed for opencode with empty results when no config exists", async () => {
      mockDeps(makeFsMock());
      const { scanTool } = await import("./migrator/index.js");
      const result = await scanTool("opencode");
      expect(result.installed).toBe(true);
      expect(result.skills).toEqual([]);
    });

    it("returns installed for aider with empty results when no config exists", async () => {
      mockDeps(makeFsMock());
      const { scanTool } = await import("./migrator/index.js");
      const result = await scanTool("aider");
      expect(result.installed).toBe(true);
    });
  });

  describe("scanGemini", () => {
    it("reads GEMINI.md when it exists", async () => {
      mockDeps(makeFsMock({
        readFile: vi.fn().mockResolvedValue("# Gemini Memory"),
      }));
      const { scanGemini } = await import("./migrator/index.js");
      const result = await scanGemini();
      expect(result.toolId).toBe("gemini-cli");
      expect(result.memory).toHaveLength(1);
      expect(result.memory[0].name).toBe("GEMINI");
      expect(result.memory[0].content).toBe("# Gemini Memory");
    });

    it("returns empty when GEMINI.md missing", async () => {
      mockDeps(makeFsMock());
      const { scanGemini } = await import("./migrator/index.js");
      const result = await scanGemini();
      expect(result.memory).toEqual([]);
    });
  });

  describe("scanCodex", () => {
    it("parses TOML MCP servers", async () => {
      mockDeps(makeFsMock({
        readFile: vi.fn().mockImplementation(async (p: string) => {
          if (p.includes("config.toml")) {
            return `[mcp.servers.git]\ncommand = "git-mcp"\nargs = ["--stdio"]\n\n[mcp.servers.fs]\ncommand = "fs-mcp"\n`;
          }
          throw new Error("ENOENT");
        }),
      }));
      const { scanCodex } = await import("./migrator/index.js");
      const result = await scanCodex();
      expect(result.mcps).toHaveLength(2);
      expect(result.mcps[0].name).toBe("git");
      expect(result.mcps[0].config.command).toBe("git-mcp");
      expect(result.mcps[0].config.args).toEqual(["--stdio"]);
      expect(result.mcps[1].name).toBe("fs");
      expect(result.mcps[1].config.command).toBe("fs-mcp");
    });

    it("reads AGENTS.md as memory", async () => {
      mockDeps(makeFsMock({
        readFile: vi.fn().mockImplementation(async (p: string) => {
          if (p.includes("AGENTS.md")) return "# Agent instructions";
          throw new Error("ENOENT");
        }),
      }));
      const { scanCodex } = await import("./migrator/index.js");
      const result = await scanCodex();
      expect(result.memory).toHaveLength(1);
      expect(result.memory[0].name).toBe("AGENTS");
    });
  });

  describe("scanOpenClaw", () => {
    it("parses skills and MCP adapters from openclaw.json", async () => {
      const config = {
        skills: { entries: [{ name: "oc-skill", path: "/p", enabled: true }] },
        plugins: {
          entries: [
            { name: "oc-mcp", type: "mcp-adapter", config: { serverUrl: "http://localhost:3000", transport: "stdio" } },
            { name: "not-mcp", type: "other" },
          ],
        },
      };
      mockDeps(makeFsMock({
        readFile: vi.fn().mockImplementation(async (p: string) => {
          if (p.includes("openclaw.json")) return JSON.stringify(config);
          throw new Error("ENOENT");
        }),
      }));
      const { scanOpenClaw } = await import("./migrator/index.js");
      const result = await scanOpenClaw();
      expect(result.skills).toHaveLength(1);
      expect(result.skills[0].name).toBe("oc-skill");
      expect(result.mcps).toHaveLength(1);
      expect(result.mcps[0].name).toBe("oc-mcp");
    });

    it("handles JSON with // comments", async () => {
      const raw = `{\n// comment\n"skills": { "entries": [] },\n"plugins": { "entries": [] }\n}`;
      mockDeps(makeFsMock({
        readFile: vi.fn().mockImplementation(async (p: string) => {
          if (p.includes("openclaw.json")) return raw;
          throw new Error("ENOENT");
        }),
      }));
      const { scanOpenClaw } = await import("./migrator/index.js");
      const result = await scanOpenClaw();
      expect(result.skills).toEqual([]);
    });
  });
});

// ============================================================================
// executeMigration + clearMigration + manifest
// ============================================================================

describe("scanClaudeCode provenance", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("extracts marketplace and pluginName from cache path", async () => {
    mockDeps(makeFsMock({
      readFile: vi.fn().mockImplementation(async (p: string) => {
        if (String(p).endsWith("SKILL.md")) return "---\nname: tdd\ndescription: TDD skill\n---\nBody";
        throw new Error("ENOENT");
      }),
      readdir: vi.fn().mockImplementation(async (dir: string) => {
        const dirStr = String(dir);
        if (dirStr.includes("cache") && !dirStr.includes("superpowers-marketplace")) {
          return [{ name: "superpowers-marketplace", isDirectory: () => true, isFile: () => false }];
        }
        if (dirStr.endsWith("superpowers-marketplace")) {
          return [{ name: "superpowers", isDirectory: () => true, isFile: () => false }];
        }
        if (dirStr.endsWith("superpowers") && !dirStr.includes("skills")) {
          return [{ name: "1.0.0", isDirectory: () => true, isFile: () => false }];
        }
        if (dirStr.endsWith("1.0.0")) {
          return [{ name: "skills", isDirectory: () => true, isFile: () => false }];
        }
        if (dirStr.endsWith("skills")) {
          return [{ name: "tdd", isDirectory: () => true, isFile: () => false }];
        }
        if (dirStr.endsWith("tdd")) {
          return [{ name: "SKILL.md", isDirectory: () => false, isFile: () => true }];
        }
        return [];
      }),
    }));

    vi.doMock("./skill-parser.js", () => ({
      parseSkillMd: vi.fn().mockReturnValue({ name: "tdd", description: "TDD skill", tools: [], body: "Body" }),
    }));

    const { scanClaudeCode } = await import("./migrator/index.js");
    const result = await scanClaudeCode();

    expect(result.skills.length).toBeGreaterThanOrEqual(1);
    const tddSkill = result.skills.find(s => s.name === "tdd");
    expect(tddSkill).toBeDefined();
    expect(tddSkill!.marketplace).toBe("superpowers-marketplace");
    expect(tddSkill!.pluginName).toBe("superpowers");
  });

  it("handles skills without cache path structure", async () => {
    mockDeps(makeFsMock({
      readFile: vi.fn().mockImplementation(async (p: string) => {
        if (String(p).endsWith("SKILL.md")) return "---\nname: basic\n---\nBody";
        throw new Error("ENOENT");
      }),
      readdir: vi.fn().mockImplementation(async (dir: string) => {
        const dirStr = String(dir);
        if (dirStr.includes("cache")) {
          return [{ name: "SKILL.md", isDirectory: () => false, isFile: () => true }];
        }
        return [];
      }),
    }));

    vi.doMock("./skill-parser.js", () => ({
      parseSkillMd: vi.fn().mockReturnValue({ name: "basic", description: "", tools: [], body: "Body" }),
    }));

    const { scanClaudeCode } = await import("./migrator/index.js");
    const result = await scanClaudeCode();
    for (const skill of result.skills) {
      expect(skill.source).toBe("claude-code");
    }
  });
});

describe("execution", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe("executeMigration", () => {
    it("creates symlinks, writes mcps.yaml, copies memory", async () => {
      const mockSymlink = vi.fn().mockResolvedValue(undefined);
      const mockWriteFile = vi.fn().mockResolvedValue(undefined);
      mockDeps(makeFsMock({ symlink: mockSymlink, writeFile: mockWriteFile }));

      const { executeMigration } = await import("./migrator/index.js");
      const plan: MigrationPlan = {
        skills: [{ name: "tdd", path: "/src/tdd", source: "claude-code" }],
        mcps: [{ name: "git", config: { command: "git-mcp", args: ["--stdio"] }, source: "codex" }],
        memory: [{ name: "proj1", path: "/mem/proj1.md", source: "claude-code", scope: "shared", content: "# Proj" }],
        components: [],
        conflicts: [],
        strategy: "latest",
      };

      const result = await executeMigration(plan);
      expect(result.success).toBe(true);
      expect(result.skillsImported).toBe(1);
      expect(result.mcpsImported).toBe(1);
      expect(result.memoryImported).toBe(1);
      expect(result.manifest.entries).toHaveLength(3);
      expect(mockSymlink).toHaveBeenCalled();

      const yamlCall = mockWriteFile.mock.calls.find((c: any[]) => String(c[0]).includes("mcps.yaml"));
      expect(yamlCall).toBeDefined();
      expect(yamlCall![1]).toContain("git:");
      expect(yamlCall![1]).toContain("command: git-mcp");
    });

    it("reports errors without failing entirely", async () => {
      mockDeps(makeFsMock({ symlink: vi.fn().mockRejectedValue(new Error("EPERM")) }));

      const { executeMigration } = await import("./migrator/index.js");
      const plan: MigrationPlan = {
        skills: [{ name: "sk", path: "/a", source: "claude-code" }],
        mcps: [],
        memory: [],
        components: [],
        conflicts: [],
        strategy: "latest",
      };

      const result = await executeMigration(plan);
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.skillsImported).toBe(0);
    });
  });

  describe("clearMigration", () => {
    it("clears all when no toolId specified", async () => {
      mockDeps(makeFsMock());
      const { clearMigration } = await import("./migrator/index.js");
      const result = await clearMigration();
      expect(result.cleared.length).toBeGreaterThan(0);
    });

    it("clears only specified tool entries", async () => {
      const manifest = {
        version: "1.0.0",
        lastMigration: "2026-01-01",
        entries: [
          { name: "tdd", type: "skill", source: "claude-code", originalPath: "/a", importedPath: "/b", importedAt: "2026-01-01" },
          { name: "debug", type: "skill", source: "codex", originalPath: "/c", importedPath: "/d", importedAt: "2026-01-01" },
        ],
      };
      mockDeps(makeFsMock({
        readFile: vi.fn().mockResolvedValue(JSON.stringify(manifest)),
        unlink: vi.fn().mockResolvedValue(undefined),
      }));
      const { clearMigration } = await import("./migrator/index.js");
      const result = await clearMigration({ toolId: "claude-code" });
      expect(result.cleared).toContain("/b");
    });
  });

  describe("loadManifest", () => {
    it("returns default manifest when file missing", async () => {
      mockDeps(makeFsMock());
      const { loadManifest } = await import("./migrator/index.js");
      const manifest = await loadManifest();
      expect(manifest.version).toBe("1.0.0");
      expect(manifest.entries).toEqual([]);
    });
  });

  describe("saveManifest", () => {
    it("writes JSON to manifest path", async () => {
      const mockWriteFile = vi.fn().mockResolvedValue(undefined);
      mockDeps(makeFsMock({ writeFile: mockWriteFile }));
      const { saveManifest } = await import("./migrator/index.js");
      await saveManifest({ version: "1.0.0", lastMigration: "now", entries: [] });
      const call = mockWriteFile.mock.calls.find((c: any[]) => String(c[0]).includes("migration-manifest"));
      expect(call).toBeDefined();
    });
  });
});
