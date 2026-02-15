/**
 * Tests for add command - written FIRST following TDD
 *
 * Test cases for skill management:
 * 1. parseSkillSource - identifies GitHub source (owner/repo)
 * 2. parseSkillSource - identifies local path source (./local/skill)
 * 3. parseSkillSource - validates GitHub format
 * 4. parseSkillSource - validates local path exists
 * 5. addSkill - adds skill entry to manifest.yaml
 * 6. addSkill - creates skill directory if needed
 * 7. addSkill - clones GitHub repo for remote skills
 * 8. addSkill - copies files for local skills
 * 9. addSkill - handles skill that already exists
 * 10. addSkill - shows success message
 *
 * Test cases for MCP management:
 * 11. parseMcpName - parses MCP name correctly
 * 12. addMcp - adds MCP config to mcps.yaml
 * 13. addMcp - validates MCP doesn't already exist
 * 14. addMcp - creates mcps.yaml if it doesn't exist
 * 15. addMcp - handles errors gracefully
 * 16. addMcp - shows success message
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as path from "node:path";

// Mock fs/promises module
vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn(),
  writeFile: vi.fn(),
  readFile: vi.fn(),
  access: vi.fn(),
  cp: vi.fn(),
  rm: vi.fn(),
}));

// Mock child_process for git clone
vi.mock("node:child_process", () => ({
  exec: vi.fn((cmd, opts, callback) => {
    // Default implementation that calls callback immediately
    if (typeof opts === "function") {
      opts(null, "", "");
    } else if (callback) {
      callback(null, "", "");
    }
    return {};
  }),
  execFile: vi.fn((cmd, args, callback) => {
    if (typeof args === "function") {
      args(null, "", "");
    } else if (callback) {
      callback(null, "", "");
    }
    return {};
  }),
  execSync: vi.fn(),
}));

// Mock sync command to prevent auto-sync during tests
vi.mock("./sync.js", () => ({
  syncAll: vi.fn().mockResolvedValue([]),
}));

// Mock @mycelish/core
vi.mock("@mycelish/core", () => ({
  expandPath: (p: string) => {
    if (p.startsWith("~")) {
      return path.join("/mock/home", p.slice(1));
    }
    return p;
  },
  ensureDir: vi.fn(),
  pathExists: vi.fn(),
  getGlobalMyceliumPath: () => "/mock/home/.mycelium",
}));

// ============================================================================
// Skill Source Parsing Tests
// ============================================================================

describe("parseSkillSource", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("identifies GitHub source (owner/repo format)", async () => {
    const { parseSkillSource } = await import("./add.js");

    const result = parseSkillSource("anthropic/claude-skills");

    expect(result.type).toBe("github");
    expect(result.owner).toBe("anthropic");
    expect(result.repo).toBe("claude-skills");
    expect(result.name).toBe("claude-skills");
  });

  it("identifies GitHub source with nested path (owner/repo/path)", async () => {
    const { parseSkillSource } = await import("./add.js");

    const result = parseSkillSource("anthropic/claude-skills/skills/summarize");

    expect(result.type).toBe("github");
    expect(result.owner).toBe("anthropic");
    expect(result.repo).toBe("claude-skills");
    expect(result.subpath).toBe("skills/summarize");
    expect(result.name).toBe("summarize");
  });

  it("identifies local path source (./local/skill)", async () => {
    const { parseSkillSource } = await import("./add.js");

    const result = parseSkillSource("./my-skills/custom-skill");

    expect(result.type).toBe("local");
    expect(result.path).toBe("./my-skills/custom-skill");
    expect(result.name).toBe("custom-skill");
  });

  it("identifies local path source (../relative/path)", async () => {
    const { parseSkillSource } = await import("./add.js");

    const result = parseSkillSource("../shared/skills/my-skill");

    expect(result.type).toBe("local");
    expect(result.path).toBe("../shared/skills/my-skill");
    expect(result.name).toBe("my-skill");
  });

  it("identifies local path source (absolute /path/to/skill)", async () => {
    const { parseSkillSource } = await import("./add.js");

    const result = parseSkillSource("/home/user/skills/awesome-skill");

    expect(result.type).toBe("local");
    expect(result.path).toBe("/home/user/skills/awesome-skill");
    expect(result.name).toBe("awesome-skill");
  });

  it("throws error for invalid source format", async () => {
    const { parseSkillSource } = await import("./add.js");

    expect(() => parseSkillSource("")).toThrow("Invalid skill source");
    expect(() => parseSkillSource("invalid")).toThrow("Invalid skill source");
  });

  it("handles GitHub URL format (https://github.com/owner/repo)", async () => {
    const { parseSkillSource } = await import("./add.js");

    const result = parseSkillSource("https://github.com/anthropic/skills-repo");

    expect(result.type).toBe("github");
    expect(result.owner).toBe("anthropic");
    expect(result.repo).toBe("skills-repo");
    expect(result.name).toBe("skills-repo");
  });
});

// ============================================================================
// Add Skill Tests
// ============================================================================

describe("addSkill", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("adds skill entry to manifest.yaml for GitHub source", async () => {
    const { ensureDir, pathExists } = await import("@mycelish/core");
    const { addSkill } = await import("./add.js");
    const fs = await import("node:fs/promises");
    const cp = await import("node:child_process");

    vi.mocked(pathExists).mockResolvedValue(false);
    vi.mocked(ensureDir).mockResolvedValue(undefined);
    vi.mocked(fs.readFile).mockResolvedValue(`
version: "1.0"
skills: {}
`);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    vi.mocked(cp.exec).mockImplementation((cmd: any, opts: any, callback?: any) => {
      const cb = typeof opts === "function" ? opts : callback;
      if (cb) setImmediate(() => cb(null, "", ""));
      return {} as any;
    });

    const result = await addSkill("anthropic/claude-skills", { global: true });

    expect(result.success).toBe(true);
    expect(result.name).toBe("claude-skills");
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining("manifest.yaml"),
      expect.stringContaining("claude-skills"),
      "utf-8"
    );
  });

  it("creates skill directory if needed", async () => {
    const { ensureDir, pathExists } = await import("@mycelish/core");
    const { addSkill } = await import("./add.js");
    const fs = await import("node:fs/promises");
    const cp = await import("node:child_process");

    vi.mocked(pathExists).mockResolvedValue(false);
    vi.mocked(ensureDir).mockResolvedValue(undefined);
    vi.mocked(fs.readFile).mockResolvedValue(`
version: "1.0"
skills: {}
`);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    vi.mocked(cp.exec).mockImplementation((cmd: any, opts: any, callback?: any) => {
      const cb = typeof opts === "function" ? opts : callback;
      if (cb) setImmediate(() => cb(null, "", ""));
      return {} as any;
    });

    await addSkill("anthropic/claude-skills", { global: true });

    expect(ensureDir).toHaveBeenCalledWith(
      expect.stringContaining("global/skills")
    );
  });

  it("clones GitHub repo for remote skills", async () => {
    const { ensureDir, pathExists } = await import("@mycelish/core");
    const { addSkill } = await import("./add.js");
    const fs = await import("node:fs/promises");
    const cp = await import("node:child_process");

    vi.mocked(pathExists).mockResolvedValue(false);
    vi.mocked(ensureDir).mockResolvedValue(undefined);
    vi.mocked(fs.readFile).mockResolvedValue(`
version: "1.0"
skills: {}
`);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    let capturedCommand = "";
    vi.mocked(cp.exec).mockImplementation((cmd: any, opts: any, callback?: any) => {
      capturedCommand = cmd as string;
      const cb = typeof opts === "function" ? opts : callback;
      if (cb) setImmediate(() => cb(null, "", ""));
      return {} as any;
    });

    await addSkill("anthropic/claude-skills", { global: true });

    expect(capturedCommand).toContain("git clone");
    expect(capturedCommand).toContain("github.com/anthropic/claude-skills");
  });

  it("copies files for local skills", async () => {
    const { ensureDir, pathExists } = await import("@mycelish/core");
    const { addSkill } = await import("./add.js");
    const fs = await import("node:fs/promises");

    vi.mocked(pathExists).mockImplementation(async (p) => {
      // Local source exists
      if (p === "./my-skills/custom-skill" || p.includes("custom-skill")) {
        return true;
      }
      return false;
    });
    vi.mocked(ensureDir).mockResolvedValue(undefined);
    vi.mocked(fs.readFile).mockResolvedValue(`
version: "1.0"
skills: {}
`);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    vi.mocked(fs.cp).mockResolvedValue(undefined);

    await addSkill("./my-skills/custom-skill", { global: true });

    expect(fs.cp).toHaveBeenCalledWith(
      expect.stringContaining("custom-skill"),
      expect.stringContaining("global/skills/custom-skill"),
      { recursive: true }
    );
  });

  it("returns error when skill already exists without force flag", async () => {
    const { ensureDir, pathExists } = await import("@mycelish/core");
    const { addSkill } = await import("./add.js");
    const fs = await import("node:fs/promises");

    vi.mocked(pathExists).mockResolvedValue(true);
    vi.mocked(ensureDir).mockResolvedValue(undefined);
    vi.mocked(fs.readFile).mockResolvedValue(`
version: "1.0"
skills:
  claude-skills:
    source: anthropic/claude-skills
`);

    const result = await addSkill("anthropic/claude-skills", { global: true });

    expect(result.success).toBe(false);
    expect(result.error).toContain("already exists");
  });

  it("overwrites skill when force flag is set", async () => {
    const { ensureDir, pathExists } = await import("@mycelish/core");
    const { addSkill } = await import("./add.js");
    const fs = await import("node:fs/promises");
    const cp = await import("node:child_process");

    vi.mocked(pathExists).mockResolvedValue(true);
    vi.mocked(ensureDir).mockResolvedValue(undefined);
    vi.mocked(fs.readFile).mockResolvedValue(`
version: "1.0"
skills:
  claude-skills:
    source: anthropic/claude-skills
`);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    vi.mocked(fs.rm).mockResolvedValue(undefined);
    vi.mocked(cp.exec).mockImplementation((cmd: any, opts: any, callback?: any) => {
      const cb = typeof opts === "function" ? opts : callback;
      if (cb) setImmediate(() => cb(null, "", ""));
      return {} as any;
    });

    const result = await addSkill("anthropic/claude-skills", {
      global: true,
      force: true,
    });

    expect(result.success).toBe(true);
  });

  it("handles git clone failure gracefully", async () => {
    const { ensureDir, pathExists } = await import("@mycelish/core");
    const { addSkill } = await import("./add.js");
    const fs = await import("node:fs/promises");
    const cp = await import("node:child_process");

    vi.mocked(pathExists).mockResolvedValue(false);
    vi.mocked(ensureDir).mockResolvedValue(undefined);
    vi.mocked(fs.readFile).mockResolvedValue(`
version: "1.0"
skills: {}
`);
    vi.mocked(cp.exec).mockImplementation((cmd: any, opts: any, callback?: any) => {
      const cb = typeof opts === "function" ? opts : callback;
      if (cb) setImmediate(() => cb(new Error("git clone failed"), "", "Repository not found"));
      return {} as any;
    });

    const result = await addSkill("anthropic/nonexistent-repo", { global: true });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Failed to clone");
  });

  it("handles local path not found gracefully", async () => {
    const { ensureDir, pathExists } = await import("@mycelish/core");
    const { addSkill } = await import("./add.js");

    vi.mocked(pathExists).mockResolvedValue(false);
    vi.mocked(ensureDir).mockResolvedValue(undefined);

    const result = await addSkill("./nonexistent/path", { global: true });

    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("returns success message with skill name", async () => {
    const { ensureDir, pathExists } = await import("@mycelish/core");
    const { addSkill } = await import("./add.js");
    const fs = await import("node:fs/promises");
    const cp = await import("node:child_process");

    vi.mocked(pathExists).mockResolvedValue(false);
    vi.mocked(ensureDir).mockResolvedValue(undefined);
    vi.mocked(fs.readFile).mockResolvedValue(`
version: "1.0"
skills: {}
`);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    vi.mocked(cp.exec).mockImplementation((cmd: any, opts: any, callback?: any) => {
      const cb = typeof opts === "function" ? opts : callback;
      if (cb) setImmediate(() => cb(null, "", ""));
      return {} as any;
    });

    const result = await addSkill("anthropic/claude-skills", { global: true });

    expect(result.success).toBe(true);
    expect(result.message).toContain("claude-skills");
    expect(result.message).toContain("added");
  });
});

// ============================================================================
// MCP Name Parsing Tests
// ============================================================================

describe("parseMcpName", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("parses simple MCP name correctly", async () => {
    const { parseMcpName } = await import("./add.js");

    const result = parseMcpName("context7");

    expect(result.name).toBe("context7");
    expect(result.isValid).toBe(true);
  });

  it("parses MCP name with hyphens", async () => {
    const { parseMcpName } = await import("./add.js");

    const result = parseMcpName("my-custom-mcp");

    expect(result.name).toBe("my-custom-mcp");
    expect(result.isValid).toBe(true);
  });

  it("parses MCP name with underscores", async () => {
    const { parseMcpName } = await import("./add.js");

    const result = parseMcpName("my_custom_mcp");

    expect(result.name).toBe("my_custom_mcp");
    expect(result.isValid).toBe(true);
  });

  it("rejects empty MCP name", async () => {
    const { parseMcpName } = await import("./add.js");

    const result = parseMcpName("");

    expect(result.isValid).toBe(false);
    expect(result.error).toContain("empty");
  });

  it("rejects MCP name with invalid characters", async () => {
    const { parseMcpName } = await import("./add.js");

    const result = parseMcpName("my mcp with spaces");

    expect(result.isValid).toBe(false);
    expect(result.error).toContain("invalid");
  });
});

// ============================================================================
// Add MCP Tests
// ============================================================================

describe("addMcp", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("adds MCP config to mcps.yaml", async () => {
    const { ensureDir, pathExists } = await import("@mycelish/core");
    const { addMcp } = await import("./add.js");
    const fs = await import("node:fs/promises");

    vi.mocked(pathExists).mockResolvedValue(true);
    vi.mocked(ensureDir).mockResolvedValue(undefined);
    vi.mocked(fs.readFile).mockResolvedValue(`
mcps: {}
`);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const result = await addMcp("context7", {
      command: "npx",
      args: ["-y", "@context7/mcp"],
      global: true,
    });

    expect(result.success).toBe(true);
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining("mcps.yaml"),
      expect.stringContaining("context7"),
      "utf-8"
    );
  });

  it("creates mcps.yaml if it doesn't exist", async () => {
    const { ensureDir, pathExists } = await import("@mycelish/core");
    const { addMcp } = await import("./add.js");
    const fs = await import("node:fs/promises");

    // mcps.yaml doesn't exist
    vi.mocked(pathExists).mockImplementation(async (p) => {
      if (typeof p === "string" && p.includes("mcps.yaml")) {
        return false;
      }
      return true;
    });
    vi.mocked(ensureDir).mockResolvedValue(undefined);
    vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"));
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const result = await addMcp("context7", {
      command: "npx",
      args: ["-y", "@context7/mcp"],
      global: true,
    });

    expect(result.success).toBe(true);
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining("mcps.yaml"),
      expect.stringContaining("context7"),
      "utf-8"
    );
  });

  it("returns error when MCP already exists without force flag", async () => {
    const { ensureDir, pathExists } = await import("@mycelish/core");
    const { addMcp } = await import("./add.js");
    const fs = await import("node:fs/promises");

    vi.mocked(pathExists).mockResolvedValue(true);
    vi.mocked(ensureDir).mockResolvedValue(undefined);
    vi.mocked(fs.readFile).mockResolvedValue(`
mcps:
  context7:
    command: npx
    args:
      - "-y"
      - "@context7/mcp"
`);

    const result = await addMcp("context7", {
      command: "npx",
      args: ["-y", "@context7/mcp"],
      global: true,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("already exists");
  });

  it("overwrites MCP when force flag is set", async () => {
    const { ensureDir, pathExists } = await import("@mycelish/core");
    const { addMcp } = await import("./add.js");
    const fs = await import("node:fs/promises");

    vi.mocked(pathExists).mockResolvedValue(true);
    vi.mocked(ensureDir).mockResolvedValue(undefined);
    vi.mocked(fs.readFile).mockResolvedValue(`
mcps:
  context7:
    command: old-command
`);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const result = await addMcp("context7", {
      command: "npx",
      args: ["-y", "@context7/mcp"],
      global: true,
      force: true,
    });

    expect(result.success).toBe(true);
    expect(fs.writeFile).toHaveBeenCalled();
  });

  it("handles errors gracefully", async () => {
    const { ensureDir, pathExists } = await import("@mycelish/core");
    const { addMcp } = await import("./add.js");
    const fs = await import("node:fs/promises");

    vi.mocked(pathExists).mockResolvedValue(true);
    vi.mocked(ensureDir).mockResolvedValue(undefined);
    vi.mocked(fs.readFile).mockResolvedValue(`mcps: {}`);
    vi.mocked(fs.writeFile).mockRejectedValue(new Error("Permission denied"));

    const result = await addMcp("context7", {
      command: "npx",
      args: ["-y", "@context7/mcp"],
      global: true,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("returns success message with MCP name", async () => {
    const { ensureDir, pathExists } = await import("@mycelish/core");
    const { addMcp } = await import("./add.js");
    const fs = await import("node:fs/promises");

    vi.mocked(pathExists).mockResolvedValue(true);
    vi.mocked(ensureDir).mockResolvedValue(undefined);
    vi.mocked(fs.readFile).mockResolvedValue(`mcps: {}`);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const result = await addMcp("context7", {
      command: "npx",
      args: ["-y", "@context7/mcp"],
      global: true,
    });

    expect(result.success).toBe(true);
    expect(result.message).toContain("context7");
    expect(result.message).toContain("added");
  });

  it("adds MCP to project config when global is false", async () => {
    const { ensureDir, pathExists } = await import("@mycelish/core");
    const { addMcp } = await import("./add.js");
    const fs = await import("node:fs/promises");

    vi.mocked(pathExists).mockResolvedValue(true);
    vi.mocked(ensureDir).mockResolvedValue(undefined);
    vi.mocked(fs.readFile).mockResolvedValue(`mcps: {}`);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const result = await addMcp("my-mcp", {
      command: "node",
      args: ["server.js"],
      global: false,
      projectRoot: "/my/project",
    });

    expect(result.success).toBe(true);
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining("/my/project/.mycelium/mcps.yaml"),
      expect.any(String),
      "utf-8"
    );
  });

  it("includes enabled flag when specified", async () => {
    const { ensureDir, pathExists } = await import("@mycelish/core");
    const { addMcp } = await import("./add.js");
    const fs = await import("node:fs/promises");

    vi.mocked(pathExists).mockResolvedValue(true);
    vi.mocked(ensureDir).mockResolvedValue(undefined);
    vi.mocked(fs.readFile).mockResolvedValue(`mcps: {}`);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    await addMcp("context7", {
      command: "npx",
      args: ["-y", "@context7/mcp"],
      enabled: true,
      global: true,
    });

    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining("enabled: true"),
      "utf-8"
    );
  });

  it("includes env vars when specified", async () => {
    const { ensureDir, pathExists } = await import("@mycelish/core");
    const { addMcp } = await import("./add.js");
    const fs = await import("node:fs/promises");

    vi.mocked(pathExists).mockResolvedValue(true);
    vi.mocked(ensureDir).mockResolvedValue(undefined);
    vi.mocked(fs.readFile).mockResolvedValue(`mcps: {}`);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    await addMcp("context7", {
      command: "npx",
      args: ["-y", "@context7/mcp"],
      env: { API_KEY: "${CONTEXT7_API_KEY}" },
      global: true,
    });

    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining("API_KEY"),
      "utf-8"
    );
  });
});

// ============================================================================
// Commander.js Command Tests
// ============================================================================

describe("addCommand (Commander.js)", () => {
  it("exports a Command instance", async () => {
    const { addCommand } = await import("./add.js");

    expect(addCommand).toBeDefined();
    expect(addCommand.name()).toBe("add");
  });

  it("has skill subcommand", async () => {
    const { addCommand } = await import("./add.js");

    const skillCmd = addCommand.commands.find((cmd) => cmd.name() === "skill");
    expect(skillCmd).toBeDefined();
  });

  it("has mcp subcommand", async () => {
    const { addCommand } = await import("./add.js");

    const mcpCmd = addCommand.commands.find((cmd) => cmd.name() === "mcp");
    expect(mcpCmd).toBeDefined();
  });

  it("skill subcommand has --global option", async () => {
    const { addCommand } = await import("./add.js");

    const skillCmd = addCommand.commands.find((cmd) => cmd.name() === "skill");
    const globalOption = skillCmd?.options.find(
      (opt) => opt.short === "-g" || opt.long === "--global"
    );
    expect(globalOption).toBeDefined();
  });

  it("skill subcommand has --force option", async () => {
    const { addCommand } = await import("./add.js");

    const skillCmd = addCommand.commands.find((cmd) => cmd.name() === "skill");
    const forceOption = skillCmd?.options.find(
      (opt) => opt.short === "-f" || opt.long === "--force"
    );
    expect(forceOption).toBeDefined();
  });

  it("mcp subcommand has --global option", async () => {
    const { addCommand } = await import("./add.js");

    const mcpCmd = addCommand.commands.find((cmd) => cmd.name() === "mcp");
    const globalOption = mcpCmd?.options.find(
      (opt) => opt.short === "-g" || opt.long === "--global"
    );
    expect(globalOption).toBeDefined();
  });

  it("mcp subcommand has --command option", async () => {
    const { addCommand } = await import("./add.js");

    const mcpCmd = addCommand.commands.find((cmd) => cmd.name() === "mcp");
    const commandOption = mcpCmd?.options.find(
      (opt) => opt.short === "-c" || opt.long === "--command"
    );
    expect(commandOption).toBeDefined();
  });

  it("mcp subcommand has --args option", async () => {
    const { addCommand } = await import("./add.js");

    const mcpCmd = addCommand.commands.find((cmd) => cmd.name() === "mcp");
    const argsOption = mcpCmd?.options.find(
      (opt) => opt.short === "-a" || opt.long === "--args"
    );
    expect(argsOption).toBeDefined();
  });
});
