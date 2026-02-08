/**
 * Tests for Plugin Scanner — convention-based component detection
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

import { scanPluginComponents, scanPluginCache, readPluginManifest, getComponentRules } from "./plugin-scanner.js";

// Use a temp dir to simulate plugin structures
let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "mycelium-plugin-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ============================================================================
// Helpers
// ============================================================================

async function mkdirpAndWrite(filePath: string, content: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf-8");
}

async function createSuperpowersPlugin(root: string) {
  // plugin.json
  await mkdirpAndWrite(
    path.join(root, ".claude-plugin", "plugin.json"),
    JSON.stringify({ name: "superpowers", version: "4.2.0", description: "Core skills library" }),
  );
  // skills
  await mkdirpAndWrite(
    path.join(root, "skills", "brainstorming", "SKILL.md"),
    '---\nname: brainstorming\ndescription: "Explore ideas before coding"\n---\n# Brainstorming',
  );
  await mkdirpAndWrite(
    path.join(root, "skills", "tdd", "SKILL.md"),
    "---\nname: tdd\n---\n# TDD",
  );
  // agents
  await mkdirpAndWrite(
    path.join(root, "agents", "code-reviewer.md"),
    "# Code Reviewer\nReviews completed milestones against plan",
  );
  // commands
  await mkdirpAndWrite(
    path.join(root, "commands", "brainstorm.md"),
    "---\ndescription: Start brainstorming\n---\nInvoke brainstorming skill",
  );
  await mkdirpAndWrite(
    path.join(root, "commands", "write-plan.md"),
    "# Write Plan\nCreate implementation plan",
  );
  // hooks
  await mkdirpAndWrite(path.join(root, "hooks", "session-start.sh"), "#!/bin/bash\necho hello");
  await mkdirpAndWrite(
    path.join(root, "hooks", "hooks.json"),
    '{"hooks":{"SessionStart":[{"matcher":"startup"}]}}',
  );
  // lib
  await mkdirpAndWrite(path.join(root, "lib", "skills-core.js"), "module.exports = {};");
}

// ============================================================================
// getComponentRules
// ============================================================================

describe("getComponentRules", () => {
  it("returns rules for all 5 component types", () => {
    const rules = getComponentRules();
    const types = rules.map((r) => r.type);
    expect(types).toContain("skill");
    expect(types).toContain("agent");
    expect(types).toContain("command");
    expect(types).toContain("hook");
    expect(types).toContain("lib");
  });
});

// ============================================================================
// readPluginManifest
// ============================================================================

describe("readPluginManifest", () => {
  it("reads from .claude-plugin/plugin.json", async () => {
    const root = path.join(tmpDir, "my-plugin");
    await mkdirpAndWrite(
      path.join(root, ".claude-plugin", "plugin.json"),
      JSON.stringify({ name: "test-plugin", version: "1.0.0", description: "A test" }),
    );
    const manifest = await readPluginManifest(root);
    expect(manifest).not.toBeNull();
    expect(manifest!.name).toBe("test-plugin");
    expect(manifest!.version).toBe("1.0.0");
    expect(manifest!.description).toBe("A test");
  });

  it("falls back to root plugin.json", async () => {
    const root = path.join(tmpDir, "fallback-plugin");
    await mkdirpAndWrite(
      path.join(root, "plugin.json"),
      JSON.stringify({ name: "fallback", version: "2.0.0" }),
    );
    const manifest = await readPluginManifest(root);
    expect(manifest).not.toBeNull();
    expect(manifest!.name).toBe("fallback");
  });

  it("returns null when no plugin.json exists", async () => {
    const root = path.join(tmpDir, "no-manifest");
    await fs.mkdir(root, { recursive: true });
    const manifest = await readPluginManifest(root);
    expect(manifest).toBeNull();
  });

  it("returns null for invalid JSON", async () => {
    const root = path.join(tmpDir, "bad-json");
    await mkdirpAndWrite(path.join(root, "plugin.json"), "not json{{{");
    const manifest = await readPluginManifest(root);
    expect(manifest).toBeNull();
  });
});

// ============================================================================
// scanPluginComponents
// ============================================================================

describe("scanPluginComponents", () => {
  it("finds all component types from superpowers-like structure", async () => {
    const root = path.join(tmpDir, "superpowers");
    await createSuperpowersPlugin(root);

    const components = await scanPluginComponents(root, "superpowers", "superpowers-marketplace");

    // Skills: 2
    const skills = components.filter((c) => c.type === "skill");
    expect(skills).toHaveLength(2);
    expect(skills.map((s) => s.name).sort()).toEqual(["brainstorming", "tdd"]);

    // Agents: 1
    const agents = components.filter((c) => c.type === "agent");
    expect(agents).toHaveLength(1);
    expect(agents[0].name).toBe("code-reviewer");

    // Commands: 2
    const commands = components.filter((c) => c.type === "command");
    expect(commands).toHaveLength(2);
    expect(commands.map((c) => c.name).sort()).toEqual(["brainstorm", "write-plan"]);

    // Hooks: 2 (session-start.sh + hooks.json)
    const hooks = components.filter((c) => c.type === "hook");
    expect(hooks).toHaveLength(2);

    // Lib: 1
    const libs = components.filter((c) => c.type === "lib");
    expect(libs).toHaveLength(1);
    expect(libs[0].name).toBe("skills-core");
  });

  it("sets pluginName and marketplace on all components", async () => {
    const root = path.join(tmpDir, "meta-test");
    await mkdirpAndWrite(path.join(root, "agents", "reviewer.md"), "# Reviewer");

    const components = await scanPluginComponents(root, "my-plugin", "my-mp");
    expect(components).toHaveLength(1);
    expect(components[0].pluginName).toBe("my-plugin");
    expect(components[0].marketplace).toBe("my-mp");
  });

  it("extracts description from frontmatter", async () => {
    const root = path.join(tmpDir, "desc-test");
    await mkdirpAndWrite(
      path.join(root, "skills", "tdd", "SKILL.md"),
      '---\nname: tdd\ndescription: "Test-driven development"\n---\n# TDD',
    );

    const components = await scanPluginComponents(root);
    const skill = components.find((c) => c.name === "tdd");
    expect(skill?.description).toBe("Test-driven development");
  });

  it("extracts description from first content line when no frontmatter", async () => {
    const root = path.join(tmpDir, "desc-fallback");
    await mkdirpAndWrite(
      path.join(root, "agents", "helper.md"),
      "# Helper Agent\nHelps with tasks and automation",
    );

    const components = await scanPluginComponents(root);
    const agent = components.find((c) => c.name === "helper");
    expect(agent?.description).toBe("Helps with tasks and automation");
  });

  it("returns empty array for non-existent directory", async () => {
    const components = await scanPluginComponents("/does/not/exist");
    expect(components).toEqual([]);
  });

  it("returns empty array for empty plugin dir", async () => {
    const root = path.join(tmpDir, "empty-plugin");
    await fs.mkdir(root, { recursive: true });
    const components = await scanPluginComponents(root);
    expect(components).toEqual([]);
  });

  it("handles nested skill dirs (skills/name/SKILL.md pattern)", async () => {
    const root = path.join(tmpDir, "nested");
    await mkdirpAndWrite(path.join(root, "skills", "deep", "nested", "SKILL.md"), "# Nested");
    // The parent-dir naming means this gets named "nested" (parent of SKILL.md)
    const components = await scanPluginComponents(root);
    const skills = components.filter((c) => c.type === "skill");
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe("nested");
  });
});

// ============================================================================
// scanPluginCache
// ============================================================================

describe("scanPluginCache", () => {
  it("scans marketplace/plugin/version structure", async () => {
    const cacheDir = path.join(tmpDir, "cache");
    const pluginRoot = path.join(cacheDir, "superpowers-marketplace", "superpowers", "4.2.0");
    await createSuperpowersPlugin(pluginRoot);

    const components = await scanPluginCache(cacheDir);

    expect(components.length).toBeGreaterThan(0);
    // Check marketplace and pluginName are set
    for (const c of components) {
      expect(c.marketplace).toBe("superpowers-marketplace");
      expect(c.pluginName).toBe("superpowers");
    }

    // Should find agents, commands, hooks, lib, and skills
    const types = new Set(components.map((c) => c.type));
    expect(types.has("skill")).toBe(true);
    expect(types.has("agent")).toBe(true);
    expect(types.has("command")).toBe(true);
    expect(types.has("hook")).toBe(true);
    expect(types.has("lib")).toBe(true);
  });

  it("picks latest version when multiple exist", async () => {
    const cacheDir = path.join(tmpDir, "cache-versions");
    // Create two versions
    await mkdirpAndWrite(
      path.join(cacheDir, "mp", "plugin", "1.0.0", "agents", "old.md"),
      "# Old Agent",
    );
    await mkdirpAndWrite(
      path.join(cacheDir, "mp", "plugin", "2.0.0", "agents", "new.md"),
      "# New Agent",
    );

    const components = await scanPluginCache(cacheDir);
    // Should only get the 2.0.0 version (sorted alphabetically, 2.0.0 > 1.0.0)
    expect(components).toHaveLength(1);
    expect(components[0].name).toBe("new");
  });

  it("handles multiple plugins in same marketplace", async () => {
    const cacheDir = path.join(tmpDir, "cache-multi");
    await mkdirpAndWrite(
      path.join(cacheDir, "mp", "plugin-a", "1.0.0", "agents", "agent-a.md"),
      "# Agent A",
    );
    await mkdirpAndWrite(
      path.join(cacheDir, "mp", "plugin-b", "1.0.0", "commands", "cmd-b.md"),
      "# Command B",
    );

    const components = await scanPluginCache(cacheDir);
    expect(components).toHaveLength(2);
    expect(components.find((c) => c.pluginName === "plugin-a")).toBeDefined();
    expect(components.find((c) => c.pluginName === "plugin-b")).toBeDefined();
  });

  it("returns empty for non-existent cache", async () => {
    const components = await scanPluginCache("/nonexistent/cache");
    expect(components).toEqual([]);
  });
});

// ============================================================================
// Integration: migrator uses components
// ============================================================================

describe("migrator integration", () => {
  it("generateMigrationPlan includes components from scans", async () => {
    const { generateMigrationPlan } = await import("./migrator.js");

    const scan = {
      toolId: "claude-code" as const,
      toolName: "Claude Code",
      installed: true,
      skills: [],
      mcps: [],
      memory: [],
      hooks: [],
      components: [
        { name: "code-reviewer", type: "agent" as const, path: "/p/agent.md", pluginName: "superpowers" },
        { name: "brainstorm", type: "command" as const, path: "/p/cmd.md", pluginName: "superpowers" },
      ],
    };

    const plan = generateMigrationPlan([scan]);
    expect(plan.components).toHaveLength(2);
    expect(plan.components[0].name).toBe("code-reviewer");
    expect(plan.components[0].type).toBe("agent");
    expect(plan.components[1].name).toBe("brainstorm");
    expect(plan.components[1].type).toBe("command");
  });

  it("generateMigrationPlan deduplicates components by type+name", async () => {
    const { generateMigrationPlan } = await import("./migrator.js");

    const scan1 = {
      toolId: "claude-code" as const,
      toolName: "Claude Code",
      installed: true,
      skills: [],
      mcps: [],
      memory: [],
      hooks: [],
      components: [
        { name: "reviewer", type: "agent" as const, path: "/a/reviewer.md" },
      ],
    };
    const scan2 = {
      toolId: "codex" as const,
      toolName: "Codex",
      installed: true,
      skills: [],
      mcps: [],
      memory: [],
      hooks: [],
      components: [
        { name: "reviewer", type: "agent" as const, path: "/b/reviewer.md" },
      ],
    };

    const plan = generateMigrationPlan([scan1, scan2]);
    expect(plan.components).toHaveLength(1);
  });

  it("generateMigrationPlan allows same name for different types", async () => {
    const { generateMigrationPlan } = await import("./migrator.js");

    const scan = {
      toolId: "claude-code" as const,
      toolName: "Claude Code",
      installed: true,
      skills: [],
      mcps: [],
      memory: [],
      hooks: [],
      components: [
        { name: "brainstorm", type: "agent" as const, path: "/a.md" },
        { name: "brainstorm", type: "command" as const, path: "/b.md" },
      ],
    };

    const plan = generateMigrationPlan([scan]);
    expect(plan.components).toHaveLength(2);
  });
});
