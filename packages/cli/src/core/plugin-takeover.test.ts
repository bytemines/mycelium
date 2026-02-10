/**
 * Tests for plugin-takeover module
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import * as os from "node:os";

// Mock all I/O before dynamic import
vi.mock("node:fs/promises");
vi.mock("./plugin-scanner.js");
vi.mock("./symlink-manager.js");
vi.mock("./fs-helpers.js");
vi.mock("./manifest-state.js");
vi.mock("./global-tracer.js", () => ({
  getTracer: () => ({
    createTrace: () => ({
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    }),
  }),
}));

// Mock expandPath to identity
vi.mock("@mycelish/core", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@mycelish/core")>();
  return { ...orig, expandPath: (p: string) => p };
});

const fsMock = await import("node:fs/promises");
const scannerMock = await import("./plugin-scanner.js");
const symlinkMock = await import("./symlink-manager.js");
const fsHelpersMock = await import("./fs-helpers.js");
const manifestMock = await import("./manifest-state.js");

const {
  getPluginForSkill,
  setPluginEnabled,
  syncPluginSymlinks,
  getSymlinkPath,
  PLUGIN_COMPONENT_DIRS,
} = await import("./plugin-takeover.js");

// ============================================================================
// Helpers
// ============================================================================

function mockDirent(name: string, isDir: boolean, isSymlink = false) {
  return { name, isDirectory: () => isDir, isFile: () => !isDir && !isSymlink, isSymbolicLink: () => isSymlink } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no settings.json
  vi.mocked(fsHelpersMock.readFileIfExists).mockResolvedValue(null);
  // Default: mkdir/writeFile succeed
  vi.mocked(fsMock.mkdir).mockResolvedValue(undefined as any);
  vi.mocked(fsMock.writeFile).mockResolvedValue(undefined);
});

// ============================================================================
// getPluginForSkill
// ============================================================================

describe("getPluginForSkill", () => {
  it("finds skill in plugin cache and returns TakenOverPlugin", async () => {
    vi.mocked(fsMock.readdir).mockImplementation(async (p: any) => {
      const s = String(p);
      if (s.endsWith("cache")) return [mockDirent("skillsmp", true)] as any;
      if (s.endsWith("skillsmp")) return [mockDirent("superpowers", true)] as any;
      if (s.endsWith("superpowers")) return [mockDirent("4.2.0", true)] as any;
      return [] as any;
    });

    vi.mocked(scannerMock.scanPluginComponents).mockResolvedValue([
      { name: "brainstorming", type: "skill", path: "/skills/brainstorming/SKILL.md" } as any,
      { name: "tdd", type: "skill", path: "/skills/tdd/SKILL.md" } as any,
    ]);

    const result = await getPluginForSkill("brainstorming");

    expect(result).not.toBeNull();
    expect(result!.pluginId).toBe("superpowers@skillsmp");
    expect(result!.plugin).toBe("superpowers");
    expect(result!.marketplace).toBe("skillsmp");
    expect(result!.version).toBe("4.2.0");
    expect(result!.allSkills).toEqual(["brainstorming", "tdd"]);
  });

  it("returns null for skills not in any plugin", async () => {
    vi.mocked(fsMock.readdir).mockImplementation(async (p: any) => {
      const s = String(p);
      if (s.endsWith("cache")) return [mockDirent("mp", true)] as any;
      if (s.endsWith("mp")) return [mockDirent("plug", true)] as any;
      if (s.endsWith("plug")) return [mockDirent("1.0.0", true)] as any;
      return [] as any;
    });

    vi.mocked(scannerMock.scanPluginComponents).mockResolvedValue([
      { name: "other-skill", type: "skill", path: "/x" } as any,
    ]);

    const result = await getPluginForSkill("nonexistent");
    expect(result).toBeNull();
  });

  it("returns null when plugin cache dir doesn't exist", async () => {
    vi.mocked(fsMock.readdir).mockRejectedValue(new Error("ENOENT"));

    const result = await getPluginForSkill("anything");
    expect(result).toBeNull();
  });
});

// ============================================================================
// setPluginEnabled
// ============================================================================

describe("setPluginEnabled", () => {
  it("preserves other settings.json content", async () => {
    vi.mocked(fsHelpersMock.readFileIfExists).mockResolvedValue(
      JSON.stringify({ permissions: { allow: true }, enabledPlugins: { "other@mp": true } }),
    );

    await setPluginEnabled("my-plugin@mp", false);

    const settingsCall = vi.mocked(fsMock.writeFile).mock.calls.find(
      (c) => String(c[0]).includes("settings.json"),
    );
    const written = JSON.parse(String(settingsCall![1]));
    expect(written.permissions).toEqual({ allow: true });
    expect(written.enabledPlugins["other@mp"]).toBe(true);
    expect(written.enabledPlugins["my-plugin@mp"]).toBe(false);
  });
});

// ============================================================================
// getSymlinkPath
// ============================================================================

describe("getSymlinkPath", () => {
  it("returns correct path for skills (no extension)", () => {
    const p = getSymlinkPath("skill", "brainstorming");
    expect(p).toContain("skills");
    expect(p).toContain("brainstorming");
    expect(p).not.toMatch(/\.md$/);
  });

  it("returns correct path for agents (.md extension)", () => {
    const p = getSymlinkPath("agent", "code-reviewer");
    expect(p).toContain("agents");
    expect(p).toMatch(/code-reviewer\.md$/);
  });

  it("returns correct path for commands (.md extension)", () => {
    const p = getSymlinkPath("command", "execute-plan");
    expect(p).toContain("commands");
    expect(p).toMatch(/execute-plan\.md$/);
  });

  it("throws for unknown type", () => {
    expect(() => getSymlinkPath("hook", "pre-commit")).toThrow("Unknown component type");
  });
});

// ============================================================================
// PLUGIN_COMPONENT_DIRS
// ============================================================================

describe("PLUGIN_COMPONENT_DIRS", () => {
  it("has entries for skill, agent, command", () => {
    expect(Object.keys(PLUGIN_COMPONENT_DIRS)).toEqual(["skill", "agent", "command"]);
  });

  it("skills have no ext, agents/commands have .md", () => {
    expect(PLUGIN_COMPONENT_DIRS.skill.ext).toBe("");
    expect(PLUGIN_COMPONENT_DIRS.agent.ext).toBe(".md");
    expect(PLUGIN_COMPONENT_DIRS.command.ext).toBe(".md");
  });
});

// ============================================================================
// syncPluginSymlinks
// ============================================================================

describe("syncPluginSymlinks", () => {
  it("returns empty when no takenOverPlugins", async () => {
    vi.mocked(manifestMock.loadStateManifest).mockResolvedValue({ version: "1.0", skills: {}, mcps: {} } as any);

    const result = await syncPluginSymlinks("/test");
    expect(result).toEqual({ created: [], removed: [] });
  });

  it("creates symlinks for enabled components, skips disabled", async () => {
    vi.mocked(manifestMock.loadStateManifest).mockResolvedValue({
      version: "1.0",
      skills: {},
      mcps: {},
      takenOverPlugins: {
        "plug@mp": {
          version: "1.0.0",
          cachePath: "/cache/mp/plug/1.0.0",
          allSkills: ["s1"],
          allComponents: ["s1", "agent1"],
        },
      },
    } as any);

    vi.mocked(manifestMock.getDisabledItems).mockResolvedValue(new Set(["agent1"]));

    vi.mocked(scannerMock.scanPluginComponents).mockResolvedValue([
      { name: "s1", type: "skill", path: "/cache/mp/plug/1.0.0/skills/s1/SKILL.md" } as any,
      { name: "agent1", type: "agent", path: "/cache/mp/plug/1.0.0/agents/agent1.md" } as any,
    ]);

    vi.mocked(symlinkMock.createSkillSymlink).mockResolvedValue({ success: true, action: "created" } as any);

    // Mock readdir for orphan cleanup — no existing symlinks
    vi.mocked(fsMock.readdir).mockResolvedValue([] as any);

    const result = await syncPluginSymlinks("/test");

    // Only s1 should be created (agent1 is disabled)
    expect(symlinkMock.createSkillSymlink).toHaveBeenCalledTimes(1);
    expect(result.created.length).toBe(1);
  });

  it("passes correct source paths for each component type (skills=dir, agents/commands=file)", async () => {
    vi.mocked(manifestMock.loadStateManifest).mockResolvedValue({
      version: "1.0",
      skills: {},
      mcps: {},
      takenOverPlugins: {
        "plug@mp": {
          version: "1.0.0",
          cachePath: "/cache/mp/plug/1.0.0",
          allSkills: ["s1"],
          allComponents: ["s1", "a1", "c1"],
        },
      },
    } as any);

    vi.mocked(manifestMock.getDisabledItems).mockResolvedValue(new Set());

    vi.mocked(scannerMock.scanPluginComponents).mockResolvedValue([
      { name: "s1", type: "skill", path: "/cache/mp/plug/1.0.0/skills/s1/SKILL.md" } as any,
      { name: "a1", type: "agent", path: "/cache/mp/plug/1.0.0/agents/a1.md" } as any,
      { name: "c1", type: "command", path: "/cache/mp/plug/1.0.0/commands/c1.md" } as any,
    ]);

    vi.mocked(symlinkMock.createSkillSymlink).mockResolvedValue({ success: true, action: "created" } as any);
    vi.mocked(fsMock.readdir).mockResolvedValue([] as any);

    await syncPluginSymlinks("/test");

    const calls = vi.mocked(symlinkMock.createSkillSymlink).mock.calls;
    expect(calls).toHaveLength(3);

    // Skill: source should be the DIRECTORY (dirname of SKILL.md)
    const skillCall = calls.find(c => String(c[1]).includes("skills"));
    expect(skillCall![0]).toBe("/cache/mp/plug/1.0.0/skills/s1"); // dirname of SKILL.md

    // Agent: source should be the .md FILE itself
    const agentCall = calls.find(c => String(c[1]).includes("agents"));
    expect(agentCall![0]).toBe("/cache/mp/plug/1.0.0/agents/a1.md");

    // Command: source should be the .md FILE itself
    const commandCall = calls.find(c => String(c[1]).includes("commands"));
    expect(commandCall![0]).toBe("/cache/mp/plug/1.0.0/commands/c1.md");
  });

  it("removes orphaned symlinks pointing to plugin cache", async () => {
    vi.mocked(manifestMock.loadStateManifest).mockResolvedValue({
      version: "1.0",
      skills: {},
      mcps: {},
      takenOverPlugins: {
        "plug@mp": {
          version: "1.0.0",
          cachePath: "/cache/mp/plug/1.0.0",
          allSkills: [],
          allComponents: [],
        },
      },
    } as any);

    vi.mocked(manifestMock.getDisabledItems).mockResolvedValue(new Set());
    vi.mocked(scannerMock.scanPluginComponents).mockResolvedValue([]);

    // Mock readdir to return an orphaned symlink
    vi.mocked(fsMock.readdir).mockResolvedValue([mockDirent("orphan", false, true)] as any);
    vi.mocked(fsMock.readlink).mockResolvedValue(`${os.homedir()}/.claude/plugins/cache/orphan-target`);
    vi.mocked(symlinkMock.removeSkillSymlink).mockResolvedValue({ success: true, existed: true } as any);

    const result = await syncPluginSymlinks("/test");

    expect(result.removed.length).toBeGreaterThan(0);
  });
});
