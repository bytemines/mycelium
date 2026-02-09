/**
 * Tests for config-merger module - written FIRST following TDD
 *
 * Config merge priority: Project > Machine > Global
 * - Global provides base set of skills/mcps/memory
 * - Machine can add/override for hardware-specific needs
 * - Project can add/override/DISABLE specific items (enabled: false)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import type { McpServerConfig, McpsConfig, MergedConfig, ConfigLevel, MemoryConfig, Skill } from "@mycelsh/core";

// Mock fs module
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  access: vi.fn(),
}));

describe("mergeConfigs", () => {
  it("merges global and project MCP configs", async () => {
    const { mergeConfigs } = await import("./config-merger.js");

    const globalConfig: Partial<MergedConfig> = {
      mcps: {
        "context7": {
          command: "npx",
          args: ["-y", "@context7/mcp"],
          enabled: true,
        },
        "filesystem": {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-filesystem"],
          enabled: true,
        },
      },
    };

    const projectConfig: Partial<MergedConfig> = {
      mcps: {
        "project-specific": {
          command: "node",
          args: ["./local-mcp.js"],
          enabled: true,
        },
      },
    };

    const result = mergeConfigs(globalConfig, undefined, projectConfig);

    // Should have all MCPs from both configs
    expect(result.mcps).toHaveProperty("context7");
    expect(result.mcps).toHaveProperty("filesystem");
    expect(result.mcps).toHaveProperty("project-specific");

    // Global MCPs should be preserved
    expect(result.mcps["context7"].command).toBe("npx");
    expect(result.mcps["filesystem"].command).toBe("npx");

    // Project MCP should be added
    expect(result.mcps["project-specific"].command).toBe("node");
  });

  it("project can override specific MCP args", async () => {
    const { mergeConfigs } = await import("./config-merger.js");

    const globalConfig: Partial<MergedConfig> = {
      mcps: {
        "context7": {
          command: "npx",
          args: ["-y", "@context7/mcp"],
          env: { DEFAULT_ENV: "value" },
          enabled: true,
        },
      },
    };

    const projectConfig: Partial<MergedConfig> = {
      mcps: {
        "context7": {
          command: "npx",
          args: ["-y", "@context7/mcp", "--custom-flag"],
          enabled: true,
        },
      },
    };

    const result = mergeConfigs(globalConfig, undefined, projectConfig);

    // Args should be overridden by project
    expect(result.mcps["context7"].args).toEqual(["-y", "@context7/mcp", "--custom-flag"]);
    // Command should remain from project (or global if not overridden)
    expect(result.mcps["context7"].command).toBe("npx");
  });

  it("project can disable global MCPs with enabled: false", async () => {
    const { mergeConfigs } = await import("./config-merger.js");

    const globalConfig: Partial<MergedConfig> = {
      mcps: {
        "context7": {
          command: "npx",
          args: ["-y", "@context7/mcp"],
          enabled: true,
        },
        "filesystem": {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-filesystem"],
          enabled: true,
        },
      },
    };

    const projectConfig: Partial<MergedConfig> = {
      mcps: {
        "context7": {
          command: "npx",
          args: ["-y", "@context7/mcp"],
          enabled: false, // Disable this MCP for the project
        },
      },
    };

    const result = mergeConfigs(globalConfig, undefined, projectConfig);

    // context7 should be disabled
    expect(result.mcps["context7"].enabled).toBe(false);
    // filesystem should remain enabled
    expect(result.mcps["filesystem"].enabled).toBe(true);
  });

  it("project can add new MCPs not in global", async () => {
    const { mergeConfigs } = await import("./config-merger.js");

    const globalConfig: Partial<MergedConfig> = {
      mcps: {
        "context7": {
          command: "npx",
          args: ["-y", "@context7/mcp"],
          enabled: true,
        },
      },
    };

    const projectConfig: Partial<MergedConfig> = {
      mcps: {
        "custom-db": {
          command: "node",
          args: ["./db-mcp.js"],
          env: { DB_URL: "postgres://localhost" },
          enabled: true,
        },
      },
    };

    const result = mergeConfigs(globalConfig, undefined, projectConfig);

    // Both should be present
    expect(result.mcps).toHaveProperty("context7");
    expect(result.mcps).toHaveProperty("custom-db");

    // New MCP should have correct config
    expect(result.mcps["custom-db"].command).toBe("node");
    expect(result.mcps["custom-db"].env).toEqual({ DB_URL: "postgres://localhost" });
  });

  it("machine configs merge between global and project", async () => {
    const { mergeConfigs } = await import("./config-merger.js");

    const globalConfig: Partial<MergedConfig> = {
      mcps: {
        "context7": {
          command: "npx",
          args: ["-y", "@context7/mcp"],
          enabled: true,
        },
      },
    };

    const machineConfig: Partial<MergedConfig> = {
      mcps: {
        "context7": {
          command: "npx",
          args: ["-y", "@context7/mcp"],
          env: { MACHINE_SPECIFIC: "gpu-optimized" },
          enabled: true,
        },
        "machine-gpu": {
          command: "cuda-mcp",
          args: ["--gpu=0"],
          enabled: true,
        },
      },
    };

    const projectConfig: Partial<MergedConfig> = {
      mcps: {
        "project-specific": {
          command: "node",
          args: ["./local.js"],
          enabled: true,
        },
      },
    };

    const result = mergeConfigs(globalConfig, machineConfig, projectConfig);

    // All MCPs should be present
    expect(result.mcps).toHaveProperty("context7");
    expect(result.mcps).toHaveProperty("machine-gpu");
    expect(result.mcps).toHaveProperty("project-specific");

    // Machine-specific env should be present (merged from machine config)
    expect(result.mcps["context7"].env).toEqual({ MACHINE_SPECIFIC: "gpu-optimized" });
  });

  it("tracks source of each config item", async () => {
    const { mergeConfigs } = await import("./config-merger.js");

    const globalConfig: Partial<MergedConfig> = {
      mcps: {
        "global-mcp": {
          command: "npx",
          args: ["global"],
          enabled: true,
        },
      },
    };

    const machineConfig: Partial<MergedConfig> = {
      mcps: {
        "machine-mcp": {
          command: "machine",
          args: ["machine"],
          enabled: true,
        },
      },
    };

    const projectConfig: Partial<MergedConfig> = {
      mcps: {
        "project-mcp": {
          command: "project",
          args: ["project"],
          enabled: true,
        },
      },
    };

    const result = mergeConfigs(globalConfig, machineConfig, projectConfig);

    // Sources should track where each MCP came from
    expect(result.sources["global-mcp"]).toBe("global");
    expect(result.sources["machine-mcp"]).toBe("machine");
    expect(result.sources["project-mcp"]).toBe("project");
  });

  it("project overrides take precedence over machine overrides", async () => {
    const { mergeConfigs } = await import("./config-merger.js");

    const globalConfig: Partial<MergedConfig> = {
      mcps: {
        "shared-mcp": {
          command: "global-cmd",
          args: ["global"],
          enabled: true,
        },
      },
    };

    const machineConfig: Partial<MergedConfig> = {
      mcps: {
        "shared-mcp": {
          command: "machine-cmd",
          args: ["machine"],
          enabled: true,
        },
      },
    };

    const projectConfig: Partial<MergedConfig> = {
      mcps: {
        "shared-mcp": {
          command: "project-cmd",
          args: ["project"],
          enabled: true,
        },
      },
    };

    const result = mergeConfigs(globalConfig, machineConfig, projectConfig);

    // Project should win
    expect(result.mcps["shared-mcp"].command).toBe("project-cmd");
    expect(result.mcps["shared-mcp"].args).toEqual(["project"]);
    expect(result.sources["shared-mcp"]).toBe("project");
  });

  it("handles undefined configs gracefully", async () => {
    const { mergeConfigs } = await import("./config-merger.js");

    const globalConfig: Partial<MergedConfig> = {
      mcps: {
        "only-global": {
          command: "npx",
          args: ["test"],
          enabled: true,
        },
      },
    };

    const result = mergeConfigs(globalConfig, undefined, undefined);

    expect(result.mcps).toHaveProperty("only-global");
    expect(result.mcps["only-global"].command).toBe("npx");
  });
});

describe("loadGlobalConfig", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("loads from ~/.mycelium/", async () => {
    const fs = await import("node:fs/promises");
    const { loadGlobalConfig } = await import("./config-merger.js");

    const mockMcpsConfig = {
      mcps: {
        "test-mcp": {
          command: "npx",
          args: ["-y", "test-mcp"],
          enabled: true,
        },
      },
    };

    vi.mocked(fs.access).mockResolvedValue(undefined);
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockMcpsConfig));

    const result = await loadGlobalConfig();

    const home = os.homedir();
    expect(fs.readFile).toHaveBeenCalledWith(
      path.join(home, ".mycelium", "mcps.json"),
      "utf-8"
    );
    expect(result.mcps).toHaveProperty("test-mcp");
  });

  it("returns empty config if global config does not exist", async () => {
    const fs = await import("node:fs/promises");
    const { loadGlobalConfig } = await import("./config-merger.js");

    vi.mocked(fs.access).mockRejectedValue(new Error("ENOENT"));

    const result = await loadGlobalConfig();

    expect(result.mcps).toEqual({});
  });
});

describe("loadProjectConfig", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("loads from .mycelium/ in project root", async () => {
    const fs = await import("node:fs/promises");
    const { loadProjectConfig } = await import("./config-merger.js");

    const mockMcpsConfig = {
      mcps: {
        "project-mcp": {
          command: "node",
          args: ["./mcp.js"],
          enabled: true,
        },
      },
    };

    vi.mocked(fs.access).mockResolvedValue(undefined);
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockMcpsConfig));

    const result = await loadProjectConfig("/home/user/my-project");

    expect(fs.readFile).toHaveBeenCalledWith(
      "/home/user/my-project/.mycelium/mcps.json",
      "utf-8"
    );
    expect(result.mcps).toHaveProperty("project-mcp");
  });

  it("returns empty config if project config does not exist", async () => {
    const fs = await import("node:fs/promises");
    const { loadProjectConfig } = await import("./config-merger.js");

    vi.mocked(fs.access).mockRejectedValue(new Error("ENOENT"));

    const result = await loadProjectConfig("/home/user/no-config-project");

    expect(result.mcps).toEqual({});
  });
});

describe("loadMachineConfig", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("loads from ~/.mycelium/machines/{hostname}/", async () => {
    const fs = await import("node:fs/promises");
    const { loadMachineConfig } = await import("./config-merger.js");

    const mockMcpsConfig = {
      mcps: {
        "machine-mcp": {
          command: "cuda-mcp",
          args: ["--gpu"],
          enabled: true,
        },
      },
    };

    vi.mocked(fs.access).mockResolvedValue(undefined);
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockMcpsConfig));

    const result = await loadMachineConfig();

    const home = os.homedir();
    const hostname = os.hostname();
    expect(fs.readFile).toHaveBeenCalledWith(
      path.join(home, ".mycelium", "machines", hostname, "mcps.json"),
      "utf-8"
    );
    expect(result.mcps).toHaveProperty("machine-mcp");
  });

  it("returns empty config if machine config does not exist", async () => {
    const fs = await import("node:fs/promises");
    const { loadMachineConfig } = await import("./config-merger.js");

    vi.mocked(fs.access).mockRejectedValue(new Error("ENOENT"));

    const result = await loadMachineConfig();

    expect(result.mcps).toEqual({});
  });
});

describe("loadAndMergeAllConfigs", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("loads and merges all config levels", async () => {
    const fs = await import("node:fs/promises");
    const { loadAndMergeAllConfigs } = await import("./config-merger.js");

    const globalMcps = {
      mcps: {
        "global-mcp": { command: "global", args: [], enabled: true },
      },
    };
    const machineMcps = {
      mcps: {
        "machine-mcp": { command: "machine", args: [], enabled: true },
      },
    };
    const projectMcps = {
      mcps: {
        "project-mcp": { command: "project", args: [], enabled: true },
      },
    };

    const home = os.homedir();
    const hostname = os.hostname();

    vi.mocked(fs.access).mockResolvedValue(undefined);
    vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
      const pathStr = filePath.toString();
      if (pathStr.includes("machines")) {
        return JSON.stringify(machineMcps);
      } else if (pathStr.includes(".mycelium/mcps.json") && !pathStr.includes("my-project")) {
        return JSON.stringify(globalMcps);
      } else {
        return JSON.stringify(projectMcps);
      }
    });

    const result = await loadAndMergeAllConfigs("/home/user/my-project");

    expect(result.mcps).toHaveProperty("global-mcp");
    expect(result.mcps).toHaveProperty("machine-mcp");
    expect(result.mcps).toHaveProperty("project-mcp");
  });
});
