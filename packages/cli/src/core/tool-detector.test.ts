/**
 * Tool Detector Tests - Written FIRST following TDD
 * Detects which AI coding tools are installed on the system
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { execFileSync } from "child_process";
import { existsSync } from "node:fs";

// Mock child_process
vi.mock("child_process", () => ({
  execFileSync: vi.fn(),
}));

// Mock fs.existsSync for config-path fallback detection
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, existsSync: vi.fn(() => false) };
});

const mockExecFileSync = vi.mocked(execFileSync);
const mockExistsSync = vi.mocked(existsSync);

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
      mockExecFileSync.mockImplementation((_cmd: any, args?: any) => {
        if (args && args[0] === "claude") {
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
      mockExecFileSync.mockImplementation((_cmd: any, args?: any) => {
        if (args && args[0] === "codex") {
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
      mockExecFileSync.mockImplementation((_cmd: any, args?: any) => {
        if (args && args[0] === "gemini") {
          return Buffer.from("/usr/local/bin/gemini");
        }
        throw new Error("Command not found");
      });

      const tools = await detectInstalledTools();
      const gemini = tools.find((t) => t.id === "gemini-cli");

      expect(gemini).toBeDefined();
      expect(gemini?.installed).toBe(true);
    });

    it("marks tool as not installed when command not found and no config", async () => {
      const { detectInstalledTools } = await import("./tool-detector");
      mockExecFileSync.mockImplementation(() => {
        throw new Error("Command not found");
      });
      mockExistsSync.mockReturnValue(false);

      const tools = await detectInstalledTools();
      const opencode = tools.find((t) => t.id === "opencode");

      expect(opencode).toBeDefined();
      expect(opencode?.installed).toBe(false);
    });

    it("detects tools with cli:null via detectPath existence", async () => {
      const { detectInstalledTools } = await import("./tool-detector");
      mockExecFileSync.mockImplementation(() => {
        throw new Error("Command not found");
      });
      // OpenCode has cli:null + detectPath — detect via config file
      mockExistsSync.mockReturnValue(true);

      const tools = await detectInstalledTools();
      const opencode = tools.find((t) => t.id === "opencode");

      expect(opencode?.installed).toBe(true);
    });

    it("returns all supported tools with their installation status", async () => {
      const { detectInstalledTools } = await import("./tool-detector");
      mockExecFileSync.mockImplementation((_cmd: any, args?: any) => {
        if (args && (args[0] === "claude" || args[0] === "codex")) {
          return Buffer.from("/usr/local/bin/tool");
        }
        throw new Error("Command not found");
      });

      const tools = await detectInstalledTools();

      expect(tools).toHaveLength(8);
      expect(tools.map((t) => t.id)).toEqual([
        "claude-code",
        "codex",
        "gemini-cli",
        "opencode",
        "openclaw",
        "cursor",
        "vscode",
        "antigravity",
      ]);
    });
  });

  describe("isToolInstalled", () => {
    it("returns true when tool command exists", async () => {
      const { isToolInstalled } = await import("./tool-detector");
      mockExecFileSync.mockReturnValue(Buffer.from("/usr/local/bin/claude"));

      const result = await isToolInstalled("claude-code");
      expect(result).toBe(true);
    });

    it("returns false when tool command not found and no config", async () => {
      const { isToolInstalled } = await import("./tool-detector");
      mockExecFileSync.mockImplementation(() => {
        throw new Error("Command not found");
      });
      mockExistsSync.mockReturnValue(false);

      const result = await isToolInstalled("opencode");
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
        detectPath: "",
      });
    });

    it("returns undefined for unknown tool", async () => {
      const { getToolInfo } = await import("./tool-detector");

      const info = getToolInfo("unknown-tool");
      expect(info).toBeUndefined();
    });
  });
});
