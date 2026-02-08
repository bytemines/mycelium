/**
 * Tests for sync-writer module
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type { McpServerConfig, ScannedHook } from "@mycelium/core";

vi.mock("node:fs/promises");

vi.mock("./tool-adapter.js", () => ({
  getAdapter: vi.fn((toolId: string) => {
    const known = ["claude-code", "codex", "gemini-cli", "opencode", "openclaw", "aider"];
    if (!known.includes(toolId)) throw new Error(`No adapter for tool: ${toolId}`);
    return {
      syncAll: vi.fn().mockResolvedValue({ success: true }),
      syncOne: vi.fn().mockResolvedValue({ success: true }),
    };
  }),
}));

import {
  syncToTool,
  backupConfig,
  restoreBackups,
  dryRunSync,
  writeClaudeCode,
  writeCodex,
  writeGemini,
  writeOpenClaw,
  writeOpenCode,
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
        if (String(dir) === home) {
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

  describe("writeClaudeCode", () => {
    it("writes mcpServers preserving other keys", async () => {
      mockFs.readFile.mockResolvedValue(
        JSON.stringify({ someOther: "value", mcpServers: { old: {} } }),
      );

      const result = await writeClaudeCode(sampleMcps);
      expect(result.success).toBe(true);
      expect(result.sectionsUpdated).toContain("mcpServers");

      const written = JSON.parse(
        mockFs.writeFile.mock.calls[0][1] as string,
      );
      expect(written.someOther).toBe("value");
      expect(written.mcpServers["whark-trading"].command).toBe("uvx");
      expect(written.mcpServers["whark-trading"].env.API_KEY).toBe("test123");
      expect(written.mcpServers.playwright.command).toBe("npx");
      expect(written.mcpServers.old).toBeUndefined();
    });

    it("creates backup before writing", async () => {
      mockFs.readFile.mockResolvedValue(JSON.stringify({ mcpServers: {} }));
      await writeClaudeCode(sampleMcps);
      expect(mockFs.copyFile).toHaveBeenCalled();
    });

    it("handles missing config (creates new)", async () => {
      mockFs.readFile.mockRejectedValue(new Error("ENOENT"));
      const result = await writeClaudeCode(sampleMcps);
      expect(result.success).toBe(true);
      expect(result.backupPath).toBe("");
    });

    it("writes hooks to settings.json when provided", async () => {
      mockFs.readFile.mockImplementation(async (p) => {
        if (String(p).includes("settings.json")) {
          return JSON.stringify({ existingSetting: true });
        }
        return JSON.stringify({ mcpServers: {} });
      });

      const hooks: ScannedHook[] = [
        { name: "test-hook", source: "claude-code", event: "PostToolUse", command: "echo test", matchers: ["Bash"] },
      ];

      const result = await writeClaudeCode(sampleMcps, hooks);
      expect(result.sectionsUpdated).toContain("hooks");
      // Two writeFile calls: claude.json + settings.json
      expect(mockFs.writeFile).toHaveBeenCalledTimes(2);
    });
  });

  describe("writeCodex", () => {
    it("generates correct TOML format", async () => {
      mockFs.readFile.mockRejectedValue(new Error("ENOENT"));
      const result = await writeCodex(sampleMcps);
      expect(result.success).toBe(true);
      expect(result.sectionsUpdated).toContain("mcp.servers");

      const content = mockFs.writeFile.mock.calls[0][1] as string;
      expect(content).toContain('[mcp.servers."whark-trading"]');
      expect(content).toContain('command = "uvx"');
      expect(content).toContain('args = ["whark-mcp"]');
      expect(content).toContain('[mcp.servers."whark-trading".env]');
      expect(content).toContain('API_KEY = "test123"');
      expect(content).toContain('[mcp.servers."playwright"]');
    });

    it("preserves non-MCP TOML sections", async () => {
      mockFs.readFile.mockResolvedValue(
        `[general]\nmodel = "gpt-4"\n\n[mcp.servers."old"]\ncommand = "old"\n`,
      );
      const result = await writeCodex(sampleMcps);
      expect(result.success).toBe(true);

      const content = mockFs.writeFile.mock.calls[0][1] as string;
      expect(content).toContain("[general]");
      expect(content).toContain('model = "gpt-4"');
      expect(content).not.toContain('"old"');
    });
  });

  describe("writeGemini", () => {
    it("writes memory content", async () => {
      mockFs.readFile.mockRejectedValue(new Error("ENOENT"));
      const result = await writeGemini("# My Memory\nSome content");
      expect(result.success).toBe(true);
      expect(result.sectionsUpdated).toContain("memory");
      expect(mockFs.writeFile.mock.calls[0][1]).toBe("# My Memory\nSome content");
    });
  });

  describe("writeOpenClaw", () => {
    it("replaces only mcp-adapter entries in plugins", async () => {
      mockFs.readFile.mockResolvedValue(
        JSON.stringify({
          version: "1.0",
          plugins: {
            entries: [
              { name: "other-plugin", type: "custom", enabled: true },
              { name: "old-mcp", type: "mcp-adapter", enabled: true },
            ],
          },
        }),
      );

      const result = await writeOpenClaw(sampleMcps);
      expect(result.success).toBe(true);
      expect(result.sectionsUpdated).toContain("plugins");

      const written = JSON.parse(mockFs.writeFile.mock.calls[0][1] as string);
      expect(written.version).toBe("1.0");
      const entries = written.plugins.entries;
      // Should keep custom plugin, remove old mcp-adapter, add new ones
      expect(entries.find((e: any) => e.name === "other-plugin")).toBeTruthy();
      expect(entries.find((e: any) => e.name === "old-mcp")).toBeUndefined();
      expect(entries.find((e: any) => e.name === "whark-trading")).toBeTruthy();
    });
  });

  describe("writeOpenCode", () => {
    it("writes mcpServers preserving other keys", async () => {
      mockFs.readFile.mockResolvedValue(
        JSON.stringify({ theme: "dark", mcpServers: { old: {} } }),
      );

      const result = await writeOpenCode(sampleMcps);
      expect(result.success).toBe(true);

      const written = JSON.parse(mockFs.writeFile.mock.calls[0][1] as string);
      expect(written.theme).toBe("dark");
      expect(written.mcpServers["whark-trading"]).toBeTruthy();
      expect(written.mcpServers.old).toBeUndefined();
    });
  });

  describe("syncToTool", () => {
    it("dispatches to correct writer", async () => {
      mockFs.readFile.mockRejectedValue(new Error("ENOENT"));
      const result = await syncToTool("claude-code", sampleMcps);
      expect(result.success).toBe(true);
      expect(result.configPath).toContain(".claude.json");
    });

    it("returns error for unsupported tool", async () => {
      const result = await syncToTool("unknown-tool" as any, sampleMcps);
      expect(result.success).toBe(false);
      expect(result.error).toContain("Unsupported");
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
