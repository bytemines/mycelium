/**
 * Tests for doctor command - written FIRST following TDD
 *
 * The doctor command checks system health and offers to fix issues:
 * - Checks if global mycelium dir exists
 * - Checks if manifest.yaml is valid
 * - Checks if each configured tool path exists
 * - Detects broken symlinks
 * - Validates MCP config JSON syntax
 * - Validates MCP config YAML syntax
 * - Reports all issues found
 * - Shows green checkmarks for passing checks
 * - Shows red X for failing checks
 * - Offers fix suggestions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as path from "node:path";

// Mock fs/promises module
vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn(),
  writeFile: vi.fn(),
  access: vi.fn(),
  readFile: vi.fn(),
  readdir: vi.fn(),
  lstat: vi.fn(),
  stat: vi.fn(),
  readlink: vi.fn(),
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
  TOOL_REGISTRY: {
    "claude-code": {
      id: "claude-code",
      display: { name: "Claude Code", icon: "claude", color: "#D97706" },
      cli: { command: "claude" },
      paths: {
        mcp: "~/.claude.json",
        projectMcp: null,
        skills: "~/.claude/skills",
        projectSkills: null,
        globalMemory: "~/.claude/CLAUDE.md",
        projectMemory: null,
        agents: null,
        projectAgents: null,
        rules: null,
        hooks: null,
        backupDirs: [],
      },
      mcp: { format: "json", key: "mcpServers", entryShape: "standard" },
      scopes: ["shared", "coding"],
      capabilities: ["mcp", "skills", "memory", "hooks"],
      enabled: true,
      memoryMaxLines: 200,
    },
    codex: {
      id: "codex",
      display: { name: "Codex CLI", icon: "codex", color: "#10B981" },
      cli: { command: "codex" },
      paths: {
        mcp: "~/.codex/config.toml",
        projectMcp: null,
        skills: "~/.codex/skills",
        projectSkills: null,
        globalMemory: "~/.codex/AGENTS.md",
        projectMemory: null,
        agents: null,
        projectAgents: null,
        rules: null,
        hooks: null,
        backupDirs: [],
      },
      mcp: { format: "toml", key: "mcp.servers", entryShape: "standard" },
      scopes: ["shared", "coding"],
      capabilities: ["mcp", "skills", "memory"],
      enabled: true,
      memoryMaxLines: null,
    },
    "gemini-cli": {
      id: "gemini-cli",
      display: { name: "Gemini CLI", icon: "gemini", color: "#4285F4" },
      cli: { command: "gemini" },
      paths: {
        mcp: "~/.gemini/settings.json",
        projectMcp: null,
        skills: "~/.gemini/extensions",
        projectSkills: null,
        globalMemory: "~/.gemini/GEMINI.md",
        projectMemory: null,
        agents: null,
        projectAgents: null,
        rules: null,
        hooks: null,
        backupDirs: [],
      },
      mcp: { format: "json", key: "mcpServers", entryShape: "standard" },
      scopes: ["shared", "coding"],
      capabilities: ["mcp", "skills", "memory"],
      enabled: true,
      memoryMaxLines: null,
    },
    opencode: {
      id: "opencode",
      display: { name: "OpenCode", icon: "opencode", color: "#8B5CF6" },
      cli: { command: "opencode" },
      paths: {
        mcp: "~/.config/opencode/opencode.json",
        projectMcp: null,
        skills: "~/.config/opencode/plugin",
        projectSkills: null,
        globalMemory: "~/.opencode/context.md",
        projectMemory: null,
        agents: null,
        projectAgents: null,
        rules: null,
        hooks: null,
        backupDirs: [],
      },
      mcp: { format: "json", key: "mcp", entryShape: "opencode" },
      scopes: ["shared", "coding"],
      capabilities: ["mcp", "skills", "memory"],
      enabled: true,
      memoryMaxLines: null,
    },
    openclaw: {
      id: "openclaw",
      display: { name: "OpenClaw", icon: "openclaw", color: "#EC4899" },
      cli: null,
      paths: {
        mcp: "~/.openclaw/openclaw.json",
        projectMcp: null,
        skills: "~/.openclaw/skills",
        projectSkills: null,
        globalMemory: "~/.openclaw/MEMORY.md",
        projectMemory: null,
        agents: null,
        projectAgents: null,
        rules: null,
        hooks: null,
        backupDirs: [],
      },
      mcp: { format: "json", key: "plugins.entries", entryShape: "openclaw" },
      scopes: ["shared", "personal"],
      capabilities: ["mcp", "skills", "memory"],

      enabled: true,
      memoryMaxLines: null,
    },
    aider: {
      id: "aider",
      display: { name: "Aider", icon: "aider", color: "#F59E0B" },
      cli: { command: "aider" },
      paths: {
        mcp: "~/.aider.conf.yml",
        projectMcp: null,
        skills: "~/.aider/plugins",
        projectSkills: null,
        globalMemory: "~/.aider/MEMORY.md",
        projectMemory: null,
        agents: null,
        projectAgents: null,
        rules: null,
        hooks: null,
        backupDirs: [],
      },
      mcp: { format: "yaml", key: "mcps", entryShape: "standard" },
      scopes: ["shared", "coding"],
      capabilities: ["mcp", "memory"],
      enabled: true,
      memoryMaxLines: null,
    },
  },
  ALL_TOOL_IDS: ["claude-code", "codex", "gemini-cli", "opencode", "openclaw", "aider"],
  resolvePath: (p: any) => {
    if (p === null) return null;
    if (typeof p === "string") {
      if (p.startsWith("~")) return path.join("/mock/home", p.slice(1));
      return p;
    }
    const platform = process.platform as string;
    const val = (p as any)[platform] ?? (p as any).linux;
    if (val?.startsWith("~")) return path.join("/mock/home", val.slice(1));
    return val;
  },
  toolsForScope: (scope: string) => {
    // Simple mock for test purposes
    const registry: any = {
      "claude-code": { id: "claude-code", scopes: ["shared", "coding"] },
      codex: { id: "codex", scopes: ["shared", "coding"] },
      "gemini-cli": { id: "gemini-cli", scopes: ["shared", "coding"] },
      opencode: { id: "opencode", scopes: ["shared", "coding"] },
      openclaw: { id: "openclaw", scopes: ["shared", "personal"] },
      aider: { id: "aider", scopes: ["shared", "coding"] },
    };
    return Object.values(registry).filter((t: any) => t.scopes.includes(scope));
  },
}));

// ============================================================================
// Types
// ============================================================================

interface DiagnosticResult {
  name: string;
  status: "pass" | "fail" | "warn";
  message: string;
  fix?: string;
}

interface DoctorResult {
  success: boolean;
  checks: DiagnosticResult[];
  summary: {
    passed: number;
    failed: number;
    warnings: number;
  };
}

// ============================================================================
// Test Suites
// ============================================================================

describe("doctor command", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("checkGlobalMyceliumExists", () => {
    it("returns pass when ~/.mycelium exists", async () => {
      const { pathExists } = await import("@mycelish/core");
      vi.mocked(pathExists).mockResolvedValue(true);

      const { checkGlobalMyceliumExists } = await import("./doctor.js");
      const result = await checkGlobalMyceliumExists();

      expect(result.status).toBe("pass");
      expect(result.name).toBe("Global Mycelium Directory");
      expect(result.message).toContain("exists");
    });

    it("returns fail when ~/.mycelium does not exist", async () => {
      const { pathExists } = await import("@mycelish/core");
      vi.mocked(pathExists).mockResolvedValue(false);

      const { checkGlobalMyceliumExists } = await import("./doctor.js");
      const result = await checkGlobalMyceliumExists();

      expect(result.status).toBe("fail");
      expect(result.message).toContain("not found");
      expect(result.fix).toContain("mycelium init --global");
    });
  });

  describe("checkManifestValid", () => {
    it("returns pass when manifest.yaml is valid", async () => {
      const { pathExists } = await import("@mycelish/core");
      const fs = await import("node:fs/promises");

      vi.mocked(pathExists).mockResolvedValue(true);
      vi.mocked(fs.readFile).mockResolvedValue(`
version: "1.0"
tools:
  claude-code:
    enabled: true
memory:
  scopes:
    shared:
      sync_to: [claude-code]
      path: global/memory/shared/
`);

      const { checkManifestValid } = await import("./doctor.js");
      const result = await checkManifestValid();

      expect(result.status).toBe("pass");
      expect(result.name).toBe("Manifest Configuration");
      expect(result.message).toContain("valid");
    });

    it("returns fail when manifest.yaml does not exist", async () => {
      const { pathExists } = await import("@mycelish/core");
      vi.mocked(pathExists).mockResolvedValue(false);

      const { checkManifestValid } = await import("./doctor.js");
      const result = await checkManifestValid();

      expect(result.status).toBe("fail");
      expect(result.message).toContain("not found");
      expect(result.fix).toContain("mycelium init --global");
    });

    it("returns fail when manifest.yaml has invalid YAML syntax", async () => {
      const { pathExists } = await import("@mycelish/core");
      const fs = await import("node:fs/promises");

      vi.mocked(pathExists).mockResolvedValue(true);
      vi.mocked(fs.readFile).mockResolvedValue(`
version: "1.0"
tools:
  claude-code:
    enabled: [true  # Invalid YAML - unclosed bracket
`);

      const { checkManifestValid } = await import("./doctor.js");
      const result = await checkManifestValid();

      expect(result.status).toBe("fail");
      expect(result.message).toContain("Invalid");
    });
  });

  describe("checkToolPathExists", () => {
    it("returns pass when tool skills directory exists", async () => {
      const { pathExists } = await import("@mycelish/core");
      vi.mocked(pathExists).mockResolvedValue(true);

      const { checkToolPathExists } = await import("./doctor.js");
      const result = await checkToolPathExists("claude-code");

      expect(result.status).toBe("pass");
      expect(result.name).toContain("Claude Code");
    });

    it("returns warn when tool skills directory does not exist", async () => {
      const { pathExists } = await import("@mycelish/core");
      vi.mocked(pathExists).mockResolvedValue(false);

      const { checkToolPathExists } = await import("./doctor.js");
      const result = await checkToolPathExists("claude-code");

      expect(result.status).toBe("warn");
      expect(result.message).toContain("not found");
      expect(result.fix).toContain("mycelium sync");
    });
  });

  describe("checkBrokenSymlinks", () => {
    it("returns pass when no symlinks are broken", async () => {
      const { pathExists } = await import("@mycelish/core");
      const fs = await import("node:fs/promises");

      vi.mocked(pathExists).mockResolvedValue(true);
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: "skill1", isSymbolicLink: () => true } as any,
        { name: "skill2", isSymbolicLink: () => true } as any,
      ]);
      // Both symlinks resolve correctly
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as any);

      const { checkBrokenSymlinks } = await import("./doctor.js");
      const result = await checkBrokenSymlinks("/mock/home/.claude/skills");

      expect(result.status).toBe("pass");
      expect(result.message).toContain("valid");
    });

    it("returns fail when symlinks are broken", async () => {
      const { pathExists } = await import("@mycelish/core");
      const fs = await import("node:fs/promises");

      vi.mocked(pathExists).mockResolvedValue(true);
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: "skill1", isSymbolicLink: () => true } as any,
        { name: "broken_skill", isSymbolicLink: () => true } as any,
      ]);
      // First symlink works, second is broken
      vi.mocked(fs.stat)
        .mockResolvedValueOnce({ isDirectory: () => true } as any)
        .mockRejectedValueOnce(new Error("ENOENT"));

      const { checkBrokenSymlinks } = await import("./doctor.js");
      const result = await checkBrokenSymlinks("/mock/home/.claude/skills");

      expect(result.status).toBe("fail");
      expect(result.message).toContain("broken");
      expect(result.fix).toContain("mycelium sync");
    });

    it("returns pass when directory does not exist", async () => {
      const { pathExists } = await import("@mycelish/core");
      vi.mocked(pathExists).mockResolvedValue(false);

      const { checkBrokenSymlinks } = await import("./doctor.js");
      const result = await checkBrokenSymlinks("/mock/home/.claude/skills");

      expect(result.status).toBe("pass");
      expect(result.message).toContain("not present");
    });
  });

  describe("checkMcpConfigJson", () => {
    it("returns pass when MCP JSON config is valid", async () => {
      const { pathExists } = await import("@mycelish/core");
      const fs = await import("node:fs/promises");

      vi.mocked(pathExists).mockResolvedValue(true);
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({
          mcpServers: {
            "mcp-server-1": { command: "npx", args: ["-y", "mcp-server-1"] },
          },
        })
      );

      const { checkMcpConfigJson } = await import("./doctor.js");
      const result = await checkMcpConfigJson("/mock/home/.claude/mcp.json");

      expect(result.status).toBe("pass");
      expect(result.message).toContain("valid");
    });

    it("returns fail when MCP JSON config has invalid syntax", async () => {
      const { pathExists } = await import("@mycelish/core");
      const fs = await import("node:fs/promises");

      vi.mocked(pathExists).mockResolvedValue(true);
      vi.mocked(fs.readFile).mockResolvedValue('{ "mcpServers": { invalid }');

      const { checkMcpConfigJson } = await import("./doctor.js");
      const result = await checkMcpConfigJson("/mock/home/.claude/mcp.json");

      expect(result.status).toBe("fail");
      expect(result.message).toContain("Invalid JSON");
    });

    it("returns pass when config file does not exist (not required)", async () => {
      const { pathExists } = await import("@mycelish/core");
      vi.mocked(pathExists).mockResolvedValue(false);

      const { checkMcpConfigJson } = await import("./doctor.js");
      const result = await checkMcpConfigJson("/mock/home/.claude/mcp.json");

      expect(result.status).toBe("pass");
      expect(result.message).toContain("not present");
    });
  });

  describe("checkMcpConfigYaml", () => {
    it("returns pass when MCP YAML config is valid", async () => {
      const { pathExists } = await import("@mycelish/core");
      const fs = await import("node:fs/promises");

      vi.mocked(pathExists).mockResolvedValue(true);
      vi.mocked(fs.readFile).mockResolvedValue(`
mcps:
  mcp-server-1:
    command: npx
    args:
      - -y
      - mcp-server-1
`);

      const { checkMcpConfigYaml } = await import("./doctor.js");
      const result = await checkMcpConfigYaml(
        "/mock/home/.config/opencode/config.yaml"
      );

      expect(result.status).toBe("pass");
      expect(result.message).toContain("valid");
    });

    it("returns fail when MCP YAML config has invalid syntax", async () => {
      const { pathExists } = await import("@mycelish/core");
      const fs = await import("node:fs/promises");

      vi.mocked(pathExists).mockResolvedValue(true);
      vi.mocked(fs.readFile).mockResolvedValue(`
mcps:
  mcp-server-1:
    command: npx
    args: [invalid  # Unclosed bracket
`);

      const { checkMcpConfigYaml } = await import("./doctor.js");
      const result = await checkMcpConfigYaml(
        "/mock/home/.config/opencode/config.yaml"
      );

      expect(result.status).toBe("fail");
      expect(result.message).toContain("Invalid YAML");
    });

    it("returns pass when config file does not exist (not required)", async () => {
      const { pathExists } = await import("@mycelish/core");
      vi.mocked(pathExists).mockResolvedValue(false);

      const { checkMcpConfigYaml } = await import("./doctor.js");
      const result = await checkMcpConfigYaml(
        "/mock/home/.config/opencode/config.yaml"
      );

      expect(result.status).toBe("pass");
      expect(result.message).toContain("not present");
    });
  });

  describe("checkMemoryFilesExist", () => {
    it("returns pass when memory directories have files", async () => {
      const { pathExists } = await import("@mycelish/core");
      const fs = await import("node:fs/promises");

      vi.mocked(pathExists).mockResolvedValue(true);
      vi.mocked(fs.readdir).mockResolvedValue(["memory1.md", "memory2.md"] as any);

      const { checkMemoryFilesExist } = await import("./doctor.js");
      const result = await checkMemoryFilesExist();

      expect(result.status).toBe("pass");
      expect(result.message).toContain("memory files found");
    });

    it("returns warn when no memory files exist", async () => {
      const { pathExists } = await import("@mycelish/core");
      const fs = await import("node:fs/promises");

      vi.mocked(pathExists).mockResolvedValue(true);
      vi.mocked(fs.readdir).mockResolvedValue([] as any);

      const { checkMemoryFilesExist } = await import("./doctor.js");
      const result = await checkMemoryFilesExist();

      expect(result.status).toBe("warn");
      expect(result.message).toContain("No memory files");
    });

    it("returns warn when memory directory does not exist", async () => {
      const { pathExists } = await import("@mycelish/core");
      vi.mocked(pathExists).mockResolvedValue(false);

      const { checkMemoryFilesExist } = await import("./doctor.js");
      const result = await checkMemoryFilesExist();

      expect(result.status).toBe("warn");
      expect(result.message).toContain("directory not found");
    });
  });

  describe("checkOrphanedConfigs", () => {
    it("returns pass when no orphaned configs exist", async () => {
      const { pathExists } = await import("@mycelish/core");
      const fs = await import("node:fs/promises");

      // Manifest has claude-code enabled
      vi.mocked(pathExists).mockResolvedValue(true);
      vi.mocked(fs.readFile).mockResolvedValue(`
version: "1.0"
tools:
  claude-code:
    enabled: true
`);
      // Skills directory has skill for enabled tool
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: "skill1", isSymbolicLink: () => true } as any,
      ]);

      const { checkOrphanedConfigs } = await import("./doctor.js");
      const result = await checkOrphanedConfigs();

      expect(result.status).toBe("pass");
    });

    it("returns warn when orphaned skill symlinks exist for disabled tools", async () => {
      const { pathExists } = await import("@mycelish/core");
      const fs = await import("node:fs/promises");

      // Manifest has claude-code disabled
      vi.mocked(pathExists).mockResolvedValue(true);
      vi.mocked(fs.readFile).mockResolvedValue(`
version: "1.0"
tools:
  claude-code:
    enabled: false
`);
      // But skills still exist in tool directory
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: "skill1", isSymbolicLink: () => true } as any,
      ]);

      const { checkOrphanedConfigs } = await import("./doctor.js");
      const result = await checkOrphanedConfigs();

      expect(result.status).toBe("warn");
      expect(result.message).toContain("orphaned");
      expect(result.fix).toContain("mycelium sync");
    });
  });

  describe("runAllChecks", () => {
    it("runs all diagnostic checks and returns summary", async () => {
      const { pathExists } = await import("@mycelish/core");
      const fs = await import("node:fs/promises");

      // Setup: everything is healthy
      vi.mocked(pathExists).mockResolvedValue(true);
      vi.mocked(fs.readFile).mockResolvedValue(`
version: "1.0"
tools:
  claude-code:
    enabled: true
memory:
  scopes:
    shared:
      sync_to: [claude-code]
      path: global/memory/shared/
`);
      vi.mocked(fs.readdir).mockResolvedValue(["memory1.md"] as any);
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as any);

      const { runAllChecks } = await import("./doctor.js");
      const result = await runAllChecks();

      expect(result.checks).toBeDefined();
      expect(result.checks.length).toBeGreaterThan(0);
      expect(result.summary).toBeDefined();
      expect(result.summary.passed).toBeGreaterThanOrEqual(0);
      expect(result.summary.failed).toBeGreaterThanOrEqual(0);
      expect(result.summary.warnings).toBeGreaterThanOrEqual(0);
    });

    it("reports all issues found", async () => {
      const { pathExists } = await import("@mycelish/core");

      // Setup: mycelium not initialized
      vi.mocked(pathExists).mockResolvedValue(false);

      const { runAllChecks } = await import("./doctor.js");
      const result = await runAllChecks();

      // Should have at least one failure
      expect(result.summary.failed).toBeGreaterThanOrEqual(1);
      // First check should be about global directory
      expect(result.checks[0].status).toBe("fail");
    });
  });

  describe("formatDoctorOutput", () => {
    it("shows green checkmarks for passing checks", async () => {
      const { formatDoctorOutput } = await import("./doctor.js");

      const result: DoctorResult = {
        success: true,
        checks: [
          { name: "Test Check", status: "pass", message: "All good" },
        ],
        summary: { passed: 1, failed: 0, warnings: 0 },
      };

      const output = formatDoctorOutput(result);

      // Should contain green color code and checkmark
      expect(output).toContain("\u001b[32m"); // Green
      expect(output).toContain("\u2714"); // Checkmark
    });

    it("shows red X for failing checks", async () => {
      const { formatDoctorOutput } = await import("./doctor.js");

      const result: DoctorResult = {
        success: false,
        checks: [
          {
            name: "Test Check",
            status: "fail",
            message: "Something broke",
            fix: "Run this command",
          },
        ],
        summary: { passed: 0, failed: 1, warnings: 0 },
      };

      const output = formatDoctorOutput(result);

      // Should contain red color code and X mark
      expect(output).toContain("\u001b[31m"); // Red
      expect(output).toContain("\u2718"); // X mark
    });

    it("shows yellow warning for warnings", async () => {
      const { formatDoctorOutput } = await import("./doctor.js");

      const result: DoctorResult = {
        success: true,
        checks: [
          { name: "Test Check", status: "warn", message: "Minor issue" },
        ],
        summary: { passed: 0, failed: 0, warnings: 1 },
      };

      const output = formatDoctorOutput(result);

      // Should contain yellow color code and warning symbol
      expect(output).toContain("\u001b[33m"); // Yellow
      expect(output).toContain("\u26A0"); // Warning
    });

    it("shows fix suggestions for failed checks", async () => {
      const { formatDoctorOutput } = await import("./doctor.js");

      const result: DoctorResult = {
        success: false,
        checks: [
          {
            name: "Test Check",
            status: "fail",
            message: "Something broke",
            fix: "mycelium init --global",
          },
        ],
        summary: { passed: 0, failed: 1, warnings: 0 },
      };

      const output = formatDoctorOutput(result);

      expect(output).toContain("Fix:");
      expect(output).toContain("mycelium init --global");
    });

    it("shows summary at the end", async () => {
      const { formatDoctorOutput } = await import("./doctor.js");

      const result: DoctorResult = {
        success: true,
        checks: [
          { name: "Check 1", status: "pass", message: "OK" },
          { name: "Check 2", status: "warn", message: "Minor" },
          { name: "Check 3", status: "fail", message: "Bad", fix: "Fix it" },
        ],
        summary: { passed: 1, failed: 1, warnings: 1 },
      };

      const output = formatDoctorOutput(result);

      expect(output).toContain("Summary:");
      expect(output).toContain("1 passed");
      expect(output).toContain("1 failed");
      expect(output).toContain("1 warning");
    });
  });

  describe("checkMcpServerConnectivity", () => {
    it("returns pass for valid command", async () => {
      const { checkMcpServerConnectivity } = await import("./doctor.js");
      const result = await checkMcpServerConnectivity("echo", ["hello"]);
      expect(result.status).toBe("pass");
    });

    it("returns fail for invalid command", async () => {
      const { checkMcpServerConnectivity } = await import("./doctor.js");
      const result = await checkMcpServerConnectivity("nonexistent-cmd-xyz", []);
      expect(result.status).toBe("fail");
    });

    it("includes command name in message", async () => {
      const { checkMcpServerConnectivity } = await import("./doctor.js");
      const result = await checkMcpServerConnectivity("echo", ["test"]);
      expect(result.message).toContain("echo");
    });
  });

  describe("checkToolVersions", () => {
    it("returns a diagnostic result", async () => {
      const { checkToolVersions } = await import("./doctor.js");
      const result = await checkToolVersions();
      expect(result.status).toBeDefined();
      expect(result.name).toContain("Tool Versions");
    });
  });

  describe("checkMemoryFileSize", () => {
    it("returns pass when memory files are within limits", async () => {
      const { pathExists } = await import("@mycelish/core");
      const fs = await import("node:fs/promises");

      vi.mocked(pathExists).mockResolvedValue(true);
      vi.mocked(fs.readFile).mockResolvedValue("Line 1\nLine 2\nLine 3");

      const { checkMemoryFileSize } = await import("./doctor.js");
      const result = await checkMemoryFileSize("/mock/path/MEMORY.md", 200);
      expect(result.status).toBe("pass");
    });

    it("returns warn when memory file exceeds limit", async () => {
      const { pathExists } = await import("@mycelish/core");
      const fs = await import("node:fs/promises");

      vi.mocked(pathExists).mockResolvedValue(true);
      const longContent = Array.from({ length: 250 }, (_, i) => `Line ${i}`).join("\n");
      vi.mocked(fs.readFile).mockResolvedValue(longContent);

      const { checkMemoryFileSize } = await import("./doctor.js");
      const result = await checkMemoryFileSize("/mock/path/MEMORY.md", 200);
      expect(result.status).toBe("warn");
      expect(result.message).toContain("250");
    });

    it("returns pass when file does not exist", async () => {
      const { pathExists } = await import("@mycelish/core");
      vi.mocked(pathExists).mockResolvedValue(false);

      const { checkMemoryFileSize } = await import("./doctor.js");
      const result = await checkMemoryFileSize("/mock/path/MEMORY.md", 200);
      expect(result.status).toBe("pass");
    });
  });

  describe("doctorCommand (Commander.js)", () => {
    it("exports a Command instance", async () => {
      const { doctorCommand } = await import("./doctor.js");

      expect(doctorCommand).toBeDefined();
      expect(doctorCommand.name()).toBe("doctor");
    });

    it("has --json option", async () => {
      const { doctorCommand } = await import("./doctor.js");

      const jsonOption = doctorCommand.options.find(
        (opt) => opt.short === "-j" || opt.long === "--json"
      );
      expect(jsonOption).toBeDefined();
    });

    it("has --fix option", async () => {
      const { doctorCommand } = await import("./doctor.js");

      const fixOption = doctorCommand.options.find(
        (opt) => opt.short === "-f" || opt.long === "--fix"
      );
      expect(fixOption).toBeDefined();
    });

    it("has description", async () => {
      const { doctorCommand } = await import("./doctor.js");

      expect(doctorCommand.description()).toContain("health");
    });
  });
});
