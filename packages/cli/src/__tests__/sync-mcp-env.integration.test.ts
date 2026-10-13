import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { TOOL_REGISTRY, type MergedConfig } from "@mycelish/core";
import { GenericAdapter } from "../core/auto-adapter.js";

vi.mock("../core/symlink-manager.js", () => ({
  syncSkillsToTool: vi.fn().mockResolvedValue({ created: [], updated: [], unchanged: [] }),
}));
vi.mock("../core/file-syncer.js", () => ({
  syncFilesToDir: vi.fn().mockResolvedValue({ created: [], updated: [], unchanged: [] }),
}));
vi.mock("../core/tool-adapter.js", () => ({ getAdapter: vi.fn() }));

import { getAdapter } from "../core/tool-adapter.js";
import { syncTool } from "../commands/sync.js";

describe("syncTool MCP environment resolution → adapter export", () => {
  let tempDir: string;
  let config: MergedConfig;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mycelium-sync-env-"));
    config = {
      mcps: {
        massive: {
          command: "${SERVER_COMMAND}",
          args: ["--with", "mcp<2", "mcp_massive", "${MISSING_ARG}"],
          env: {
            MASSIVE_API_KEY: "${MASSIVE_API_KEY}",
            COMBINED: "Bearer ${MASSIVE_API_KEY}/${ACCOUNT_2}/${MASSIVE_API_KEY}",
            RESOLVED: "${LOCAL_VALUE}",
            MIXED: "${LOCAL_VALUE}:${MASSIVE_API_KEY}",
            EMPTY_VAR: "${EMPTY_VALUE}",
            DEFAULT: "${MASSIVE_API_KEY:-fallback}",
            LITERAL: "info",
            EMPTY: "",
            NATIVE: "{env:MASSIVE_API_KEY}",
          },
          state: "enabled",
        },
        excluded: { command: "server", tools: ["vscode"] },
      },
      skills: {}, agents: {}, rules: {}, commands: {}, sources: {},
    };
    vi.mocked(getAdapter).mockImplementation((toolId) => {
      const desc = TOOL_REGISTRY[toolId];
      return new GenericAdapter({
        ...desc,
        cli: null,
        paths: { ...desc.paths, mcp: path.join(tempDir, `${toolId}.json`) },
      });
    });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it("keeps missing OpenCode environment references through the real resolver and file exporter", async () => {
    const original = structuredClone(config);
    const vars = { SERVER_COMMAND: "uvx", LOCAL_VALUE: "local", EMPTY_VALUE: "" };

    expect((await syncTool("opencode", config, vars)).status).toBe("synced");
    const written = JSON.parse(await fs.readFile(path.join(tempDir, "opencode.json"), "utf-8"));
    expect(written.mcp.massive.environment).toEqual({
      MASSIVE_API_KEY: "{env:MASSIVE_API_KEY}",
      COMBINED: "Bearer {env:MASSIVE_API_KEY}/{env:ACCOUNT_2}/{env:MASSIVE_API_KEY}",
      RESOLVED: "local",
      MIXED: "local:{env:MASSIVE_API_KEY}",
      EMPTY_VAR: "",
      DEFAULT: "fallback",
      LITERAL: "info",
      EMPTY: "",
      NATIVE: "{env:MASSIVE_API_KEY}",
    });
    expect(written.mcp.massive.command).toEqual(["uvx", "--with", "mcp<2", "mcp_massive", ""]);
    expect(written.mcp.excluded).toBeUndefined();
    expect(config).toEqual(original);
    expect(vars).toEqual({ SERVER_COMMAND: "uvx", LOCAL_VALUE: "local", EMPTY_VALUE: "" });

    expect((await syncTool("claude-code", config, vars)).status).toBe("synced");
    const other = JSON.parse(await fs.readFile(path.join(tempDir, "claude-code.json"), "utf-8"));
    expect(other.mcpServers.massive.env.MASSIVE_API_KEY).toBe("");
    expect(other.mcpServers.massive.env.COMBINED).toBe("Bearer //");
    expect(other.mcpServers.massive.env.MIXED).toBe("local:");
    expect(other.mcpServers.massive.env.DEFAULT).toBe("fallback");
    expect(config).toEqual(original);
  });

  it("uses OpenCode runtime references with no sync-time environment values", async () => {
    config.mcps.massive.command = "uvx";
    expect((await syncTool("opencode", config)).status).toBe("synced");
    const written = JSON.parse(await fs.readFile(path.join(tempDir, "opencode.json"), "utf-8"));
    expect(written.mcp.massive.environment.MASSIVE_API_KEY).toBe("{env:MASSIVE_API_KEY}");
    expect(written.mcp.massive.environment.RESOLVED).toBe("{env:LOCAL_VALUE}");
    expect(written.mcp.massive.environment.DEFAULT).toBe("fallback");
  });
});
