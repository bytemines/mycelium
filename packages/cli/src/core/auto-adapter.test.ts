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
  readFile: async () => {
    const content = await mockReadFileIfExists();
    if (content === null) throw Object.assign(new Error("Missing"), { code: "ENOENT" });
    return content;
  },
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
import { getAdapter, createAdapter, OpenClawAdapter } from "./tool-adapter.js";
import { TOOL_REGISTRY, ALL_TOOL_IDS } from "@mycelish/core";
import { encodeMcpToml } from "./toml-encoding.js";

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

  describe("native CLI reconciliation", () => {
    const name = "plugin/vendor.server+[x]";
    const missing = () => Object.assign(new Error("Command failed: claude mcp remove"), {
      code: 1, stdout: "", stderr: `No user-scoped MCP server found with name: ${name}\n`,
    });

    it("accepts the exact Claude 2.1.15 user-scope absent fixture on first and repeated removal", async () => {
      const adapter = new GenericAdapter(TOOL_REGISTRY["claude-code"]);
      mockExecFile.mockRejectedValue(missing());
      expect(await adapter.removeViaCli(name)).toMatchObject({ success: true, method: "cli" });
      expect(await adapter.removeViaCli(name)).toMatchObject({ success: true, method: "cli" });
      expect(mockExecFile).toHaveBeenCalledWith("claude", ["mcp", "remove", name, "--scope", "user"], { timeout: 30000 });
    });

    it("handles present-then-absent tombstones across repeated native sync", async () => {
      const adapter = new GenericAdapter(TOOL_REGISTRY["claude-code"]);
      vi.spyOn(adapter, "hasCli").mockResolvedValue(true);
      mockExecFile.mockResolvedValueOnce({ stdout: "Removed MCP server", stderr: "" }).mockRejectedValue(missing());
      const tombstone = { [name]: { command: "fixture-server", state: "deleted" as const } };
      expect((await adapter.syncAll(tombstone)).success).toBe(true);
      expect((await adapter.syncAll(tombstone)).success).toBe(true);
    });

    it.each([
      "Permission denied", "Authentication failed", "Connection failed", "not found",
      `No user-scoped MCP server found with name: other`,
      `No user-scoped MCP server found with name: ${name}\nPermission denied`,
    ])("propagates native removal failure: %s", async stderr => {
      const adapter = new GenericAdapter(TOOL_REGISTRY["claude-code"]);
      mockExecFile.mockRejectedValue(Object.assign(missing(), { stderr, message: stderr }));
      expect(await adapter.removeViaCli(name)).toMatchObject({ success: false, error: expect.stringContaining(stderr) });
    });

    it("does not normalize another tool or a terminated process", async () => {
      mockExecFile.mockRejectedValue(missing());
      expect((await new GenericAdapter(TOOL_REGISTRY["gemini-cli"]).removeViaCli(name)).success).toBe(false);
      mockExecFile.mockRejectedValue(Object.assign(missing(), { killed: true }));
      expect((await new GenericAdapter(TOOL_REGISTRY["claude-code"]).removeViaCli(name)).success).toBe(false);
    });

    it("propagates permission denial through repeated native tombstone sync", async () => {
      const adapter = new GenericAdapter(TOOL_REGISTRY["claude-code"]);
      vi.spyOn(adapter, "hasCli").mockResolvedValue(true);
      mockExecFile.mockRejectedValue(Object.assign(new Error("Permission denied"), {
        code: 1, stdout: "", stderr: "Permission denied",
      }));
      const tombstone = { [name]: { command: "fixture-server", state: "deleted" as const } };
      for (let i = 0; i < 2; i++) {
        expect(await adapter.syncAll(tombstone)).toMatchObject({
          success: false, error: expect.stringContaining("Permission denied"),
        });
      }
    });

    it.each(["claude-code", "gemini-cli"])("redacts %s add errors in results and trace logs", async toolId => {
      const adapter = new GenericAdapter(TOOL_REGISTRY[toolId]);
      const logError = vi.fn();
      adapter.log = { error: logError } as unknown as NonNullable<typeof adapter.log>;
      const secret = 'fake-secret-"quoted"';
      mockExecFile.mockImplementation(async (_cmd, args) => {
        if (args[1] === "remove") return { stdout: "", stderr: "" };
        throw Object.assign(new Error(`Command failed: ${_cmd} ${args.join(" ")}\nPermission denied ${secret}`), {
          code: 1, stdout: "", stderr: `Permission denied ${secret}`,
        });
      });
      const result = await adapter.addViaCli("fixture", { command: "fixture-server", env: { API_KEY: secret } });
      const output = JSON.stringify({ result, logs: logError.mock.calls });
      expect(output).not.toContain(secret);
      expect(output).not.toContain(JSON.stringify(secret).slice(1, -1));
      expect(output).toContain("[REDACTED]");
      expect(output).toContain("API_KEY");
      expect(output).toContain("Permission denied");
      expect(result.success).toBe(false);
    });
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

    it("converts OpenCode environment placeholders without mutating the source", () => {
      const adapter = new GenericAdapter(TOOL_REGISTRY["opencode"]);
      const env = { MASSIVE_API_KEY: "${MASSIVE_API_KEY}" };

      expect(adapter.shapeEntry({ command: "uvx", env }).environment).toEqual({
        MASSIVE_API_KEY: "{env:MASSIVE_API_KEY}",
      });
      expect(env).toEqual({ MASSIVE_API_KEY: "${MASSIVE_API_KEY}" });
    });

    it("preserves literals and converts multiple embedded OpenCode placeholders", () => {
      const adapter = new GenericAdapter(TOOL_REGISTRY["opencode"]);
      expect(adapter.shapeEntry({
        command: "server",
        env: {
          LITERAL: "info",
          EMPTY: "",
          NATIVE: "{env:API_KEY}",
          COMBINED: "Bearer ${API_KEY}/${ACCOUNT_2}/${API_KEY}",
          SHELL: "$API_KEY ${API_KEY:-fallback}",
        },
      }).environment).toEqual({
        LITERAL: "info",
        EMPTY: "",
        NATIVE: "{env:API_KEY}",
        COMBINED: "Bearer {env:API_KEY}/{env:ACCOUNT_2}/{env:API_KEY}",
        SHELL: "$API_KEY ${API_KEY:-fallback}",
      });
    });

    it.each(["claude-code", "vscode", "codex", "gemini-cli", "cursor", "antigravity"])(
      "preserves environment placeholders for %s",
      (toolId) => {
        const adapter = new GenericAdapter(TOOL_REGISTRY[toolId]);
        const env = { API_KEY: "${API_KEY}" };
        expect(adapter.shapeEntry({ command: "server", env }).env).toEqual(env);
      },
    );

    it("omits empty args/env for standard", () => {
      const adapter = new GenericAdapter(TOOL_REGISTRY["claude-code"]);
      expect(adapter.shapeEntry({ command: "foo" })).toEqual({ command: "foo" });
    });
  });

  describe("GenericAdapter writeToFile", () => {
    it.each(["write", "remove"])("does not hide permission failures during JSON %s", async operation => {
      mockReadFileIfExists.mockRejectedValueOnce(Object.assign(new Error("Permission denied"), { code: "EACCES" }));
      const adapter = new GenericAdapter(TOOL_REGISTRY.opencode);
      const result = operation === "write"
        ? await adapter.writeToFile({ managed: sampleMcp })
        : await adapter.remove("managed");
      expect(result.success).toBe(false);
      expect(result.error).toContain("Permission denied");
      expect(mockWriteFile).not.toHaveBeenCalled();
    });

    it("rejects malformed JSONC without writing", async () => {
      mockReadFileIfExists.mockResolvedValueOnce('{"mcp": { "personal": , }}');
      const adapter = new GenericAdapter({ ...TOOL_REGISTRY.opencode, mcp: { ...TOOL_REGISTRY.opencode.mcp, format: "jsonc" } });
      expect((await adapter.writeToFile({ managed: sampleMcp })).success).toBe(false);
      expect(mockWriteFile).not.toHaveBeenCalled();
    });
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

    it("writes OpenCode environment references while preserving command arguments", async () => {
      const adapter = new GenericAdapter(TOOL_REGISTRY["opencode"]);
      const result = await adapter.writeToFile({
        massive: {
          command: "uvx",
          args: ["--with", "mcp<2", "mcp_massive"],
          env: { MASSIVE_API_KEY: "${MASSIVE_API_KEY}" },
        },
      });

      expect(result.success).toBe(true);
      const written = JSON.parse(mockWriteFile.mock.calls[0][1]);
      expect(written.mcp.massive.environment).toEqual({ MASSIVE_API_KEY: "{env:MASSIVE_API_KEY}" });
      expect(written.mcp.massive.command).toEqual(["uvx", "--with", "mcp<2", "mcp_massive"]);
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

  });

  describe("getAdapter works for all 8 registry tools", () => {
    it("does not throw for any tool in the registry", () => {
      for (const id of ALL_TOOL_IDS) {
        expect(() => getAdapter(id)).not.toThrow();
      }
    });
  });

  describe("writeToml — preserves existing non-MCP TOML sections", () => {
    it("cannot inject permissions through MCP commands, arguments, names or environment", async () => {
      const existing = '[user]\nmodel = "keep"\n\n[mcp.servers.old]\ncommand = "old"\n\n[permissions]\nallow = false\n';
      mockReadFileIfExists.mockResolvedValue(existing);
      const mcps = {
        'ai.auteng/mcp"\n[permissions]': {
          command: 'npx"\n[permissions]\nallow = true\n#',
          args: ['C:\\bin\\mcp', '"\n\t\x00\x7f😀'],
          env: { 'ENV.key"\n[permissions]': '"\n\\\x01' },
        },
      };
      const adapter = new GenericAdapter(TOOL_REGISTRY.codex);
      expect((await adapter.writeToFile(mcps)).success).toBe(true);
      const content = mockWriteFile.mock.calls[0][1] as string;
      expect(content).toBe(existing + '\n' + encodeMcpToml(mcps));
      expect(content.split("\n").filter(line => line === "[permissions]")).toHaveLength(1);
      expect(mockWriteFile.mock.calls[0][0]).toContain("config.toml");
    });

    it("returns a failure without writing when Unicode cannot be represented in TOML", async () => {
      const adapter = new GenericAdapter(TOOL_REGISTRY.codex);
      const result = await adapter.writeToFile({ mcp: { command: "\ud800" } });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Unicode scalar");
      expect(mockWriteFile).not.toHaveBeenCalled();
    });

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

  describe("TOML file fallback — exact-name reconciliation", () => {
    it.each(["mcp.servers", "mcp_servers"])("keeps native MCPs and unrelated config when updating %s", async root => {
      const native = `[${root}.native]\ncommand = "native"\n[${root}.native.env]\nTOKEN = "keep"\n`;
      const unrelated = '[permissions]\nallow = false\n[[hooks.PostToolUse]]\ncommand = "keep hook"\n';
      mockReadFileIfExists.mockResolvedValue(native + `[${root}.managed]\ncommand = "old"\n[${root}.managed.env]\nOLD = "old"\n` + unrelated);
      const adapter = new GenericAdapter({ ...TOOL_REGISTRY.codex, mcp: { ...TOOL_REGISTRY.codex.mcp, key: root } });
      vi.spyOn(adapter, "hasCli").mockResolvedValue(false);
      const result = await adapter.syncAll({ managed: { command: "new", env: { NEW: "new" } } });
      expect(result).toMatchObject({ success: true, method: "file" });
      const content = mockWriteFile.mock.calls[0][1] as string;
      expect(content).toContain(native);
      expect(content).toContain(unrelated);
      expect(content).toContain(`[${root}."managed"]\ncommand = "new"`);
      expect(content).toContain(`[${root}."managed".env]\nNEW = "new"`);
      expect(content).not.toContain('command = "old"');
      expect(content).not.toContain('OLD = "old"');
      expect(mockExecFile).not.toHaveBeenCalled();
    });

    it.each([
      ["mcp.servers.foo", "foo"],
      ['mcp_servers."ai.auteng/mcp"', "ai.auteng/mcp"],
      ["mcp.servers.'ai.auteng/mcp'", "ai.auteng/mcp"],
      ['mcp_servers."quote\\\"slash\\\\"', 'quote"slash\\'],
      ['mcp.servers."\\u0066oo"', "foo"],
      ['mcp_servers."\\U0001F600"', "😀"],
      ['mcp_servers."literal\\\\U00000066"', 'literal\\U00000066'],
      ['"mcp" . "servers" . \'a.b/c\'', "a.b/c"],
    ])("removes only the literal name in [%s], including nested tables", async (table, name) => {
      const unrelated = '[mcp_servers.foobar]\ncommand = "keep"\n[mcp_servers.foobar.env]\nTOKEN = "keep"\n[permissions]\nallow = false\n';
      mockReadFileIfExists.mockResolvedValue(`  [${table}] # server\ncommand = "remove"\n[${table}.env]\nTOKEN = "remove"\n[${table}.env.nested]\nvalue = "remove"\n[[${table}.extra]]\nvalue = "remove"\n` + unrelated);
      const adapter = new GenericAdapter(TOOL_REGISTRY.codex);
      vi.spyOn(adapter, "hasCli").mockResolvedValue(false);
      expect((await adapter.remove(name)).success).toBe(true);
      expect(mockWriteFile.mock.calls[0][1]).toBe(unrelated);
      expect(mockExecFile).not.toHaveBeenCalled();
    });

    it("adds unknown names and leaves an empty update untouched", async () => {
      const native = '[mcp_servers.native]\ncommand = "native"\n[mcp_servers.native.env]\nTOKEN = "keep"\n';
      mockReadFileIfExists.mockResolvedValue(native);
      const adapter = new GenericAdapter(TOOL_REGISTRY.codex);
      expect((await adapter.writeToFile({})).success).toBe(true);
      expect(mockWriteFile.mock.calls[0][1]).toBe(native);
      await adapter.writeToFile({ added: { command: "new" } });
      expect(mockWriteFile.mock.calls[1][1]).toBe(native + '\n' + encodeMcpToml({ added: { command: "new" } }));
    });

    it("retains a native root even when the descriptor uses the other supported root", async () => {
      mockReadFileIfExists.mockResolvedValue('[mcp_servers.foo]\ncommand = "old"\n');
      await new GenericAdapter(TOOL_REGISTRY.codex).writeToFile({ foo: { command: "new" } });
      expect(mockWriteFile.mock.calls[0][1]).toBe('[mcp_servers."foo"]\ncommand = "new"\n');
    });

    it("does not delete unrecognized or malformed headers", async () => {
      const content = '[mcp_servers."foo".???]\nkeep = true\n[mcp_servers."\\uD800"]\nkeep = true\n[[mcp_servers.foo]\nkeep = true\n[permissions]\nallow = false\n';
      mockReadFileIfExists.mockResolvedValue(content);
      await new GenericAdapter(TOOL_REGISTRY.codex).removeFromFile("foo");
      expect(mockWriteFile.mock.calls[0][1]).toBe(content);
    });

    it.each(['"""', "'''"])("keeps header-shaped lines in unrelated multiline strings (%s)", async quote => {
      const native = `[mcp_servers.native]\ncommand = "keep"\nnotes = ${quote}\n[mcp_servers.foo]\nnot a real table\n${quote}\n`;
      mockReadFileIfExists.mockResolvedValue(native + '[mcp_servers.foo]\ncommand = "remove"\n');
      await new GenericAdapter(TOOL_REGISTRY.codex).removeFromFile("foo");
      expect(mockWriteFile.mock.calls[0][1]).toBe(native);
    });

    it("removes only explicitly disabled/deleted incoming names", async () => {
      const native = '[mcp_servers.native]\ncommand = "keep"\n';
      mockReadFileIfExists.mockResolvedValue(native + '[mcp_servers.foo]\ncommand = "remove"\n[mcp_servers.foo.env]\nTOKEN = "remove"\n');
      await new GenericAdapter(TOOL_REGISTRY.codex).writeToFile({ foo: { command: "old", state: "deleted" } });
      expect(mockWriteFile.mock.calls[0][1]).toBe(native);
    });

    it("keeps native MCPs when tombstones are removed before a partial update", async () => {
      let content = '[mcp_servers.native]\ncommand = "keep"\n[mcp_servers.deleted]\ncommand = "remove"\n[mcp_servers.deleted.env]\nTOKEN = "remove"\n[mcp_servers.managed]\ncommand = "old"\n';
      mockReadFileIfExists.mockImplementation(async () => content);
      mockWriteFile.mockImplementation(async (_path, written) => { content = written as string; });
      const adapter = new GenericAdapter(TOOL_REGISTRY.codex);
      vi.spyOn(adapter, "hasCli").mockResolvedValue(false);
      expect((await adapter.remove("deleted")).success).toBe(true);
      expect((await adapter.syncAll({ managed: { command: "new" } })).success).toBe(true);
      expect(content).toContain('[mcp_servers.native]\ncommand = "keep"');
      expect(content).toContain('[mcp_servers."managed"]\ncommand = "new"');
      expect(content).not.toContain("deleted");
      expect(mockExecFile).not.toHaveBeenCalled();
      mockWriteFile.mockResolvedValue(undefined);
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
        entries: {
          "keep-me": { type: "other-plugin", enabled: true },
          "my-server": { type: "mcp-adapter", command: "npx", args: ["-y", "my-server"], disabled: true, customProp: "preserve" },
        },
      },
    }));
    const adapter = new OpenClawAdapter();
    const mcps = { "my-server": { command: "npx", args: ["-y", "my-server-v2"] } };
    await adapter.writeToFile(mcps);
    const written = JSON.parse(mockWriteFile.mock.calls[0][1]);
    const entries = written.plugins.entries;
    expect(entries["keep-me"]).toEqual({ type: "other-plugin", enabled: true });
    const mcpEntry = entries["my-server"];
    expect(mcpEntry.type).toBe("mcp-adapter");
    expect(mcpEntry.args).toEqual(["-y", "my-server-v2"]);
    expect(mcpEntry.disabled).toBe(true);
    expect(mcpEntry.customProp).toBe("preserve");
  });

  it("adds new MCP entries without extra props", async () => {
    mockReadFileIfExists.mockResolvedValue(JSON.stringify({ plugins: { entries: {} } }));
    const adapter = new OpenClawAdapter();
    const mcps = { "brand-new": { command: "npx", args: ["-y", "brand-new"] } };
    await adapter.writeToFile(mcps);
    const written = JSON.parse(mockWriteFile.mock.calls[0][1]);
    const entry = written.plugins.entries["brand-new"];
    expect(entry.type).toBe("mcp-adapter");
    expect(entry.disabled).toBeUndefined();
  });
});
