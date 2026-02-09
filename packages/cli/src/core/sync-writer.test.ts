/**
 * Tests for sync-writer module
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type { McpServerConfig } from "@mycelish/core";

vi.mock("node:fs/promises");

const mockSyncAll = vi.fn().mockResolvedValue({ success: true });
vi.mock("./tool-adapter.js", () => ({
  getAdapter: vi.fn((toolId: string) => {
    const known = ["claude-code", "codex", "gemini-cli", "opencode", "openclaw", "aider"];
    if (!known.includes(toolId)) throw new Error(`No adapter for tool: ${toolId}`);
    return {
      syncAll: mockSyncAll,
      syncOne: vi.fn().mockResolvedValue({ success: true }),
    };
  }),
}));

import {
  syncToTool,
  backupConfig,
  restoreBackups,
  dryRunSync,
} from "./sync-writer.js";

const mockFs = vi.mocked(fs);
const home = os.homedir();

const sampleMcps: Record<string, McpServerConfig> = {
  "whark-trading": {
    command: "uvx",
    args: ["whark-mcp"],
    env: { API_KEY: "test123" },
  },
  playwright: {
    command: "npx",
    args: ["@anthropic/mcp-playwright"],
  },
};

describe("sync-writer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.copyFile.mockResolvedValue(undefined);
    mockFs.unlink.mockResolvedValue(undefined);
    mockSyncAll.mockResolvedValue({ success: true });
  });

  describe("backupConfig", () => {
    it("copies file to .mycelium-backup", async () => {
      const result = await backupConfig("/home/.claude.json");
      expect(mockFs.copyFile).toHaveBeenCalledWith(
        "/home/.claude.json",
        "/home/.claude.json.mycelium-backup",
      );
      expect(result).toBe("/home/.claude.json.mycelium-backup");
    });
  });

  describe("restoreBackups", () => {
    it("restores backup files and removes them", async () => {
      mockFs.readdir.mockImplementation(async (dir) => {
        const d = String(dir).replace(/\/$/, "");
        if (d === home) {
          return [".claude.json.mycelium-backup"] as any;
        }
        throw new Error("no dir");
      });

      const result = await restoreBackups();
      expect(result.restored).toContain(path.join(home, ".claude.json"));
      expect(mockFs.copyFile).toHaveBeenCalled();
      expect(mockFs.unlink).toHaveBeenCalled();
    });
  });

  describe("syncToTool", () => {
    it("dispatches to adapter for claude-code", async () => {
      const result = await syncToTool("claude-code", sampleMcps);
      expect(result.success).toBe(true);
      expect(result.configPath).toContain(".claude.json");
      expect(mockSyncAll).toHaveBeenCalledWith(sampleMcps);
    });

    it("dispatches to adapter for codex", async () => {
      const result = await syncToTool("codex", sampleMcps);
      expect(result.success).toBe(true);
      expect(result.configPath).toContain("config.toml");
      expect(mockSyncAll).toHaveBeenCalledWith(sampleMcps);
    });

    it("dispatches to adapter for opencode", async () => {
      const result = await syncToTool("opencode", sampleMcps);
      expect(result.success).toBe(true);
      expect(mockSyncAll).toHaveBeenCalledWith(sampleMcps);
    });

    it("dispatches to adapter for openclaw", async () => {
      const result = await syncToTool("openclaw", sampleMcps);
      expect(result.success).toBe(true);
      expect(mockSyncAll).toHaveBeenCalledWith(sampleMcps);
    });

    it("dispatches to adapter for gemini-cli", async () => {
      const result = await syncToTool("gemini-cli", sampleMcps);
      expect(result.success).toBe(true);
      expect(mockSyncAll).toHaveBeenCalledWith(sampleMcps);
    });

    it("returns error for unsupported tool", async () => {
      const result = await syncToTool("unknown-tool" as any, sampleMcps);
      expect(result.success).toBe(false);
      expect(result.error).toContain("Unsupported");
    });

    it("returns error when adapter fails", async () => {
      mockSyncAll.mockResolvedValueOnce({ success: false, error: "Write failed" });
      const result = await syncToTool("claude-code", sampleMcps);
      expect(result.success).toBe(false);
      expect(result.error).toBe("Write failed");
    });

    it("writes hooks for claude-code when provided", async () => {
      mockFs.readFile.mockRejectedValue(new Error("ENOENT"));
      const hooks = [
        { name: "test-hook", source: "claude-code" as const, event: "PostToolUse" as const, command: "echo test", matchers: ["Bash"] },
      ];
      const result = await syncToTool("claude-code", sampleMcps, hooks);
      expect(result.success).toBe(true);
      // hooks are written to settings.json
      expect(mockFs.writeFile).toHaveBeenCalled();
    });
  });

  describe("dryRunSync", () => {
    it("shows changes without writing", async () => {
      mockFs.readFile.mockResolvedValue(
        JSON.stringify({ mcpServers: { old: { command: "old" } } }),
      );

      const result = await dryRunSync("claude-code", sampleMcps);
      expect(result.currentContent).toBeTruthy();
      expect(result.newContent).toContain("whark-trading");
      // Should NOT have written anything
      expect(mockFs.writeFile).not.toHaveBeenCalled();
      expect(mockFs.copyFile).not.toHaveBeenCalled();
    });

    it("handles missing config file", async () => {
      mockFs.readFile.mockRejectedValue(new Error("ENOENT"));

      const result = await dryRunSync("opencode", sampleMcps);
      expect(result.currentContent).toBeNull();
      expect(result.newContent).toContain("whark-trading");
    });
  });
});
