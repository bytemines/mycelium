/**
 * Tests for init command - written FIRST following TDD
 *
 * Test cases:
 * 1. initGlobal - creates ~/.mycelium/ directory structure
 * 2. initGlobal - creates manifest.yaml with default config
 * 3. initGlobal - creates .env.example template
 * 4. initGlobal - creates empty .env.local (gitignored)
 * 5. initGlobal - does NOT overwrite existing config without --force
 * 6. initGlobal - overwrites with --force flag
 * 7. initProject - creates .mycelium/ in project root
 * 8. initProject - creates project mcps.yaml
 * 9. initProject - does NOT overwrite existing config without --force
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as path from "node:path";
import * as os from "node:os";

// Mock fs/promises module
vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn(),
  writeFile: vi.fn(),
  access: vi.fn(),
  readFile: vi.fn(),
}));

// Mock @mycelium/core
vi.mock("@mycelium/core", () => ({
  expandPath: (p: string) => {
    if (p.startsWith("~")) {
      return path.join("/mock/home", p.slice(1));
    }
    return p;
  },
  ensureDir: vi.fn(),
  pathExists: vi.fn(),
}));

describe("initGlobal", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("creates ~/.mycelium/ directory structure", async () => {
    const { ensureDir, pathExists } = await import("@mycelium/core");
    const { initGlobal } = await import("./init.js");

    vi.mocked(pathExists).mockResolvedValue(false);
    vi.mocked(ensureDir).mockResolvedValue(undefined);

    const fs = await import("node:fs/promises");
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    await initGlobal({ force: false });

    // Should create main directory
    expect(ensureDir).toHaveBeenCalledWith("/mock/home/.mycelium");

    // Should create subdirectories
    expect(ensureDir).toHaveBeenCalledWith("/mock/home/.mycelium/global/skills");
    expect(ensureDir).toHaveBeenCalledWith("/mock/home/.mycelium/global/memory/shared");
    expect(ensureDir).toHaveBeenCalledWith("/mock/home/.mycelium/global/memory/coding");
    expect(ensureDir).toHaveBeenCalledWith("/mock/home/.mycelium/global/memory/personal");
    expect(ensureDir).toHaveBeenCalledWith("/mock/home/.mycelium/machines");
  });

  it("creates manifest.yaml with default config", async () => {
    const { ensureDir, pathExists } = await import("@mycelium/core");
    const { initGlobal, DEFAULT_MANIFEST_CONFIG } = await import("./init.js");

    vi.mocked(pathExists).mockResolvedValue(false);
    vi.mocked(ensureDir).mockResolvedValue(undefined);

    const fs = await import("node:fs/promises");
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    await initGlobal({ force: false });

    // Should write manifest.yaml with default config
    expect(fs.writeFile).toHaveBeenCalledWith(
      "/mock/home/.mycelium/manifest.yaml",
      expect.stringContaining("version:"),
      "utf-8"
    );

    // Check that the written content contains expected keys
    const writeCall = vi.mocked(fs.writeFile).mock.calls.find(
      (call) => call[0] === "/mock/home/.mycelium/manifest.yaml"
    );
    expect(writeCall).toBeDefined();
    const content = writeCall![1] as string;
    expect(content).toContain("version:");
    expect(content).toContain("tools:");
    expect(content).toContain("claude-code:");
    expect(content).toContain("memory:");
    expect(content).toContain("scopes:");
  });

  it("creates .env.example template", async () => {
    const { ensureDir, pathExists } = await import("@mycelium/core");
    const { initGlobal } = await import("./init.js");

    vi.mocked(pathExists).mockResolvedValue(false);
    vi.mocked(ensureDir).mockResolvedValue(undefined);

    const fs = await import("node:fs/promises");
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    await initGlobal({ force: false });

    // Should write .env.example
    expect(fs.writeFile).toHaveBeenCalledWith(
      "/mock/home/.mycelium/.env.example",
      expect.stringContaining("# Mycelium Environment Variables"),
      "utf-8"
    );
  });

  it("creates empty .env.local (gitignored)", async () => {
    const { ensureDir, pathExists } = await import("@mycelium/core");
    const { initGlobal } = await import("./init.js");

    vi.mocked(pathExists).mockResolvedValue(false);
    vi.mocked(ensureDir).mockResolvedValue(undefined);

    const fs = await import("node:fs/promises");
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    await initGlobal({ force: false });

    // Should write .env.local
    expect(fs.writeFile).toHaveBeenCalledWith(
      "/mock/home/.mycelium/.env.local",
      expect.stringContaining("# Local secrets"),
      "utf-8"
    );
  });

  it("creates global/mcps.yaml", async () => {
    const { ensureDir, pathExists } = await import("@mycelium/core");
    const { initGlobal } = await import("./init.js");

    vi.mocked(pathExists).mockResolvedValue(false);
    vi.mocked(ensureDir).mockResolvedValue(undefined);

    const fs = await import("node:fs/promises");
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    await initGlobal({ force: false });

    // Should write global/mcps.yaml
    expect(fs.writeFile).toHaveBeenCalledWith(
      "/mock/home/.mycelium/global/mcps.yaml",
      expect.stringContaining("# Global MCP configurations"),
      "utf-8"
    );
  });

  it("does NOT overwrite existing config without --force", async () => {
    const { ensureDir, pathExists } = await import("@mycelium/core");
    const { initGlobal } = await import("./init.js");

    // Config already exists
    vi.mocked(pathExists).mockResolvedValue(true);
    vi.mocked(ensureDir).mockResolvedValue(undefined);

    const fs = await import("node:fs/promises");
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const result = await initGlobal({ force: false });

    // Should not write any files
    expect(fs.writeFile).not.toHaveBeenCalled();
    expect(result.skipped).toBe(true);
    expect(result.message).toContain("already exists");
  });

  it("overwrites with --force flag", async () => {
    const { ensureDir, pathExists } = await import("@mycelium/core");
    const { initGlobal } = await import("./init.js");

    // Config already exists
    vi.mocked(pathExists).mockResolvedValue(true);
    vi.mocked(ensureDir).mockResolvedValue(undefined);

    const fs = await import("node:fs/promises");
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const result = await initGlobal({ force: true });

    // Should write files even if they exist
    expect(fs.writeFile).toHaveBeenCalled();
    expect(result.skipped).toBe(false);
  });

  it("returns success result with created path", async () => {
    const { ensureDir, pathExists } = await import("@mycelium/core");
    const { initGlobal } = await import("./init.js");

    vi.mocked(pathExists).mockResolvedValue(false);
    vi.mocked(ensureDir).mockResolvedValue(undefined);

    const fs = await import("node:fs/promises");
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const result = await initGlobal({ force: false });

    expect(result.success).toBe(true);
    expect(result.path).toBe("/mock/home/.mycelium");
    expect(result.skipped).toBe(false);
  });
});

describe("initProject", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("creates .mycelium/ in project root", async () => {
    const { ensureDir, pathExists } = await import("@mycelium/core");
    const { initProject } = await import("./init.js");

    vi.mocked(pathExists).mockResolvedValue(false);
    vi.mocked(ensureDir).mockResolvedValue(undefined);

    const fs = await import("node:fs/promises");
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    await initProject({ projectRoot: "/my/project", force: false });

    // Should create project .mycelium directory
    expect(ensureDir).toHaveBeenCalledWith("/my/project/.mycelium");
    expect(ensureDir).toHaveBeenCalledWith("/my/project/.mycelium/memory");
  });

  it("creates project mcps.yaml", async () => {
    const { ensureDir, pathExists } = await import("@mycelium/core");
    const { initProject } = await import("./init.js");

    vi.mocked(pathExists).mockResolvedValue(false);
    vi.mocked(ensureDir).mockResolvedValue(undefined);

    const fs = await import("node:fs/promises");
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    await initProject({ projectRoot: "/my/project", force: false });

    // Should write mcps.yaml
    expect(fs.writeFile).toHaveBeenCalledWith(
      "/my/project/.mycelium/mcps.yaml",
      expect.stringContaining("# Project-specific MCP configurations"),
      "utf-8"
    );
  });

  it("does NOT overwrite existing config without --force", async () => {
    const { ensureDir, pathExists } = await import("@mycelium/core");
    const { initProject } = await import("./init.js");

    // Config already exists
    vi.mocked(pathExists).mockResolvedValue(true);
    vi.mocked(ensureDir).mockResolvedValue(undefined);

    const fs = await import("node:fs/promises");
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const result = await initProject({ projectRoot: "/my/project", force: false });

    // Should not write any files
    expect(fs.writeFile).not.toHaveBeenCalled();
    expect(result.skipped).toBe(true);
    expect(result.message).toContain("already exists");
  });

  it("overwrites with --force flag", async () => {
    const { ensureDir, pathExists } = await import("@mycelium/core");
    const { initProject } = await import("./init.js");

    // Config already exists
    vi.mocked(pathExists).mockResolvedValue(true);
    vi.mocked(ensureDir).mockResolvedValue(undefined);

    const fs = await import("node:fs/promises");
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const result = await initProject({ projectRoot: "/my/project", force: true });

    // Should write files even if they exist
    expect(fs.writeFile).toHaveBeenCalled();
    expect(result.skipped).toBe(false);
  });

  it("returns success result with created path", async () => {
    const { ensureDir, pathExists } = await import("@mycelium/core");
    const { initProject } = await import("./init.js");

    vi.mocked(pathExists).mockResolvedValue(false);
    vi.mocked(ensureDir).mockResolvedValue(undefined);

    const fs = await import("node:fs/promises");
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const result = await initProject({ projectRoot: "/my/project", force: false });

    expect(result.success).toBe(true);
    expect(result.path).toBe("/my/project/.mycelium");
    expect(result.skipped).toBe(false);
  });

  it("uses current directory if projectRoot not specified", async () => {
    const { ensureDir, pathExists } = await import("@mycelium/core");
    const { initProject } = await import("./init.js");

    vi.mocked(pathExists).mockResolvedValue(false);
    vi.mocked(ensureDir).mockResolvedValue(undefined);

    const fs = await import("node:fs/promises");
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    // Mock process.cwd()
    const originalCwd = process.cwd;
    process.cwd = () => "/current/working/dir";

    try {
      await initProject({ force: false });

      expect(ensureDir).toHaveBeenCalledWith("/current/working/dir/.mycelium");
    } finally {
      process.cwd = originalCwd;
    }
  });
});

describe("DEFAULT_MANIFEST_CONFIG", () => {
  it("has correct structure", async () => {
    const { DEFAULT_MANIFEST_CONFIG } = await import("./init.js");

    expect(DEFAULT_MANIFEST_CONFIG.version).toBe("1.0");
    expect(DEFAULT_MANIFEST_CONFIG.tools).toBeDefined();
    expect(DEFAULT_MANIFEST_CONFIG.tools["claude-code"]).toEqual({ enabled: true });
    expect(DEFAULT_MANIFEST_CONFIG.tools["codex"]).toEqual({ enabled: true });
    expect(DEFAULT_MANIFEST_CONFIG.tools["gemini-cli"]).toEqual({ enabled: true });
    expect(DEFAULT_MANIFEST_CONFIG.tools["opencode"]).toEqual({ enabled: true });
    expect(DEFAULT_MANIFEST_CONFIG.tools["openclaw"]).toEqual({ enabled: true });
    expect(DEFAULT_MANIFEST_CONFIG.tools["aider"]).toEqual({ enabled: true });
  });

  it("has correct memory scopes", async () => {
    const { DEFAULT_MANIFEST_CONFIG } = await import("./init.js");

    const { memory } = DEFAULT_MANIFEST_CONFIG;
    expect(memory.scopes).toBeDefined();

    // Shared scope
    expect(memory.scopes.shared.sync_to).toContain("claude-code");
    expect(memory.scopes.shared.sync_to).toContain("codex");
    expect(memory.scopes.shared.sync_to).toContain("openclaw");
    expect(memory.scopes.shared.path).toBe("global/memory/shared/");

    // Coding scope
    expect(memory.scopes.coding.sync_to).toContain("claude-code");
    expect(memory.scopes.coding.exclude_from).toContain("openclaw");
    expect(memory.scopes.coding.path).toBe("global/memory/coding/");

    // Personal scope (OpenClaw only)
    expect(memory.scopes.personal.sync_to).toEqual(["openclaw"]);
    expect(memory.scopes.personal.exclude_from).toContain("claude-code");
    expect(memory.scopes.personal.path).toBe("global/memory/personal/");
  });
});

describe("initCommand (Commander.js)", () => {
  it("exports a Command instance", async () => {
    const { initCommand } = await import("./init.js");

    expect(initCommand).toBeDefined();
    expect(initCommand.name()).toBe("init");
  });

  it("has --global option", async () => {
    const { initCommand } = await import("./init.js");

    const globalOption = initCommand.options.find(
      (opt) => opt.short === "-g" || opt.long === "--global"
    );
    expect(globalOption).toBeDefined();
  });

  it("has --force option", async () => {
    const { initCommand } = await import("./init.js");

    const forceOption = initCommand.options.find(
      (opt) => opt.short === "-f" || opt.long === "--force"
    );
    expect(forceOption).toBeDefined();
  });
});
