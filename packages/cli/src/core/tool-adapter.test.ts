import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockExecFile, mockWriteFile, mockAppendFile, mockReadFileIfExists, mockMkdirp } = vi.hoisted(() => ({
  mockExecFile: vi.fn(),
  mockWriteFile: vi.fn().mockResolvedValue(undefined),
  mockAppendFile: vi.fn().mockResolvedValue(undefined),
  mockReadFileIfExists: vi.fn(),
  mockMkdirp: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("node:child_process", () => ({
  execFile: mockExecFile,
}));

vi.mock("node:util", () => ({
  promisify: () => mockExecFile,
}));

vi.mock("node:fs/promises", () => ({
  writeFile: mockWriteFile,
  appendFile: mockAppendFile,
  default: { writeFile: mockWriteFile, appendFile: mockAppendFile },
}));

vi.mock("@mycelish/core", async () => {
  const actual = await vi.importActual<typeof import("@mycelish/core")>("@mycelish/core");
  return {
    ...actual,
    expandPath: (p: string) => p.startsWith("~") ? `/mock/home${p.slice(1)}` : p,
  };
});

vi.mock("./fs-helpers.js", () => ({
  readFileIfExists: mockReadFileIfExists,
  mkdirp: mockMkdirp,
}));

import {
  getAdapter,
  OpenClawAdapter,
  AiderAdapter,
} from "./tool-adapter.js";
import { GenericAdapter } from "./auto-adapter.js";

const sampleMcp = {
  command: "npx",
  args: ["-y", "some-server"],
  env: { API_KEY: "test123" },
};

describe("tool-adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadFileIfExists.mockResolvedValue(null);
  });

  // -----------------------------------------------------------------------
  // getAdapter
  // -----------------------------------------------------------------------
  describe("getAdapter", () => {
    it("returns GenericAdapter for claude-code", () => {
      expect(getAdapter("claude-code")).toBeInstanceOf(GenericAdapter);
    });
    it("returns GenericAdapter for codex", () => {
      expect(getAdapter("codex")).toBeInstanceOf(GenericAdapter);
    });
    it("returns GenericAdapter for gemini-cli", () => {
      expect(getAdapter("gemini-cli")).toBeInstanceOf(GenericAdapter);
    });
    it("returns GenericAdapter for opencode", () => {
      expect(getAdapter("opencode")).toBeInstanceOf(GenericAdapter);
    });
    it("returns OpenClawAdapter for openclaw", () => {
      expect(getAdapter("openclaw")).toBeInstanceOf(OpenClawAdapter);
    });
    it("returns AiderAdapter for aider", () => {
      expect(getAdapter("aider")).toBeInstanceOf(AiderAdapter);
    });
    it("throws for unknown tool", () => {
      expect(() => getAdapter("nope")).toThrow("No adapter for tool: nope");
    });
  });

  // -----------------------------------------------------------------------
  // hasCli
  // -----------------------------------------------------------------------
  describe("hasCli", () => {
    it("returns true when CLI command exists", async () => {
      mockExecFile.mockResolvedValueOnce({ stdout: "/usr/bin/claude", stderr: "" });
      const adapter = getAdapter("claude-code");
      expect(await adapter.hasCli()).toBe(true);
      expect(mockExecFile).toHaveBeenCalledWith("which", ["claude"]);
    });

    it("returns false when CLI command does not exist", async () => {
      mockExecFile.mockRejectedValueOnce(new Error("not found"));
      const adapter = getAdapter("claude-code");
      expect(await adapter.hasCli()).toBe(false);
    });

    it("OpenCode always returns false", async () => {
      expect(await getAdapter("opencode").hasCli()).toBe(false);
    });

    it("OpenClaw always returns false", async () => {
      expect(await getAdapter("openclaw").hasCli()).toBe(false);
    });

    it("Aider always returns false", async () => {
      expect(await getAdapter("aider").hasCli()).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Claude Code CLI
  // -----------------------------------------------------------------------
  describe("Claude addViaCli", () => {
    it("calls remove then add-json with correct args", async () => {
      mockExecFile
        .mockResolvedValueOnce({ stdout: "", stderr: "" }) // remove
        .mockResolvedValueOnce({ stdout: "", stderr: "" }); // add-json

      const result = await getAdapter("claude-code").addViaCli("test-mcp", sampleMcp);

      expect(result.success).toBe(true);
      expect(result.method).toBe("cli");

      expect(mockExecFile).toHaveBeenCalledWith(
        "claude",
        ["mcp", "remove", "test-mcp"],
        { timeout: 30000 },
      );

      const expectedJson = JSON.stringify({
        type: "stdio",
        command: "npx",
        args: ["-y", "some-server"],
        env: { API_KEY: "test123" },
      });
      expect(mockExecFile).toHaveBeenCalledWith(
        "claude",
        ["mcp", "add-json", "test-mcp", expectedJson, "--scope", "user"],
        { timeout: 30000 },
      );
    });
  });

  // -----------------------------------------------------------------------
  // Codex CLI
  // -----------------------------------------------------------------------
  describe("Codex addViaCli", () => {
    it("calls codex mcp add with correct args", async () => {
      mockExecFile.mockResolvedValueOnce({ stdout: "", stderr: "" });

      const result = await getAdapter("codex").addViaCli("test-mcp", sampleMcp);

      expect(result.success).toBe(true);
      expect(mockExecFile).toHaveBeenCalledWith(
        "codex",
        ["mcp", "add", "test-mcp", "--", "npx", "-y", "some-server"],
        { timeout: 30000 },
      );
    });
  });

  // -----------------------------------------------------------------------
  // Gemini CLI
  // -----------------------------------------------------------------------
  describe("Gemini addViaCli", () => {
    it("calls gemini mcp add with correct args", async () => {
      mockExecFile.mockResolvedValueOnce({ stdout: "", stderr: "" });

      const result = await getAdapter("gemini-cli").addViaCli("test-mcp", sampleMcp);

      expect(result.success).toBe(true);
      expect(mockExecFile).toHaveBeenCalledWith(
        "gemini",
        ["mcp", "add", "test-mcp", "--command", "npx", "--args", "-y", "some-server", "-e", "API_KEY=test123", "-s", "user"],
        { timeout: 30000 },
      );
    });
  });

  describe("Gemini disableViaCli", () => {
    it("calls gemini mcp disable", async () => {
      mockExecFile.mockResolvedValueOnce({ stdout: "", stderr: "" });

      const result = await getAdapter("gemini-cli").disableViaCli("test-mcp");

      expect(result.success).toBe(true);
      expect(mockExecFile).toHaveBeenCalledWith(
        "gemini",
        ["mcp", "disable", "test-mcp"],
        { timeout: 30000 },
      );
    });
  });

  // -----------------------------------------------------------------------
  // Claude writeToFile
  // -----------------------------------------------------------------------
  describe("Claude writeToFile", () => {
    it("writes JSON with mcpServers preserving existing keys", async () => {
      mockReadFileIfExists.mockResolvedValueOnce(JSON.stringify({ existingKey: true }));

      const result = await getAdapter("claude-code").writeToFile({ "test-mcp": sampleMcp });

      expect(result.success).toBe(true);
      expect(result.method).toBe("file");

      const written = JSON.parse(mockWriteFile.mock.calls[0][1]);
      expect(written.existingKey).toBe(true);
      expect(written.mcpServers["test-mcp"]).toEqual({
        command: "npx",
        args: ["-y", "some-server"],
        env: { API_KEY: "test123" },
      });
    });
  });

  // -----------------------------------------------------------------------
  // Codex writeToFile
  // -----------------------------------------------------------------------
  describe("Codex writeToFile", () => {
    it("writes TOML format with mcp.servers sections", async () => {
      const result = await getAdapter("codex").writeToFile({ "test-mcp": sampleMcp });

      expect(result.success).toBe(true);
      const content = mockWriteFile.mock.calls[0][1] as string;
      expect(content).toContain('[mcp.servers."test-mcp"]');
      expect(content).toContain('command = "npx"');
      expect(content).toContain('args = ["-y", "some-server"]');
      expect(content).toContain('API_KEY = "test123"');
    });
  });

  // -----------------------------------------------------------------------
  // OpenCode writeToFile
  // -----------------------------------------------------------------------
  describe("OpenCode writeToFile", () => {
    it("writes JSON with mcp section using local type", async () => {
      const result = await getAdapter("opencode").writeToFile({ "test-mcp": sampleMcp });

      expect(result.success).toBe(true);
      const written = JSON.parse(mockWriteFile.mock.calls[0][1]);
      expect(written.mcp["test-mcp"]).toEqual({
        type: "local",
        command: ["npx", "-y", "some-server"],
        environment: { API_KEY: "test123" },
        enabled: true,
      });
    });
  });

  // -----------------------------------------------------------------------
  // OpenCode disableInFile
  // -----------------------------------------------------------------------
  describe("OpenCode disableInFile", () => {
    it("sets enabled to false", async () => {
      mockReadFileIfExists.mockResolvedValueOnce(
        JSON.stringify({ mcp: { "test-mcp": { type: "local", command: ["npx"], enabled: true } } }),
      );

      const result = await getAdapter("opencode").disableInFile("test-mcp");

      expect(result.success).toBe(true);
      const written = JSON.parse(mockWriteFile.mock.calls[0][1]);
      expect(written.mcp["test-mcp"].enabled).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Aider writeToFile
  // -----------------------------------------------------------------------
  describe("Aider writeToFile", () => {
    it("writes mcp-servers.json and creates conf.yml reference", async () => {
      mockReadFileIfExists.mockResolvedValue(null);

      const result = await getAdapter("aider").writeToFile({ "test-mcp": sampleMcp });

      expect(result.success).toBe(true);

      // First writeFile: mcp-servers.json
      const mcpJson = JSON.parse(mockWriteFile.mock.calls[0][1]);
      expect(mcpJson.mcpServers["test-mcp"]).toEqual({
        type: "stdio",
        command: "npx",
        args: ["-y", "some-server"],
        env: { API_KEY: "test123" },
      });

      // Second writeFile: .aider.conf.yml
      expect(mockWriteFile.mock.calls[1][1]).toContain("mcp-servers-file:");
    });

    it("appends conf.yml reference if file exists without it", async () => {
      mockReadFileIfExists.mockResolvedValue("some-other-setting: true\n");

      await getAdapter("aider").writeToFile({ "test-mcp": sampleMcp });

      expect(mockAppendFile).toHaveBeenCalledWith(
        "/mock/home/.aider.conf.yml",
        expect.stringContaining("mcp-servers-file:"),
      );
    });
  });

  // -----------------------------------------------------------------------
  // syncAll routing
  // -----------------------------------------------------------------------
  describe("syncAll routing", () => {
    it("uses CLI when hasCli returns true", async () => {
      mockExecFile
        .mockResolvedValueOnce({ stdout: "/usr/bin/claude", stderr: "" }) // which
        .mockResolvedValueOnce({ stdout: "", stderr: "" }) // remove
        .mockResolvedValueOnce({ stdout: "", stderr: "" }); // add-json

      const result = await getAdapter("claude-code").syncAll({ "test-mcp": sampleMcp });

      expect(result.success).toBe(true);
      expect(result.method).toBe("cli");
    });

    it("falls back to writeToFile when hasCli returns false", async () => {
      const result = await getAdapter("opencode").syncAll({ "test-mcp": sampleMcp });

      expect(result.success).toBe(true);
      expect(result.method).toBe("file");
      expect(mockWriteFile).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Error handling
  // -----------------------------------------------------------------------
  describe("error handling", () => {
    it("returns error result when CLI fails", async () => {
      mockExecFile
        .mockRejectedValueOnce(new Error("remove failed"))
        .mockRejectedValueOnce(new Error("CLI add failed"));

      const result = await getAdapter("claude-code").addViaCli("test-mcp", sampleMcp);

      expect(result.success).toBe(false);
      expect(result.error).toContain("CLI add failed");
    });
  });
});
