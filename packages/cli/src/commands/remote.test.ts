import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
  execFileSync: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));

vi.mock("../core/env-template.js", () => ({
  ensureGitignore: vi.fn().mockResolvedValue(undefined),
  generateEnvTemplate: vi.fn().mockResolvedValue(["API_KEY", "SECRET"]),
  getMissingEnvVars: vi.fn().mockResolvedValue([]),
  setupEnvVars: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../core/machine-overrides.js", () => ({
  detectMcpOverrides: vi.fn().mockReturnValue([]),
  loadMachineOverrides: vi.fn().mockResolvedValue({ hostname: "test", detectedAt: "", updatedAt: "", mcps: {} }),
  saveMachineOverrides: vi.fn().mockResolvedValue(undefined),
  rescanOverrides: vi.fn().mockResolvedValue({ hostname: "test", detectedAt: "", updatedAt: "", mcps: {} }),
}));

vi.mock("../core/fs-helpers.js", () => ({
  readFileIfExists: vi.fn().mockResolvedValue(null),
  mkdirp: vi.fn().mockResolvedValue(undefined),
}));

import { execFileSync } from "node:child_process";
import * as fs from "node:fs/promises";
import { ensureGitignore, generateEnvTemplate, getMissingEnvVars } from "../core/env-template.js";
import { detectMcpOverrides, saveMachineOverrides } from "../core/machine-overrides.js";
import { readFileIfExists } from "../core/fs-helpers.js";
import { pushCommand, pullCommand, envCommand, _parseMcpsForOverrides } from "./remote.js";

const mockedExecFileSync = execFileSync as unknown as ReturnType<typeof vi.fn>;
const mockedReadFile = readFileIfExists as ReturnType<typeof vi.fn>;
const mockedWriteFile = fs.writeFile as ReturnType<typeof vi.fn>;
const mockedGetMissing = getMissingEnvVars as ReturnType<typeof vi.fn>;
const mockedDetect = detectMcpOverrides as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockedWriteFile.mockResolvedValue(undefined);
});

describe("pushCommand", () => {
  it("calls ensureGitignore, generateEnvTemplate, and git commands", async () => {
    mockedExecFileSync.mockReturnValue("");

    await pushCommand.parseAsync([], { from: "user" });

    expect(ensureGitignore).toHaveBeenCalled();
    expect(generateEnvTemplate).toHaveBeenCalled();
    const gitCalls = mockedExecFileSync.mock.calls.map((c: any[]) => c[1] as string[]);
    expect(gitCalls.some((args: string[]) => args.includes("add"))).toBe(true);
    expect(gitCalls.some((args: string[]) => args.includes("push"))).toBe(true);
    expect(gitCalls.some((args: string[]) => args.includes("commit"))).toBe(true);
  });

  it("uses custom commit message when provided", async () => {
    mockedExecFileSync.mockReturnValue("");

    await pushCommand.parseAsync(["-m", "my custom msg"], { from: "user" });

    const commitCall = mockedExecFileSync.mock.calls.find(
      (c: any[]) => (c[1] as string[]).includes("commit"),
    );
    expect(commitCall).toBeDefined();
    expect((commitCall![1] as string[]).includes("my custom msg")).toBe(true);
  });
});

describe("pullCommand", () => {
  it("calls git pull and checks missing vars", async () => {
    mockedExecFileSync.mockReturnValue("Already up to date.");
    mockedReadFile.mockResolvedValue(null);

    await pullCommand.parseAsync(["--no-sync"], { from: "user" });

    const calls = mockedExecFileSync.mock.calls.map((c: any[]) => c[1] as string[]);
    expect(calls.some((args: string[]) => args.includes("pull"))).toBe(true);
  });

  it("warns about missing env vars", async () => {
    mockedExecFileSync.mockReturnValue("Already up to date.");
    mockedReadFile.mockResolvedValue(null);
    mockedGetMissing.mockResolvedValue(["API_KEY", "SECRET"]);

    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await pullCommand.parseAsync(["--no-sync"], { from: "user" });

    expect(consoleSpy.mock.calls.some((c) => String(c[0]).includes("Missing env vars"))).toBe(true);
    consoleSpy.mockRestore();
  });

  it("detects machine overrides when mcps.yaml exists", async () => {
    mockedExecFileSync.mockReturnValue("Updated.");
    mockedReadFile.mockResolvedValue("server:\n  command: /usr/bin/node\n");
    mockedDetect.mockReturnValue([{ name: "server", oldCommand: "/usr/bin/node", newCommand: "/opt/bin/node" }]);

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await pullCommand.parseAsync(["--no-sync"], { from: "user" });

    expect(saveMachineOverrides).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

describe("envCommand setup", () => {
  it("creates .env.local with missing vars", async () => {
    mockedGetMissing.mockResolvedValue(["API_KEY", "SECRET"]);
    mockedReadFile.mockResolvedValue(null);

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await envCommand.parseAsync(["setup"], { from: "user" });

    expect(mockedWriteFile).toHaveBeenCalledWith(
      expect.stringContaining(".env.local"),
      expect.stringContaining("API_KEY="),
      "utf-8",
    );
    consoleSpy.mockRestore();
  });

  it("prints all-set when no missing vars", async () => {
    mockedGetMissing.mockResolvedValue([]);

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await envCommand.parseAsync(["setup"], { from: "user" });

    expect(consoleSpy).toHaveBeenCalledWith("All env vars are set.");
    consoleSpy.mockRestore();
  });
});

describe("envCommand list", () => {
  it("shows status of vars correctly", async () => {
    mockedReadFile
      .mockResolvedValueOnce("API_KEY=\nSECRET=\n")  // template
      .mockResolvedValueOnce("API_KEY=abc123\n");      // local

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await envCommand.parseAsync(["list"], { from: "user" });

    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain("API_KEY");
    consoleSpy.mockRestore();
  });
});

describe("_parseMcpsForOverrides", () => {
  it("extracts command fields from mcps.yaml", () => {
    const yaml = "server:\n  command: /usr/bin/node\n  args:\n    - serve\nother:\n  command: /usr/bin/python\n";
    const result = _parseMcpsForOverrides(yaml);
    expect(result.server.command).toBe("/usr/bin/node");
    expect(result.other.command).toBe("/usr/bin/python");
  });
});
