import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockExecFile, mockWriteFile, mockReadFileIfExists, mockMkdirp } = vi.hoisted(() => ({
  mockExecFile: vi.fn(),
  mockWriteFile: vi.fn().mockResolvedValue(undefined),
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
  appendFile: vi.fn().mockResolvedValue(undefined),
  default: { writeFile: mockWriteFile, appendFile: vi.fn() },
}));

vi.mock("@mycelium/core", async () => {
  const actual = await vi.importActual<typeof import("@mycelium/core")>("@mycelium/core");
  return {
    ...actual,
    expandPath: (p: string) => p.startsWith("~") ? `/mock/home${p.slice(1)}` : p,
  };
});

vi.mock("./fs-helpers.js", () => ({
  readFileIfExists: mockReadFileIfExists,
  mkdirp: mockMkdirp,
}));

import { GenericAdapter } from "./auto-adapter.js";
import { getAdapter, createAdapter, OpenClawAdapter, AiderAdapter } from "./tool-adapter.js";
import { TOOL_REGISTRY, ALL_TOOL_IDS } from "@mycelium/core";

const sampleMcp = {
  command: "npx",
  args: ["-y", "some-server"],
  env: { API_KEY: "test123" },
};

describe("auto-adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadFileIfExists.mockResolvedValue(null);
  });

  describe("shapeEntry", () => {
    it("shapes standard entry (no type field)", () => {
      const adapter = new GenericAdapter(TOOL_REGISTRY["claude-code"]);
      expect(adapter.shapeEntry(sampleMcp)).toEqual({
        command: "npx",
        args: ["-y", "some-server"],
        env: { API_KEY: "test123" },
      });
    });

    it("shapes vscode entry with type: stdio", () => {
      const adapter = new GenericAdapter(TOOL_REGISTRY["vscode"]);
      expect(adapter.shapeEntry(sampleMcp)).toEqual({
        type: "stdio",
        command: "npx",
        args: ["-y", "some-server"],
        env: { API_KEY: "test123" },
      });
    });

    it("shapes opencode entry with type: local and command array", () => {
      const adapter = new GenericAdapter(TOOL_REGISTRY["opencode"]);
      expect(adapter.shapeEntry(sampleMcp)).toEqual({
        type: "local",
        command: ["npx", "-y", "some-server"],
        environment: { API_KEY: "test123" },
        enabled: true,
      });
    });

    it("omits empty args/env for standard", () => {
      const adapter = new GenericAdapter(TOOL_REGISTRY["claude-code"]);
      expect(adapter.shapeEntry({ command: "foo" })).toEqual({ command: "foo" });
    });
  });

  describe("GenericAdapter writeToFile", () => {
    it("writes correct JSON for claude-code", async () => {
      mockReadFileIfExists.mockResolvedValueOnce(JSON.stringify({ existingKey: true }));
      const adapter = new GenericAdapter(TOOL_REGISTRY["claude-code"]);

      const result = await adapter.writeToFile({ "my-mcp": sampleMcp });

      expect(result.success).toBe(true);
      const written = JSON.parse(mockWriteFile.mock.calls[0][1]);
      expect(written.existingKey).toBe(true);
      expect(written.mcpServers["my-mcp"].command).toBe("npx");
    });

    it("writes correct JSON for opencode with nested key", async () => {
      const adapter = new GenericAdapter(TOOL_REGISTRY["opencode"]);

      const result = await adapter.writeToFile({ "my-mcp": sampleMcp });

      expect(result.success).toBe(true);
      const written = JSON.parse(mockWriteFile.mock.calls[0][1]);
      expect(written.mcp["my-mcp"].type).toBe("local");
    });

    it("writes TOML for codex", async () => {
      const adapter = new GenericAdapter(TOOL_REGISTRY["codex"]);

      const result = await adapter.writeToFile({ "my-mcp": sampleMcp });

      expect(result.success).toBe(true);
      const content = mockWriteFile.mock.calls[0][1] as string;
      expect(content).toContain('[mcp.servers."my-mcp"]');
      expect(content).toContain('command = "npx"');
    });
  });

  describe("createAdapter returns correct types", () => {
    it("returns GenericAdapter for standard tools", () => {
      expect(createAdapter(TOOL_REGISTRY["claude-code"])).toBeInstanceOf(GenericAdapter);
      expect(createAdapter(TOOL_REGISTRY["codex"])).toBeInstanceOf(GenericAdapter);
      expect(createAdapter(TOOL_REGISTRY["gemini-cli"])).toBeInstanceOf(GenericAdapter);
      expect(createAdapter(TOOL_REGISTRY["opencode"])).toBeInstanceOf(GenericAdapter);
      expect(createAdapter(TOOL_REGISTRY["vscode"])).toBeInstanceOf(GenericAdapter);
      expect(createAdapter(TOOL_REGISTRY["cursor"])).toBeInstanceOf(GenericAdapter);
    });

    it("returns OpenClawAdapter for openclaw", () => {
      expect(createAdapter(TOOL_REGISTRY["openclaw"])).toBeInstanceOf(OpenClawAdapter);
    });

    it("returns AiderAdapter for aider", () => {
      expect(createAdapter(TOOL_REGISTRY["aider"])).toBeInstanceOf(AiderAdapter);
    });
  });

  describe("getAdapter works for all 9 registry tools", () => {
    it("does not throw for any tool in the registry", () => {
      for (const id of ALL_TOOL_IDS) {
        expect(() => getAdapter(id)).not.toThrow();
      }
    });
  });
});
