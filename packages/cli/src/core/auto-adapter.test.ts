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

import { GenericAdapter } from "./auto-adapter.js";
import { getAdapter, createAdapter, OpenClawAdapter, AiderAdapter } from "./tool-adapter.js";
import { TOOL_REGISTRY, ALL_TOOL_IDS } from "@mycelish/core";

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

  describe("writeToFile — preserves existing entry properties", () => {
    it("preserves disabled property on existing MCP entries", async () => {
      const desc = TOOL_REGISTRY["claude-code"];
      const adapter = new GenericAdapter(desc);
      mockReadFileIfExists.mockResolvedValue(JSON.stringify({
        mcpServers: {
          "my-server": { command: "npx", args: ["-y", "my-server"], disabled: true },
          "other-server": { command: "npx", args: ["-y", "other-server"] },
        },
      }));
      const mcps = {
        "my-server": { command: "npx", args: ["-y", "my-server"] },
        "other-server": { command: "npx", args: ["-y", "other-server"] },
      };
      await adapter.writeToFile(mcps);
      const written = JSON.parse(mockWriteFile.mock.calls[0][1]);
      expect(written.mcpServers["my-server"].disabled).toBe(true);
      expect(written.mcpServers["other-server"].disabled).toBeUndefined();
    });

    it("preserves arbitrary extra properties on existing entries", async () => {
      const desc = TOOL_REGISTRY["claude-code"];
      const adapter = new GenericAdapter(desc);
      mockReadFileIfExists.mockResolvedValue(JSON.stringify({
        mcpServers: {
          "my-server": { command: "old-command", args: ["-y", "old-server"], disabled: true, customProp: "keep-me", type: "stdio" },
        },
      }));
      const mcps = { "my-server": { command: "npx", args: ["-y", "new-server"] } };
      await adapter.writeToFile(mcps);
      const written = JSON.parse(mockWriteFile.mock.calls[0][1]);
      const entry = written.mcpServers["my-server"];
      expect(entry.command).toBe("npx");
      expect(entry.args).toEqual(["-y", "new-server"]);
      expect(entry.disabled).toBe(true);
      expect(entry.customProp).toBe("keep-me");
      expect(entry.type).toBe("stdio");
    });

    it("does not add extra properties to new entries", async () => {
      const desc = TOOL_REGISTRY["claude-code"];
      const adapter = new GenericAdapter(desc);
      mockReadFileIfExists.mockResolvedValue(JSON.stringify({ mcpServers: {} }));
      const mcps = { "brand-new": { command: "npx", args: ["-y", "brand-new"] } };
      await adapter.writeToFile(mcps);
      const written = JSON.parse(mockWriteFile.mock.calls[0][1]);
      expect(written.mcpServers["brand-new"]).toEqual({ command: "npx", args: ["-y", "brand-new"] });
    });

    it("preserves enabled:false for opencode entryShape (does not overwrite with enabled:true)", async () => {
      const desc = TOOL_REGISTRY["opencode"];
      const adapter = new GenericAdapter(desc);
      mockReadFileIfExists.mockResolvedValue(JSON.stringify({
        mcp: {
          "my-server": { type: "local", command: ["npx", "-y", "my-server"], enabled: false },
        },
      }));
      const mcps = { "my-server": { command: "npx", args: ["-y", "my-server"] } };
      await adapter.writeToFile(mcps);
      const written = JSON.parse(mockWriteFile.mock.calls[0][1]);
      expect(written.mcp["my-server"].enabled).toBe(false);
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

  describe("writeToml — preserves existing non-MCP TOML sections", () => {
    it("preserves non-MCP TOML sections when writing", async () => {
      const desc = TOOL_REGISTRY["codex"];
      const adapter = new GenericAdapter(desc);
      mockReadFileIfExists.mockResolvedValue(
        `[user]\nmodel = "gpt-4"\n\n[mcp.servers."my-server"]\ncommand = "npx"\nargs = ["-y", "my-server"]\n`
      );
      const mcps = { "my-server": { command: "npx", args: ["-y", "my-server-v2"] } };
      await adapter.writeToFile(mcps);
      const written = mockWriteFile.mock.calls[0][1] as string;
      expect(written).toContain("[user]");
      expect(written).toContain("my-server-v2");
    });
  });
});

describe("OpenClawAdapter writeToFile — preserves existing entry properties", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWriteFile.mockResolvedValue(undefined);
    mockMkdirp.mockResolvedValue(undefined);
  });

  it("preserves extra properties on existing mcp-adapter entries", async () => {
    mockReadFileIfExists.mockResolvedValue(JSON.stringify({
      plugins: {
        entries: [
          { type: "other-plugin", name: "keep-me" },
          { type: "mcp-adapter", name: "my-server", command: "npx", args: ["-y", "my-server"], disabled: true, customProp: "preserve" },
        ],
      },
    }));
    const adapter = new OpenClawAdapter();
    const mcps = { "my-server": { command: "npx", args: ["-y", "my-server-v2"] } };
    await adapter.writeToFile(mcps);
    const written = JSON.parse(mockWriteFile.mock.calls[0][1]);
    const entries = written.plugins.entries;
    expect(entries[0]).toEqual({ type: "other-plugin", name: "keep-me" });
    const mcpEntry = entries[1];
    expect(mcpEntry.type).toBe("mcp-adapter");
    expect(mcpEntry.name).toBe("my-server");
    expect(mcpEntry.args).toEqual(["-y", "my-server-v2"]);
    expect(mcpEntry.disabled).toBe(true);
    expect(mcpEntry.customProp).toBe("preserve");
  });

  it("adds new MCP entries without extra props", async () => {
    mockReadFileIfExists.mockResolvedValue(JSON.stringify({ plugins: { entries: [] } }));
    const adapter = new OpenClawAdapter();
    const mcps = { "brand-new": { command: "npx", args: ["-y", "brand-new"] } };
    await adapter.writeToFile(mcps);
    const written = JSON.parse(mockWriteFile.mock.calls[0][1]);
    const entry = written.plugins.entries[0];
    expect(entry.type).toBe("mcp-adapter");
    expect(entry.name).toBe("brand-new");
    expect(entry.disabled).toBeUndefined();
  });
});

