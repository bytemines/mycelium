/**
 * Tests for status command - written FIRST following TDD
 *
 * The status command shows sync status of all tools including:
 * - Skills count
 * - MCPs count
 * - Memory files count
 * - Sync status (synced, pending, error, disabled)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";

// Test directory for isolated tests
const testDir = `/tmp/mycelium-status-test-${Date.now()}`;
const mockMyceliumDir = `${testDir}/.mycelium`;
const mockToolsDir = `${testDir}/tools`;

// Helper to create mock file structure
async function createMockStructure(
  basePath: string,
  structure: Record<string, string | null>
): Promise<void> {
  for (const [filePath, content] of Object.entries(structure)) {
    const fullPath = path.join(basePath, filePath);
    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });
    if (content !== null) {
      await fs.writeFile(fullPath, content, "utf-8");
    }
  }
}

describe("status command", () => {
  beforeEach(async () => {
    // Create test directories
    await fs.mkdir(mockMyceliumDir, { recursive: true });
    await fs.mkdir(mockToolsDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directories
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("getToolStatus", () => {
    it("returns status for a specific tool", async () => {
      const { getToolStatusFromPath } = await import("./status.js");

      // Create minimal structure for claude-code
      const toolDir = `${mockToolsDir}/claude`;
      await createMockStructure(toolDir, {
        "skills/.gitkeep": "",
      });
      await createMockStructure(mockMyceliumDir, {
        "mcps.json": JSON.stringify({ mcps: {} }),
      });

      const status = await getToolStatusFromPath("claude-code", {
        myceliumPath: mockMyceliumDir,
        toolSkillsPath: `${toolDir}/skills`,
        toolMcpPath: `${toolDir}/mcp.json`,
        toolMemoryPath: `${toolDir}/CLAUDE.md`,
      });

      expect(status.tool).toBe("claude-code");
      expect(status.status).toBeDefined();
      expect(typeof status.skillsCount).toBe("number");
      expect(typeof status.mcpsCount).toBe("number");
      expect(Array.isArray(status.memoryFiles)).toBe(true);
    });

    it("counts skills correctly", async () => {
      const { getToolStatusFromPath } = await import("./status.js");

      // Create skills in mycelium and tool directory
      const toolDir = `${mockToolsDir}/claude`;
      const skillsDir = `${toolDir}/skills`;
      await fs.mkdir(skillsDir, { recursive: true });

      // Create source skill directories
      const skill1Source = `${mockMyceliumDir}/skills/skill1`;
      const skill2Source = `${mockMyceliumDir}/skills/skill2`;
      const skill3Source = `${mockMyceliumDir}/skills/skill3`;
      await createMockStructure(mockMyceliumDir, {
        "skills/skill1/skill.md": "# Skill 1",
        "skills/skill2/skill.md": "# Skill 2",
        "skills/skill3/skill.md": "# Skill 3",
        "mcps.json": JSON.stringify({ mcps: {} }),
      });

      // Create symlinks to simulate synced skills
      await fs.symlink(skill1Source, `${skillsDir}/skill1`);
      await fs.symlink(skill2Source, `${skillsDir}/skill2`);
      await fs.symlink(skill3Source, `${skillsDir}/skill3`);

      const status = await getToolStatusFromPath("claude-code", {
        myceliumPath: mockMyceliumDir,
        toolSkillsPath: skillsDir,
        toolMcpPath: `${toolDir}/mcp.json`,
        toolMemoryPath: `${toolDir}/CLAUDE.md`,
      });

      expect(status.skillsCount).toBe(3);
    });

    it("counts MCPs correctly", async () => {
      const { getToolStatusFromPath } = await import("./status.js");

      // Create MCPs config
      const toolDir = `${mockToolsDir}/claude`;
      await createMockStructure(mockMyceliumDir, {
        "mcps.json": JSON.stringify({
          mcps: {
            "mcp-server-1": { command: "npx", args: ["-y", "mcp-server-1"] },
            "mcp-server-2": { command: "npx", args: ["-y", "mcp-server-2"] },
            "mcp-server-3": { command: "npx", args: ["-y", "mcp-server-3"] },
            "mcp-server-4": { command: "npx", args: ["-y", "mcp-server-4"] },
            "mcp-server-5": { command: "npx", args: ["-y", "mcp-server-5"] },
            "mcp-server-6": { command: "npx", args: ["-y", "mcp-server-6"] },
            "mcp-server-7": { command: "npx", args: ["-y", "mcp-server-7"] },
            "mcp-server-8": { command: "npx", args: ["-y", "mcp-server-8"] },
          },
        }),
      });
      await createMockStructure(toolDir, {
        "mcp.json": JSON.stringify({
          mcpServers: {
            "mcp-server-1": { command: "npx", args: ["-y", "mcp-server-1"] },
            "mcp-server-2": { command: "npx", args: ["-y", "mcp-server-2"] },
            "mcp-server-3": { command: "npx", args: ["-y", "mcp-server-3"] },
            "mcp-server-4": { command: "npx", args: ["-y", "mcp-server-4"] },
            "mcp-server-5": { command: "npx", args: ["-y", "mcp-server-5"] },
            "mcp-server-6": { command: "npx", args: ["-y", "mcp-server-6"] },
            "mcp-server-7": { command: "npx", args: ["-y", "mcp-server-7"] },
            "mcp-server-8": { command: "npx", args: ["-y", "mcp-server-8"] },
          },
        }),
        "skills/.gitkeep": "",
      });

      const status = await getToolStatusFromPath("claude-code", {
        myceliumPath: mockMyceliumDir,
        toolSkillsPath: `${toolDir}/skills`,
        toolMcpPath: `${toolDir}/mcp.json`,
        toolMemoryPath: `${toolDir}/CLAUDE.md`,
      });

      expect(status.mcpsCount).toBe(8);
    });

    it("counts memory files correctly", async () => {
      const { getToolStatusFromPath } = await import("./status.js");

      // Create memory files
      const toolDir = `${mockToolsDir}/claude`;
      await createMockStructure(mockMyceliumDir, {
        "global/memory/shared/memory1.md": "# Memory 1",
        "global/memory/shared/memory2.md": "# Memory 2",
        "global/memory/coding/coding1.md": "# Coding 1",
        "mcps.json": JSON.stringify({ mcps: {} }),
      });
      await createMockStructure(toolDir, {
        "CLAUDE.md": "# Concatenated memory",
        "skills/.gitkeep": "",
      });

      const status = await getToolStatusFromPath("claude-code", {
        myceliumPath: mockMyceliumDir,
        toolSkillsPath: `${toolDir}/skills`,
        toolMcpPath: `${toolDir}/mcp.json`,
        toolMemoryPath: `${toolDir}/CLAUDE.md`,
      });

      // claude-code gets shared + coding scopes = 3 files
      expect(status.memoryFiles.length).toBe(3);
    });

    it("returns 'disabled' for disabled tools", async () => {
      const { getToolStatusFromPath } = await import("./status.js");

      // Create minimal structure with disabled flag
      const toolDir = `${mockToolsDir}/gemini`;
      await createMockStructure(mockMyceliumDir, {
        "manifest.json": JSON.stringify({
          version: "1.0.0",
          tools: {
            "gemini-cli": { enabled: false },
          },
        }),
        "mcps.json": JSON.stringify({ mcps: {} }),
      });

      const status = await getToolStatusFromPath("gemini-cli", {
        myceliumPath: mockMyceliumDir,
        toolSkillsPath: `${toolDir}/skills`,
        toolMcpPath: `${toolDir}/mcp.json`,
        toolMemoryPath: `${toolDir}/GEMINI.md`,
        isDisabled: true,
      });

      expect(status.status).toBe("disabled");
    });

    it("returns 'pending' when tool has not been synced", async () => {
      const { getToolStatusFromPath } = await import("./status.js");

      // Create minimal structure without tool directory
      await createMockStructure(mockMyceliumDir, {
        "mcps.json": JSON.stringify({ mcps: {} }),
      });

      const toolDir = `${mockToolsDir}/claude`;
      // Tool directory doesn't exist - pending status

      const status = await getToolStatusFromPath("claude-code", {
        myceliumPath: mockMyceliumDir,
        toolSkillsPath: `${toolDir}/skills`,
        toolMcpPath: `${toolDir}/mcp.json`,
        toolMemoryPath: `${toolDir}/CLAUDE.md`,
      });

      expect(status.status).toBe("pending");
      expect(status.skillsCount).toBe(0);
    });
  });

  describe("getAllStatus", () => {
    it("returns status for all tools", async () => {
      const { getAllStatusFromPath } = await import("./status.js");

      // Create minimal structure
      await createMockStructure(mockMyceliumDir, {
        "mcps.json": JSON.stringify({ mcps: {} }),
        "manifest.json": JSON.stringify({
          version: "1.0.0",
          tools: {},
        }),
      });

      const statuses = await getAllStatusFromPath(mockMyceliumDir);

      // Should have status for all supported tools
      expect(statuses.length).toBe((await import("@mycelish/core")).ALL_TOOL_IDS.length);

      // Verify all tool IDs are present
      const toolIds = statuses.map((s) => s.tool);
      expect(toolIds).toContain("claude-code");
      expect(toolIds).toContain("codex");
      expect(toolIds).toContain("gemini-cli");
      expect(toolIds).toContain("opencode");
      expect(toolIds).toContain("openclaw");
      expect(toolIds).toContain("aider");
    });
  });

  describe("formatStatusOutput", () => {
    it("formats status for terminal output", async () => {
      const { formatStatusOutput } = await import("./status.js");

      const statuses = [
        {
          tool: "claude-code" as const,
          status: "synced" as const,
          skillsCount: 12,
          mcpsCount: 8,
          memoryFiles: ["memory1.md", "memory2.md", "memory3.md"],
        },
        {
          tool: "gemini-cli" as const,
          status: "disabled" as const,
          skillsCount: 0,
          mcpsCount: 0,
          memoryFiles: [],
        },
      ];

      const output = formatStatusOutput(statuses);

      expect(output).toContain("Mycelium Status");
      expect(output).toContain("Tools:");
      expect(output).toContain("Claude Code");
      expect(output).toContain("Skills: 12");
      expect(output).toContain("MCPs: 8");
      expect(output).toContain("Memory: 3 files");
      expect(output).toContain("Gemini CLI");
      expect(output).toContain("disabled");
    });

    it("uses ANSI colors for status indicators", async () => {
      const { formatStatusOutput } = await import("./status.js");

      const statuses = [
        {
          tool: "claude-code" as const,
          status: "synced" as const,
          skillsCount: 12,
          mcpsCount: 8,
          memoryFiles: ["m1.md"],
        },
        {
          tool: "codex" as const,
          status: "pending" as const,
          skillsCount: 0,
          mcpsCount: 0,
          memoryFiles: [],
        },
        {
          tool: "gemini-cli" as const,
          status: "error" as const,
          skillsCount: 0,
          mcpsCount: 0,
          memoryFiles: [],
          error: "Config not found",
        },
        {
          tool: "opencode" as const,
          status: "disabled" as const,
          skillsCount: 0,
          mcpsCount: 0,
          memoryFiles: [],
        },
      ];

      const output = formatStatusOutput(statuses);

      // Check for ANSI color codes
      // Green for synced: \u001b[32m
      expect(output).toContain("\u001b[32m");
      // Yellow for pending: \u001b[33m
      expect(output).toContain("\u001b[33m");
      // Red for error: \u001b[31m
      expect(output).toContain("\u001b[31m");
      // Gray for disabled: \u001b[90m
      expect(output).toContain("\u001b[90m");
    });

    it("shows [disabled] marker for disabled items", async () => {
      const { formatStatusOutput } = await import("./status.js");

      const statuses = [
        {
          tool: "claude-code" as const,
          status: "synced" as const,
          skillsCount: 5,
          mcpsCount: 3,
          memoryFiles: ["m1.md"],
          itemState: "disabled" as const,
        },
      ];

      const output = formatStatusOutput(statuses);

      expect(output).toContain("[disabled]");
    });

    it("hides deleted items by default", async () => {
      const { formatStatusOutput } = await import("./status.js");

      const statuses = [
        {
          tool: "claude-code" as const,
          status: "synced" as const,
          skillsCount: 5,
          mcpsCount: 3,
          memoryFiles: ["m1.md"],
          itemState: "deleted" as const,
        },
        {
          tool: "codex" as const,
          status: "synced" as const,
          skillsCount: 2,
          mcpsCount: 1,
          memoryFiles: [],
        },
      ];

      const output = formatStatusOutput(statuses);

      expect(output).not.toContain("Claude Code");
      expect(output).toContain("Codex");
    });

    it("shows deleted items with [deleted] marker when --all is passed", async () => {
      const { formatStatusOutput } = await import("./status.js");

      const statuses = [
        {
          tool: "claude-code" as const,
          status: "synced" as const,
          skillsCount: 5,
          mcpsCount: 3,
          memoryFiles: ["m1.md"],
          itemState: "deleted" as const,
        },
      ];

      const output = formatStatusOutput(statuses, { showAll: true });

      expect(output).toContain("Claude Code");
      expect(output).toContain("[deleted]");
    });

    it("shows global and project config paths", async () => {
      const { formatStatusOutput } = await import("./status.js");

      const statuses = [
        {
          tool: "claude-code" as const,
          status: "synced" as const,
          skillsCount: 12,
          mcpsCount: 8,
          memoryFiles: [],
        },
      ];

      const output = formatStatusOutput(statuses, {
        globalConfigPath: "~/.mycelium/",
        projectConfigPath: ".mycelium/",
        projectConfigExists: false,
      });

      expect(output).toContain("Global Config: ~/.mycelium/");
      expect(output).toContain("Project Config: .mycelium/");
      expect(output).toContain("(not found)");
    });
  });

  describe("statusCommand", () => {
    it("exports a Commander.js command", async () => {
      const { statusCommand } = await import("./status.js");

      expect(statusCommand).toBeDefined();
      expect(statusCommand.name()).toBe("status");
    });

    it("has JSON output option", async () => {
      const { statusCommand } = await import("./status.js");

      const jsonOption = statusCommand.options.find(
        (opt) => opt.short === "-j" || opt.long === "--json"
      );
      expect(jsonOption).toBeDefined();
    });

    it("has --all option", async () => {
      const { statusCommand } = await import("./status.js");

      const allOption = statusCommand.options.find(
        (opt) => opt.short === "-a" || opt.long === "--all"
      );
      expect(allOption).toBeDefined();
    });

    it("has verbose output option", async () => {
      const { statusCommand } = await import("./status.js");

      const verboseOption = statusCommand.options.find(
        (opt) => opt.short === "-v" || opt.long === "--verbose"
      );
      expect(verboseOption).toBeDefined();
    });
  });
});
