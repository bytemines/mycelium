/**
 * Tests for sync command module
 * Tests written FIRST following TDD
 */

import { describe, it, expect, beforeEach, afterEach, vi, type MockedFunction } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type {
  ToolId,
  McpServerConfig,
  MergedConfig,
  SyncResult,
  ToolSyncStatus,
} from "@mycelish/core";

// Mock the dependencies
vi.mock("../core/config-merger.js", () => ({
  loadAndMergeAllConfigs: vi.fn(),
  loadGlobalConfig: vi.fn().mockResolvedValue({}),
  loadProjectConfig: vi.fn().mockResolvedValue({}),
}));

vi.mock("../core/conflict-detector.js", () => ({
  detectConflicts: vi.fn().mockReturnValue([]),
}));

vi.mock("../core/symlink-manager.js", () => ({
  syncSkillsToTool: vi.fn(),
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

vi.mock("../core/memory-scoper.js", () => ({
  syncMemoryToTool: vi.fn(),
  getMemoryFilesForTool: vi.fn(),
}));

// Import the module under test (doesn't exist yet - tests will fail)
import { syncAll, syncTool, loadEnvFile } from "./sync.js";

// Import mocked modules
import { loadAndMergeAllConfigs } from "../core/config-merger.js";
import { syncSkillsToTool } from "../core/symlink-manager.js";
import {
  filterMcpsForTool,
  resolveEnvVarsInMcps,
} from "../core/mcp-injector.js";
import { syncMemoryToTool, getMemoryFilesForTool } from "../core/memory-scoper.js";
import { getAdapter } from "../core/tool-adapter.js";

describe("Sync Command", () => {
  // Sample merged config for testing
  const sampleMergedConfig: MergedConfig = {
    mcps: {
      "whark-trading": {
        command: "uvx",
        args: ["whark-mcp"],
        env: { WHARK_API_KEY: "${WHARK_API_KEY}" },
        state: "enabled",
      },
      playwright: {
        command: "npx",
        args: ["@anthropic/mcp-playwright"],
        state: "enabled",
      },
      "claude-only": {
        command: "node",
        args: ["claude.js"],
        tools: ["claude-code"],
        state: "enabled",
      },
    },
    skills: {
      "superpowers": {
        name: "superpowers",
        path: "/Users/test/.mycelium/skills/superpowers",
        manifest: { name: "superpowers", state: "enabled" },
      },
    },
    memory: {
      scopes: {
        shared: { syncTo: ["claude-code", "codex"], path: "", files: [] },
        coding: { syncTo: ["claude-code"], path: "", files: [] },
        personal: { syncTo: ["openclaw"], path: "", files: [] },
      },
    },
    agents: {},
    rules: {},
    commands: {},
    sources: {},
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations
    (loadAndMergeAllConfigs as MockedFunction<typeof loadAndMergeAllConfigs>).mockResolvedValue(
      sampleMergedConfig
    );

    (syncSkillsToTool as MockedFunction<typeof syncSkillsToTool>).mockResolvedValue({
      success: true,
      created: ["superpowers"],
      updated: [],
      removed: [],
      unchanged: [],
      errors: [],
    });

    (filterMcpsForTool as MockedFunction<typeof filterMcpsForTool>).mockImplementation(
      (mcps, _toolId) => mcps
    );

    (resolveEnvVarsInMcps as MockedFunction<typeof resolveEnvVarsInMcps>).mockImplementation(
      (mcps, _envVars) => mcps
    );

    (syncMemoryToTool as MockedFunction<typeof syncMemoryToTool>).mockResolvedValue({
      success: true,
      filesWritten: 1,
    });

    (getMemoryFilesForTool as MockedFunction<typeof getMemoryFilesForTool>).mockResolvedValue([
      { scope: "shared", filename: "shared.md", path: "/path/to/shared.md" },
    ]);
  });

  describe("syncAll", () => {
    it("syncs to all enabled tools", async () => {
      const enabledTools: Record<ToolId, { enabled: boolean }> = {
        "claude-code": { enabled: true },
        codex: { enabled: true },
        "gemini-cli": { enabled: false },
        opencode: { enabled: false },
        openclaw: { enabled: false },
      };

      const result = await syncAll("/test/project", enabledTools);

      expect(result.success).toBe(true);
      // Should have synced to claude-code and codex (2 enabled tools)
      expect(result.tools.length).toBe(2);
      expect(result.tools.map((t) => t.tool)).toContain("claude-code");
      expect(result.tools.map((t) => t.tool)).toContain("codex");
    });

    it("skips disabled tools", async () => {
      const enabledTools: Record<ToolId, { enabled: boolean }> = {
        "claude-code": { enabled: true },
        codex: { enabled: false },
        "gemini-cli": { enabled: false },
        opencode: { enabled: false },
        openclaw: { enabled: false },
      };

      const result = await syncAll("/test/project", enabledTools);

      // Should only sync to claude-code
      expect(result.tools.length).toBe(1);
      expect(result.tools[0].tool).toBe("claude-code");
      expect(result.tools.map((t) => t.tool)).not.toContain("codex");
    });

    it("returns SyncResult with tool statuses", async () => {
      const enabledTools: Record<ToolId, { enabled: boolean }> = {
        "claude-code": { enabled: true },
        codex: { enabled: false },
        "gemini-cli": { enabled: false },
        opencode: { enabled: false },
        openclaw: { enabled: false },
      };

      const result = await syncAll("/test/project", enabledTools);

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("tools");
      expect(result).toHaveProperty("errors");
      expect(result).toHaveProperty("warnings");

      // Check tool status structure
      const toolStatus = result.tools[0];
      expect(toolStatus).toHaveProperty("tool");
      expect(toolStatus).toHaveProperty("status");
      expect(toolStatus).toHaveProperty("skillsCount");
      expect(toolStatus).toHaveProperty("mcpsCount");
      expect(toolStatus).toHaveProperty("memoryFiles");
    });

    it("handles errors gracefully and continues with other tools", async () => {
      const enabledTools: Record<ToolId, { enabled: boolean }> = {
        "claude-code": { enabled: true },
        codex: { enabled: true },
        "gemini-cli": { enabled: false },
        opencode: { enabled: false },
        openclaw: { enabled: false },
      };

      // Make claude-code fail but codex succeed
      let callCount = 0;
      (syncSkillsToTool as MockedFunction<typeof syncSkillsToTool>).mockImplementation(
        async (_skills, toolDir) => {
          callCount++;
          if (toolDir.includes("claude")) {
            throw new Error("Failed to sync skills to claude");
          }
          return {
            success: true,
            created: ["superpowers"],
            updated: [],
            removed: [],
            unchanged: [],
            errors: [],
          };
        }
      );

      const result = await syncAll("/test/project", enabledTools);

      // Should have attempted both tools
      expect(result.tools.length).toBe(2);

      // Claude should have error status
      const claudeStatus = result.tools.find((t) => t.tool === "claude-code");
      expect(claudeStatus?.status).toBe("error");
      expect(claudeStatus?.error).toBeDefined();

      // Codex should have synced status
      const codexStatus = result.tools.find((t) => t.tool === "codex");
      expect(codexStatus?.status).toBe("synced");

      // Overall success should be false due to claude error
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("resolves env vars from .env.local before injecting MCPs", async () => {
      const enabledTools: Record<ToolId, { enabled: boolean }> = {
        "claude-code": { enabled: true },
        codex: { enabled: false },
        "gemini-cli": { enabled: false },
        opencode: { enabled: false },
        openclaw: { enabled: false },
      };

      const mockEnvVars = { WHARK_API_KEY: "test-key-123" };

      // Track what was passed to resolveEnvVarsInMcps
      let capturedEnvVars: Record<string, string> | undefined;
      (resolveEnvVarsInMcps as MockedFunction<typeof resolveEnvVarsInMcps>).mockImplementation(
        (mcps, envVars) => {
          capturedEnvVars = envVars;
          return mcps;
        }
      );

      await syncAll("/test/project", enabledTools, mockEnvVars);

      // Verify resolveEnvVarsInMcps was called with env vars
      expect(resolveEnvVarsInMcps).toHaveBeenCalled();
      expect(capturedEnvVars).toEqual(mockEnvVars);
    });
  });

  describe("syncTool", () => {
    it("syncs skills to specific tool", async () => {
      const toolId: ToolId = "claude-code";

      await syncTool(toolId, sampleMergedConfig);

      expect(syncSkillsToTool).toHaveBeenCalled();
      // Verify it was called with the skills and tool's skills directory
      const callArgs = (syncSkillsToTool as MockedFunction<typeof syncSkillsToTool>).mock
        .calls[0];
      expect(callArgs[0]).toEqual(Object.values(sampleMergedConfig.skills));
    });

    it("syncs MCPs to specific tool", async () => {
      const toolId: ToolId = "claude-code";

      await syncTool(toolId, sampleMergedConfig);

      // Verify filterMcpsForTool was called to get tool-specific MCPs
      expect(filterMcpsForTool).toHaveBeenCalledWith(sampleMergedConfig.mcps, toolId);

      // Verify adapter syncAll was called
      expect(mockSyncAll).toHaveBeenCalled();
    });

    it("syncs memory to specific tool", async () => {
      const toolId: ToolId = "claude-code";

      await syncTool(toolId, sampleMergedConfig);

      expect(syncMemoryToTool).toHaveBeenCalledWith(toolId);
    });

    it("returns ToolSyncStatus with correct counts", async () => {
      const toolId: ToolId = "claude-code";

      // Mock to return specific counts
      (syncSkillsToTool as MockedFunction<typeof syncSkillsToTool>).mockResolvedValue({
        success: true,
        created: ["skill1", "skill2"],
        updated: ["skill3"],
        removed: [],
        unchanged: [],
        errors: [],
      });

      (filterMcpsForTool as MockedFunction<typeof filterMcpsForTool>).mockReturnValue({
        mcp1: { command: "test1", state: "enabled" as const },
        mcp2: { command: "test2", state: "enabled" as const },
      });

      (getMemoryFilesForTool as MockedFunction<typeof getMemoryFilesForTool>).mockResolvedValue([
        { scope: "shared", filename: "shared.md", path: "/path/shared.md" },
        { scope: "coding", filename: "coding.md", path: "/path/coding.md" },
      ]);

      const result = await syncTool(toolId, sampleMergedConfig);

      expect(result.tool).toBe(toolId);
      expect(result.status).toBe("synced");
      expect(result.skillsCount).toBe(3); // 2 created + 1 updated
      expect(result.mcpsCount).toBe(2);
      expect(result.memoryFiles).toHaveLength(2);
    });

    it("returns error status when skill sync fails", async () => {
      const toolId: ToolId = "claude-code";

      (syncSkillsToTool as MockedFunction<typeof syncSkillsToTool>).mockRejectedValue(
        new Error("Skill sync failed")
      );

      const result = await syncTool(toolId, sampleMergedConfig);

      expect(result.status).toBe("error");
      expect(result.error).toBe("Skill sync failed");
    });

    it("returns error status when MCP injection fails", async () => {
      const toolId: ToolId = "claude-code";

      mockSyncAll.mockRejectedValueOnce(new Error("MCP injection failed"));

      const result = await syncTool(toolId, sampleMergedConfig);

      expect(result.status).toBe("error");
      expect(result.error).toBe("MCP injection failed");
    });

    it("preserves disabled state on MCP entries through the sync pipeline", async () => {
      const toolId: ToolId = "claude-code";

      // Simulate a tool config file that already has an MCP with disabled: true.
      // The adapter reads the existing file, merges with incoming MCPs, and writes.
      // We override getAdapter to use a custom adapter that tracks the written output.
      const existingToolConfig: Record<string, unknown> = {
        mcpServers: {
          playwright: {
            command: "npx",
            args: ["-y", "@anthropic/mcp-playwright"],
            disabled: true,
          },
          "whark-trading": {
            command: "uvx",
            args: ["whark-mcp"],
          },
        },
      };

      let writtenConfig: Record<string, unknown> | undefined;

      // Override getAdapter for this test to simulate read-preserve-write
      const { getAdapter } = await import("../core/tool-adapter.js");
      (getAdapter as MockedFunction<typeof getAdapter>).mockReturnValueOnce({
        toolId: "claude-code",
        syncAll: async (mcps: Record<string, McpServerConfig>) => {
          // Simulate what GenericAdapter.writeToFile does:
          // read existing config, merge entries preserving extra props, write
          const merged: Record<string, unknown> = {};
          const existingEntries = existingToolConfig.mcpServers as Record<
            string,
            Record<string, unknown>
          >;
          for (const [name, mcp] of Object.entries(mcps)) {
            if (mcp.state === "disabled" || mcp.state === "deleted") continue;
            const prev = existingEntries[name];
            const shaped: Record<string, unknown> = {
              command: mcp.command,
              args: mcp.args || [],
              ...(mcp.env && Object.keys(mcp.env).length > 0
                ? { env: mcp.env }
                : {}),
            };
            merged[name] = prev ? { ...prev, ...shaped } : shaped;
          }
          writtenConfig = { mcpServers: merged };
          return { success: true, method: "file" as const };
        },
        syncOne: vi.fn(),
        addViaCli: vi.fn(),
        removeViaCli: vi.fn(),
        writeToFile: vi.fn(),
        hasCli: vi.fn(),
      } as any);

      // MergedConfig has both MCPs enabled in the manifest
      const configWithMcps: MergedConfig = {
        ...sampleMergedConfig,
        mcps: {
          "whark-trading": {
            command: "uvx",
            args: ["whark-mcp"],
            state: "enabled",
          },
          playwright: {
            command: "npx",
            args: ["-y", "@anthropic/mcp-playwright"],
            state: "enabled",
          },
        },
      };

      const result = await syncTool(toolId, configWithMcps);

      expect(result.status).toBe("synced");
      expect(writtenConfig).toBeDefined();

      // The key assertion: disabled: true from the existing tool config
      // must be preserved after the sync pipeline writes the file
      const mcpServers = writtenConfig!.mcpServers as Record<
        string,
        Record<string, unknown>
      >;
      expect(mcpServers["playwright"].disabled).toBe(true);
      expect(mcpServers["playwright"].command).toBe("npx");
      expect(mcpServers["playwright"].args).toEqual([
        "-y",
        "@anthropic/mcp-playwright",
      ]);

      // The other entry should NOT have disabled
      expect(mcpServers["whark-trading"].disabled).toBeUndefined();
      expect(mcpServers["whark-trading"].command).toBe("uvx");
    });

    it("returns error status when memory sync fails", async () => {
      const toolId: ToolId = "claude-code";

      (syncMemoryToTool as MockedFunction<typeof syncMemoryToTool>).mockResolvedValue({
        success: false,
        filesWritten: 0,
        error: "Memory sync failed",
      });

      const result = await syncTool(toolId, sampleMergedConfig);

      expect(result.status).toBe("error");
      expect(result.error).toBe("Memory sync failed");
    });
  });

  describe("loadEnvFile", () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "sync-test-"));
    });

    afterEach(async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
    });

    it("loads environment variables from .env.local", async () => {
      const envContent = `
WHARK_API_KEY=secret-key-123
ANOTHER_VAR=another-value
`;
      await fs.writeFile(path.join(tempDir, ".env.local"), envContent);

      const result = await loadEnvFile(path.join(tempDir, ".env.local"));

      expect(result.WHARK_API_KEY).toBe("secret-key-123");
      expect(result.ANOTHER_VAR).toBe("another-value");
    });

    it("returns empty object if .env.local does not exist", async () => {
      const result = await loadEnvFile(path.join(tempDir, ".env.local"));

      expect(result).toEqual({});
    });

    it("handles quoted values correctly", async () => {
      const envContent = `
QUOTED_VAR="value with spaces"
SINGLE_QUOTED='another value'
`;
      await fs.writeFile(path.join(tempDir, ".env.local"), envContent);

      const result = await loadEnvFile(path.join(tempDir, ".env.local"));

      expect(result.QUOTED_VAR).toBe("value with spaces");
      expect(result.SINGLE_QUOTED).toBe("another value");
    });

    it("ignores comments and empty lines", async () => {
      const envContent = `
# This is a comment
VALID_VAR=value

# Another comment
ANOTHER_VAR=another
`;
      await fs.writeFile(path.join(tempDir, ".env.local"), envContent);

      const result = await loadEnvFile(path.join(tempDir, ".env.local"));

      expect(result.VALID_VAR).toBe("value");
      expect(result.ANOTHER_VAR).toBe("another");
      expect(Object.keys(result)).not.toContain("#");
    });
  });
});
