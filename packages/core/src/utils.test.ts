/**
 * Tests for utility functions - written FIRST following TDD
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as os from "node:os";

// Tests define the API we want - implementation comes after

describe("expandPath", () => {
  it("expands ~ to home directory", async () => {
    const { expandPath } = await import("./utils.js");
    const home = os.homedir();
    expect(expandPath("~/.mycelium")).toBe(`${home}/.mycelium`);
  });

  it("leaves absolute paths unchanged", async () => {
    const { expandPath } = await import("./utils.js");
    expect(expandPath("/absolute/path")).toBe("/absolute/path");
  });

  it("leaves relative paths unchanged", async () => {
    const { expandPath } = await import("./utils.js");
    expect(expandPath("relative/path")).toBe("relative/path");
  });
});

describe("contractPath", () => {
  it("contracts home directory to ~", async () => {
    const { contractPath } = await import("./utils.js");
    const home = os.homedir();
    expect(contractPath(`${home}/.mycelium`)).toBe("~/.mycelium");
  });

  it("leaves paths outside home unchanged", async () => {
    const { contractPath } = await import("./utils.js");
    expect(contractPath("/var/log")).toBe("/var/log");
  });
});

describe("getHostname", () => {
  it("returns the system hostname", async () => {
    const { getHostname } = await import("./utils.js");
    expect(getHostname()).toBe(os.hostname());
  });
});

describe("getGlobalMyceliumPath", () => {
  it("returns ~/.mycelium expanded", async () => {
    const { getGlobalMyceliumPath } = await import("./utils.js");
    const home = os.homedir();
    expect(getGlobalMyceliumPath()).toBe(`${home}/.mycelium`);
  });
});

describe("getProjectMyceliumPath", () => {
  it("returns .mycelium in project root", async () => {
    const { getProjectMyceliumPath } = await import("./utils.js");
    expect(getProjectMyceliumPath("/home/user/project")).toBe(
      "/home/user/project/.mycelium"
    );
  });
});

describe("deepMerge", () => {
  it("merges flat objects with source priority", async () => {
    const { deepMerge } = await import("./utils.js");
    const target = { a: 1, b: 2 };
    const source = { b: 3, c: 4 };
    expect(deepMerge(target, source)).toEqual({ a: 1, b: 3, c: 4 });
  });

  it("merges nested objects recursively", async () => {
    const { deepMerge } = await import("./utils.js");
    const target = { a: { x: 1, y: 2 }, b: 1 };
    const source = { a: { y: 3, z: 4 } } as unknown as Partial<typeof target>;
    expect(deepMerge(target, source)).toEqual({ a: { x: 1, y: 3, z: 4 }, b: 1 });
  });

  it("does not mutate original objects", async () => {
    const { deepMerge } = await import("./utils.js");
    const target = { a: 1 };
    const source = { b: 2 } as unknown as Partial<typeof target>;
    deepMerge(target, source);
    expect(target).toEqual({ a: 1 });
  });

  it("replaces arrays instead of merging them", async () => {
    const { deepMerge } = await import("./utils.js");
    const target = { arr: [1, 2] };
    const source = { arr: [3, 4] };
    expect(deepMerge(target, source)).toEqual({ arr: [3, 4] });
  });
});

describe("resolveEnvVars", () => {
  it("resolves ${VAR} syntax from environment", async () => {
    const { resolveEnvVars } = await import("./utils.js");
    const env = { MY_VAR: "hello" };
    expect(resolveEnvVars("value is ${MY_VAR}", env)).toBe("value is hello");
  });

  it("resolves multiple variables", async () => {
    const { resolveEnvVars } = await import("./utils.js");
    const env = { A: "x", B: "y" };
    expect(resolveEnvVars("${A} and ${B}", env)).toBe("x and y");
  });

  it("replaces undefined vars with empty string", async () => {
    const { resolveEnvVars } = await import("./utils.js");
    expect(resolveEnvVars("${UNDEFINED}", {})).toBe("");
  });

  it("leaves strings without vars unchanged", async () => {
    const { resolveEnvVars } = await import("./utils.js");
    expect(resolveEnvVars("no vars here", {})).toBe("no vars here");
  });
});

describe("resolveEnvVarsInObject", () => {
  it("resolves vars in nested object strings", async () => {
    const { resolveEnvVarsInObject } = await import("./utils.js");
    const obj = { a: "${VAR}", b: { c: "${VAR}" } };
    const env = { VAR: "resolved" };
    expect(resolveEnvVarsInObject(obj, env)).toEqual({
      a: "resolved",
      b: { c: "resolved" },
    });
  });

  it("resolves vars in arrays", async () => {
    const { resolveEnvVarsInObject } = await import("./utils.js");
    const obj = { arr: ["${A}", "${B}"] };
    const env = { A: "x", B: "y" };
    expect(resolveEnvVarsInObject(obj, env)).toEqual({ arr: ["x", "y"] });
  });

  it("leaves non-string values unchanged", async () => {
    const { resolveEnvVarsInObject } = await import("./utils.js");
    const obj = { num: 42, bool: true, nil: null };
    expect(resolveEnvVarsInObject(obj, {})).toEqual({
      num: 42,
      bool: true,
      nil: null,
    });
  });
});

describe("formatStatus", () => {
  it("formats synced status with green color", async () => {
    const { formatStatus } = await import("./utils.js");
    const result = formatStatus("synced");
    expect(result).toContain("synced");
    expect(result).toContain("\u001b[32m"); // green ANSI
  });

  it("formats pending status with yellow color", async () => {
    const { formatStatus } = await import("./utils.js");
    const result = formatStatus("pending");
    expect(result).toContain("pending");
    expect(result).toContain("\u001b[33m"); // yellow ANSI
  });

  it("formats error status with red color", async () => {
    const { formatStatus } = await import("./utils.js");
    const result = formatStatus("error");
    expect(result).toContain("error");
    expect(result).toContain("\u001b[31m"); // red ANSI
  });

  it("formats disabled status with gray color", async () => {
    const { formatStatus } = await import("./utils.js");
    const result = formatStatus("disabled");
    expect(result).toContain("disabled");
    expect(result).toContain("\u001b[90m"); // gray ANSI
  });
});

describe("pathExists", () => {
  it("returns true for existing paths", async () => {
    const { pathExists } = await import("./utils.js");
    expect(await pathExists("/")).toBe(true);
  });

  it("returns false for non-existing paths", async () => {
    const { pathExists } = await import("./utils.js");
    expect(await pathExists("/nonexistent/path/12345")).toBe(false);
  });
});

describe("ensureDir", () => {
  const testDir = `/tmp/mycelium-test-${Date.now()}`;

  afterEach(async () => {
    const fs = await import("node:fs/promises");
    try {
      await fs.rm(testDir, { recursive: true });
    } catch {
      // Ignore
    }
  });

  it("creates directory if it does not exist", async () => {
    const { ensureDir, pathExists } = await import("./utils.js");
    await ensureDir(testDir);
    expect(await pathExists(testDir)).toBe(true);
  });

  it("creates nested directories", async () => {
    const { ensureDir, pathExists } = await import("./utils.js");
    const nestedDir = `${testDir}/a/b/c`;
    await ensureDir(nestedDir);
    expect(await pathExists(nestedDir)).toBe(true);
  });

  it("does not fail if directory already exists", async () => {
    const { ensureDir, pathExists } = await import("./utils.js");
    await ensureDir(testDir);
    await ensureDir(testDir); // Second call should not throw
    expect(await pathExists(testDir)).toBe(true);
  });
});