describe("AiderAdapter writeToFile — preserves existing entry properties", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadFileIfExists.mockResolvedValue(null);
  });

  it("preserves extra properties on existing MCP entries", async () => {
    mockReadFileIfExists.mockImplementation(async (p: string) => {
      if (p.includes("mcp-servers.json")) {
        return JSON.stringify({
          mcpServers: {
            "my-server": { type: "stdio", command: "npx", args: ["-y", "my-server"], disabled: true, customProp: "keep" },
          },
        });
      }
      if (p.includes(".aider.conf.yml")) {
        return "mcp-servers-file: /mock/home/.aider/mcp-servers.json\n";
      }
      return null;
    });
    const adapter = new AiderAdapter();
    const mcps = { "my-server": { command: "npx", args: ["-y", "my-server-v2"] } };
    await adapter.writeToFile(mcps);
    const written = JSON.parse(mockWriteFile.mock.calls[0][1]);
    const entry = written.mcpServers["my-server"];
    expect(entry.command).toBe("npx");
    expect(entry.args).toEqual(["-y", "my-server-v2"]);
    expect(entry.disabled).toBe(true);
    expect(entry.customProp).toBe("keep");
    expect(entry.type).toBe("stdio");
  });

  it("does not add extra properties to new entries", async () => {
    mockReadFileIfExists.mockResolvedValue(null);
    const adapter = new AiderAdapter();
    const mcps = { "brand-new": { command: "npx", args: ["-y", "brand-new"] } };
    await adapter.writeToFile(mcps);
    const written = JSON.parse(mockWriteFile.mock.calls[0][1]);
    const entry = written.mcpServers["brand-new"];
    expect(entry.type).toBe("stdio");
    expect(entry.command).toBe("npx");
    expect(entry.args).toEqual(["-y", "brand-new"]);
    expect(entry.disabled).toBeUndefined();
  });
});
