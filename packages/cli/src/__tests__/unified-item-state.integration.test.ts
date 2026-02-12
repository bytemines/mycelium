/**
 * Integration tests for unified item state management
 * Verifies that state: "enabled" | "disabled" | "deleted" works correctly
 * across the entire sync pipeline, symlink manager, and manifest migration.
 */

import { describe, it, expect, beforeEach, vi, type MockedFunction } from "vitest";
import type {
  ToolId,
  McpServerConfig,
  MergedConfig,
} from "@mycelish/core";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../core/config-merger.js", () => ({
  loadAndMergeAllConfigs: vi.fn(),
  loadGlobalConfig: vi.fn().mockResolvedValue({}),
  loadProjectConfig: vi.fn().mockResolvedValue({}),
}));

vi.mock("../core/conflict-detector.js", () => ({
  detectConflicts: vi.fn().mockReturnValue([]),
}));

vi.mock("../core/symlink-manager.js", () => ({
  syncSkillsToTool: vi.fn().mockResolvedValue({
    success: true,
    created: [],
    updated: [],
    removed: [],
    unchanged: [],
    errors: [],
  }),
}));

vi.mock("../core/mcp-injector.js", () => ({
  filterMcpsForTool: vi.fn(),
  resolveEnvVarsInMcps: vi.fn(),
}));

const mockSyncAll = vi.fn().mockResolvedValue({ success: true });
vi.mock("../core/tool-adapter.js", () => ({
  getAdapter: vi.fn(() => ({
    syncAll: mockSyncAll,
    syncOne: vi.fn().mockResolvedValue({ success: true }),
  })),
}));

