/**
 * Tool Detector Tests - Written FIRST following TDD
 * Detects which AI coding tools are installed on the system
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { execSync } from "child_process";

// Mock child_process
vi.mock("child_process", () => ({
  execSync: vi.fn(),
}));

const mockExecSync = vi.mocked(execSync);

describe("ToolDetector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("detectInstalledTools", () => {
    it("detects Claude Code when claude command exists", async () => {
      const { detectInstalledTools } = await import("./tool-detector");
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd === "which claude" || cmd === "where claude") {
          return Buffer.from("/usr/local/bin/claude");
        }
        throw new Error("Command not found");
      });

      const tools = await detectInstalledTools();
      const claudeCode = tools.find((t) => t.id === "claude-code");

      expect(claudeCode).toBeDefined();
      expect(claudeCode?.installed).toBe(true);
    });

    it("detects Codex CLI when codex command exists", async () => {
      const { detectInstalledTools } = await import("./tool-detector");
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd === "which codex" || cmd === "where codex") {
          return Buffer.from("/usr/local/bin/codex");
        }
        throw new Error("Command not found");
      });

      const tools = await detectInstalledTools();
      const codex = tools.find((t) => t.id === "codex");

      expect(codex).toBeDefined();
      expect(codex?.installed).toBe(true);
    });

    it("detects Gemini CLI when gemini command exists", async () => {
      const { detectInstalledTools } = await import("./tool-detector");
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd === "which gemini" || cmd === "where gemini") {
          return Buffer.from("/usr/local/bin/gemini");
        }
        throw new Error("Command not found");
      });

      const tools = await detectInstalledTools();
      const gemini = tools.find((t) => t.id === "gemini");

      expect(gemini).toBeDefined();
      expect(gemini?.installed).toBe(true);
    });

    it("marks tool as not installed when command not found", async () => {
      const { detectInstalledTools } = await import("./tool-detector");
      mockExecSync.mockImplementation(() => {
        throw new Error("Command not found");
      });

      const tools = await detectInstalledTools();
      const aider = tools.find((t) => t.id === "aider");

      expect(aider).toBeDefined();
      expect(aider?.installed).toBe(false);
    });

    it("returns all supported tools with their installation status", async () => {
      const { detectInstalledTools } = await import("./tool-detector");
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes("claude") || cmd.includes("codex")) {
          return Buffer.from("/usr/local/bin/tool");
        }
        throw new Error("Command not found");
      });

      const tools = await detectInstalledTools();

      expect(tools).toHaveLength(6);
      expect(tools.map((t) => t.id)).toEqual([
        "claude-code",
        "codex",
        "gemini",
        "opencode",
        "openclaw",
        "aider",
      ]);
    });
  });

  describe("isToolInstalled", () => {
    it("returns true when tool command exists", async () => {
      const { isToolInstalled } = await import("./tool-detector");
      mockExecSync.mockReturnValue(Buffer.from("/usr/local/bin/claude"));

      const result = await isToolInstalled("claude-code");
      expect(result).toBe(true);
    });

    it("returns false when tool command not found", async () => {
      const { isToolInstalled } = await import("./tool-detector");
      mockExecSync.mockImplementation(() => {
        throw new Error("Command not found");
      });

      const result = await isToolInstalled("aider");
      expect(result).toBe(false);
    });
  });

  describe("getToolInfo", () => {
    it("returns tool info with name and command", async () => {
      const { getToolInfo } = await import("./tool-detector");

      const info = getToolInfo("claude-code");
      expect(info).toEqual({
        id: "claude-code",
        name: "Claude Code",
        command: "claude",
        configPath: expect.stringContaining(".claude"),
      });
    });

    it("returns undefined for unknown tool", async () => {
      const { getToolInfo } = await import("./tool-detector");

      const info = getToolInfo("unknown-tool");
      expect(info).toBeUndefined();
    });
  });
});
