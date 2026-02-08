import { describe, it, expect, vi, beforeEach } from "vitest";
import * as os from "node:os";

// Mock fs, child_process, and fs-helpers before imports
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
}));

vi.mock("./fs-helpers.js", () => ({
  readFileIfExists: vi.fn(),
  mkdirp: vi.fn(),
  MYCELIUM_HOME: "/mock/.mycelium",
  DEFAULT_PORT: 3378,
  MEMORY_LINE_LIMIT: 200,
}));

import * as fs from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { readFileIfExists, mkdirp } from "./fs-helpers.js";
import {
  getMachineOverridesPath,
  loadMachineOverrides,
  saveMachineOverrides,
  detectMcpOverrides,
  applyMachineOverrides,
  rescanOverrides,
} from "./machine-overrides.js";

const mockedReadFile = readFileIfExists as ReturnType<typeof vi.fn>;
const mockedWriteFile = fs.writeFile as ReturnType<typeof vi.fn>;
const mockedMkdirp = mkdirp as ReturnType<typeof vi.fn>;
const mockedExecFileSync = execFileSync as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockedMkdirp.mockResolvedValue(undefined);
  mockedWriteFile.mockResolvedValue(undefined);
});

describe("getMachineOverridesPath", () => {
  it("returns path with hostname", () => {
    const p = getMachineOverridesPath();
    expect(p).toContain("machines");
    expect(p).toContain(os.hostname());
    expect(p).toMatch(/\.yaml$/);
  });
});

describe("loadMachineOverrides", () => {
  it("returns empty defaults when file does not exist", async () => {
    mockedReadFile.mockResolvedValue(null);
    const result = await loadMachineOverrides();
    expect(result.hostname).toBe(os.hostname());
    expect(result.mcps).toEqual({});
  });

  it("parses YAML content correctly", async () => {
    const yaml = [
      "hostname: test-machine",
      "detectedAt: 2026-02-08T15:00:00Z",
      "updatedAt: 2026-02-08T16:00:00Z",
      "mcps:",
      "  mcp-server:",
      "    command: /opt/bin/mcp-server",
      "    detectedAt: 2026-02-08T15:00:00Z",
    ].join("\n");
    mockedReadFile.mockResolvedValue(yaml);

    const result = await loadMachineOverrides();
    expect(result.hostname).toBe("test-machine");
    expect(result.mcps["mcp-server"].command).toBe("/opt/bin/mcp-server");
  });
});

describe("saveMachineOverrides + load round-trip", () => {
  it("serializes and parses back correctly", async () => {
    const overrides = {
      hostname: "my-mac",
      detectedAt: "2026-02-08T15:00:00Z",
      updatedAt: "2026-02-08T16:00:00Z",
      mcps: {
        "test-mcp": { command: "/usr/local/bin/test-mcp", detectedAt: "2026-02-08T15:00:00Z" },
      },
    };

    let savedContent = "";
    mockedWriteFile.mockImplementation((_p: string, content: string) => {
      savedContent = content;
      return Promise.resolve();
    });

    await saveMachineOverrides(overrides);
    expect(mockedWriteFile).toHaveBeenCalled();

    // Parse back the saved content
    mockedReadFile.mockResolvedValue(savedContent);
    const loaded = await loadMachineOverrides();
    expect(loaded.hostname).toBe("my-mac");
    expect(loaded.mcps["test-mcp"].command).toBe("/usr/local/bin/test-mcp");
  });
});

describe("detectMcpOverrides", () => {
  it("detects command at different path", () => {
    mockedExecFileSync.mockReturnValue("/opt/homebrew/bin/uvx\n");

    const mcps = {
      server: { command: "/usr/local/bin/uvx", args: ["mcp-server"] },
    };

    const result = detectMcpOverrides(mcps);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("server");
    expect(result[0].oldCommand).toBe("/usr/local/bin/uvx");
    expect(result[0].newCommand).toBe("/opt/homebrew/bin/uvx");
  });

  it("skips when command exists at configured path", () => {
    mockedExecFileSync.mockReturnValue("/usr/local/bin/uvx\n");

    const mcps = {
      server: { command: "/usr/local/bin/uvx", args: [] },
    };

    const result = detectMcpOverrides(mcps);
    expect(result).toHaveLength(0);
  });

  it("skips when which fails", () => {
    mockedExecFileSync.mockImplementation(() => { throw new Error("not found"); });

    const mcps = {
      server: { command: "/usr/local/bin/uvx", args: [] },
    };

    const result = detectMcpOverrides(mcps);
    expect(result).toHaveLength(0);
  });
});

describe("applyMachineOverrides", () => {
  it("merges overrides into mcps", () => {
    const mcps = {
      server: { command: "/usr/local/bin/uvx", args: ["serve"], enabled: true },
      other: { command: "/usr/bin/node", args: [] },
    };

    const overrides = {
      hostname: "test",
      detectedAt: "",
      updatedAt: "",
      mcps: {
        server: { command: "/opt/homebrew/bin/uvx", detectedAt: "" },
      },
    };

    const result = applyMachineOverrides(mcps, overrides);
    expect(result.server.command).toBe("/opt/homebrew/bin/uvx");
    expect(result.server.args).toEqual(["serve"]);
    expect(result.other.command).toBe("/usr/bin/node");
  });

  it("ignores overrides for non-existent mcps", () => {
    const mcps = { server: { command: "/usr/bin/node" } };
    const overrides = {
      hostname: "test",
      detectedAt: "",
      updatedAt: "",
      mcps: { missing: { command: "/foo/bar", detectedAt: "" } },
    };

    const result = applyMachineOverrides(mcps, overrides);
    expect(result.server.command).toBe("/usr/bin/node");
    expect(result.missing).toBeUndefined();
  });
});

describe("rescanOverrides", () => {
  it("re-detects and saves overrides", async () => {
    mockedExecFileSync.mockReturnValue("/opt/homebrew/bin/uvx\n");
    mockedWriteFile.mockResolvedValue(undefined);

    const mcps = {
      server: { command: "/usr/local/bin/uvx", args: [] },
    };

    const result = await rescanOverrides(mcps);
    expect(result.mcps.server.command).toBe("/opt/homebrew/bin/uvx");
    expect(mockedWriteFile).toHaveBeenCalled();
  });
});