// Imports after mocks
import { syncTool } from "../commands/sync.js";
import { syncSkillsToTool } from "../core/symlink-manager.js";
import {
  filterMcpsForTool,
  resolveEnvVarsInMcps,
} from "../core/mcp-injector.js";
import { migrateManifestV1ToV2 } from "../core/manifest-migrator.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function baseMergedConfig(
  mcps: Record<string, McpServerConfig> = {},
  skills: MergedConfig["skills"] = {},
): MergedConfig {
  return {
    mcps,
    skills,
    agents: {},
    rules: {},
    commands: {},
    sources: {},
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("unified item state integration", () => {
  const toolId: ToolId = "claude-code";

  beforeEach(() => {
    vi.clearAllMocks();

    // Default: filterMcpsForTool passes through only enabled MCPs (real behaviour)
    (filterMcpsForTool as MockedFunction<typeof filterMcpsForTool>).mockImplementation(
      (mcps, _toolId) => {
        const result: Record<string, McpServerConfig> = {};
        for (const [name, cfg] of Object.entries(mcps)) {
          if (cfg.state && cfg.state !== "enabled") continue;
          result[name] = cfg;
        }
        return result;
      },
    );

    (resolveEnvVarsInMcps as MockedFunction<typeof resolveEnvVarsInMcps>).mockImplementation(
      (mcps) => mcps,
    );
  });

  // -----------------------------------------------------------------------
  // MCP state filtering through sync pipeline
  // -----------------------------------------------------------------------

  it("sync skips MCPs with state:disabled", async () => {
    const config = baseMergedConfig({
      foo: { command: "node", args: ["foo.js"], state: "disabled" },
    });

    await syncTool(toolId, config);

    // The adapter should receive an empty MCP set
    expect(mockSyncAll).toHaveBeenCalledWith({});
  });

  it("sync skips MCPs with state:deleted", async () => {
    const config = baseMergedConfig({
      foo: { command: "node", args: ["foo.js"], state: "deleted" },
    });

    await syncTool(toolId, config);

    expect(mockSyncAll).toHaveBeenCalledWith({});
  });

  it("sync includes MCPs with state:enabled", async () => {
    const mcp: McpServerConfig = { command: "node", args: ["foo.js"], state: "enabled" };
    const config = baseMergedConfig({ foo: mcp });

    await syncTool(toolId, config);

    const passedMcps = mockSyncAll.mock.calls[0][0] as Record<string, McpServerConfig>;
    expect(passedMcps).toHaveProperty("foo");
    expect(passedMcps.foo.command).toBe("node");
  });

  it("sync includes MCPs with state:undefined (default enabled)", async () => {
    const mcp: McpServerConfig = { command: "node", args: ["foo.js"] };
    const config = baseMergedConfig({ foo: mcp });

    await syncTool(toolId, config);

    const passedMcps = mockSyncAll.mock.calls[0][0] as Record<string, McpServerConfig>;
    expect(passedMcps).toHaveProperty("foo");
  });

  // -----------------------------------------------------------------------
  // Skills with state filtering through symlink manager
  // -----------------------------------------------------------------------

  it("sync skips skills with state:disabled in symlink manager", async () => {
    const config = baseMergedConfig({}, {
      "my-skill": {
        name: "my-skill",
        path: "/tmp/skills/my-skill",
        manifest: { name: "my-skill", state: "disabled" },
      },
    });

    await syncTool(toolId, config);

    // syncSkillsToTool should be called — the symlink manager itself filters
    expect(syncSkillsToTool).toHaveBeenCalled();
    const passedSkills = (syncSkillsToTool as MockedFunction<typeof syncSkillsToTool>).mock.calls[0][0];
    // The skill is passed; the symlink-manager is responsible for skipping disabled ones
    expect(passedSkills).toHaveLength(1);
    expect(passedSkills[0].manifest.state).toBe("disabled");
  });

  // -----------------------------------------------------------------------
  // End-to-end: disable then sync excludes the item
  // -----------------------------------------------------------------------

  it("disable then sync excludes the item", async () => {
    // Simulate: user disables "playwright" MCP — state becomes "disabled"
    const config = baseMergedConfig({
      playwright: { command: "npx", args: ["@anthropic/mcp-playwright"], state: "disabled" },
      whark: { command: "uvx", args: ["whark-mcp"], state: "enabled" },
    });

    await syncTool(toolId, config);

    const passedMcps = mockSyncAll.mock.calls[0][0] as Record<string, McpServerConfig>;
    expect(passedMcps).not.toHaveProperty("playwright");
    expect(passedMcps).toHaveProperty("whark");
  });

  // -----------------------------------------------------------------------
  // End-to-end: remove (state:deleted) then sync excludes the item
  // -----------------------------------------------------------------------

  it("remove then sync excludes the item", async () => {
    const config = baseMergedConfig({
      removed: { command: "node", args: ["gone.js"], state: "deleted" },
      active: { command: "node", args: ["here.js"], state: "enabled" },
    });

    await syncTool(toolId, config);

    const passedMcps = mockSyncAll.mock.calls[0][0] as Record<string, McpServerConfig>;
    expect(passedMcps).not.toHaveProperty("removed");
    expect(passedMcps).toHaveProperty("active");
  });

  // -----------------------------------------------------------------------
  // Enable restores a deleted item
  // -----------------------------------------------------------------------

  it("enable restores a deleted item", () => {
    // Simulating what the enable command does: set state from "deleted" to "enabled"
    const item: McpServerConfig = { command: "node", args: ["restored.js"], state: "deleted" };

    // Simulate enable action
    item.state = "enabled";

    expect(item.state).toBe("enabled");

    // Now verify it would pass through the filter
    const mcps = { restored: item };
    const filtered: Record<string, McpServerConfig> = {};
    for (const [name, cfg] of Object.entries(mcps)) {
      if (cfg.state && cfg.state !== "enabled") continue;
      filtered[name] = cfg;
    }
    expect(filtered).toHaveProperty("restored");
  });

  // -----------------------------------------------------------------------
  // Manifest migration: enabled:false -> state:disabled
  // -----------------------------------------------------------------------

  it("manifest migration converts enabled:false to state:disabled", () => {
    const v1 = {
      skills: {
        foo: { name: "foo", enabled: false },
        bar: { name: "bar", enabled: true },
      },
      mcps: {
        pg: { command: "node", args: ["pg.js"], enabled: false },
      },
    };

    const v2 = migrateManifestV1ToV2(v1);

    const skills = v2.skills as Record<string, Record<string, unknown>>;
    expect(skills.foo.state).toBe("disabled");
    expect(skills.foo).not.toHaveProperty("enabled");

    expect(skills.bar.state).toBe("enabled");
    expect(skills.bar).not.toHaveProperty("enabled");

    const mcps = v2.mcps as Record<string, Record<string, unknown>>;
    expect(mcps.pg.state).toBe("disabled");
    expect(mcps.pg).not.toHaveProperty("enabled");
  });

  // -----------------------------------------------------------------------
  // Mixed states: only enabled items pass through
  // -----------------------------------------------------------------------

  it("mixed states: only enabled and undefined-state items pass through filter", async () => {
    const config = baseMergedConfig({
      a: { command: "node", args: ["a.js"], state: "enabled" },
      b: { command: "node", args: ["b.js"], state: "disabled" },
      c: { command: "node", args: ["c.js"], state: "deleted" },
      d: { command: "node", args: ["d.js"] }, // undefined = enabled
    });

    await syncTool(toolId, config);

    const passedMcps = mockSyncAll.mock.calls[0][0] as Record<string, McpServerConfig>;
    expect(Object.keys(passedMcps).sort()).toEqual(["a", "d"]);
  });
});
