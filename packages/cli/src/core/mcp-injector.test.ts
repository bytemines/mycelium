/**
 * Tests for MCP Injector module
 * Tests written FIRST following TDD
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type { ToolId, McpServerConfig } from "@mycelium/core";

// Import the module under test (doesn't exist yet - tests will fail)
import {
  generateClaudeConfig,
  generateCodexConfig,
  generateGeminiConfig,
  generateOpenCodeConfig,
  generateOpenClawConfig,
  injectMcpsToTool,
  filterMcpsForTool,
  resolveEnvVarsInMcps,
  createDefaultConfig,
} from "./mcp-injector.js";

describe("MCP Injector", () => {
  // Sample MCP configs for testing
  const sampleMcps: Record<string, McpServerConfig> = {
    "whark-trading": {
      command: "uvx",
      args: ["whark-mcp"],
      env: {
        WHARK_API_KEY: "${WHARK_API_KEY}",
      },
      enabled: true,
    },
    playwright: {
      command: "npx",
      args: ["@anthropic/mcp-playwright"],
      enabled: true,
    },
    "claude-only-mcp": {
      command: "node",
      args: ["claude-mcp.js"],
      tools: ["claude-code"],
      enabled: true,
    },
    "exclude-codex-mcp": {
      command: "python",
      args: ["-m", "some_mcp"],
      excludeTools: ["codex"],
      enabled: true,
    },
    "disabled-mcp": {
      command: "node",
      args: ["disabled.js"],
      enabled: false,
    },
  };

  describe("generateClaudeConfig", () => {
    it("generates mcp.json format for Claude Code", () => {
      const mcps: Record<string, McpServerConfig> = {
        "whark-trading": {
          command: "uvx",
          args: ["whark-mcp"],
          env: { API_KEY: "secret" },
          enabled: true,
        },
      };

      const result = generateClaudeConfig(mcps);

      expect(result).toEqual({
        mcpServers: {
          "whark-trading": {
            command: "uvx",
            args: ["whark-mcp"],
            env: { API_KEY: "secret" },
          },
        },
      });
    });

    it("excludes disabled MCPs", () => {
      const mcps: Record<string, McpServerConfig> = {
        enabled: { command: "node", args: ["a.js"], enabled: true },
        disabled: { command: "node", args: ["b.js"], enabled: false },
      };

      const result = generateClaudeConfig(mcps);

      expect(result.mcpServers).toHaveProperty("enabled");
      expect(result.mcpServers).not.toHaveProperty("disabled");
    });

    it("handles MCPs without optional fields", () => {
      const mcps: Record<string, McpServerConfig> = {
        minimal: { command: "node" },
      };

      const result = generateClaudeConfig(mcps);

      expect(result).toEqual({
        mcpServers: {
          minimal: {
            command: "node",
          },
        },
      });
    });
  });

  describe("generateCodexConfig", () => {
    it("generates TOML format for Codex CLI", () => {
      const mcps: Record<string, McpServerConfig> = {
        "whark-trading": {
          command: "uvx",
          args: ["whark-mcp"],
          env: { API_KEY: "secret" },
          enabled: true,
        },
      };

      const result = generateCodexConfig(mcps);

      // Codex uses TOML format with [mcp.servers.name] sections
      expect(result).toContain('[mcp.servers."whark-trading"]');
      expect(result).toContain('command = "uvx"');
      expect(result).toContain('args = ["whark-mcp"]');
      expect(result).toContain('[mcp.servers."whark-trading".env]');
      expect(result).toContain('API_KEY = "secret"');
    });

    it("excludes disabled MCPs", () => {
      const mcps: Record<string, McpServerConfig> = {
        enabled: { command: "node", args: ["a.js"], enabled: true },
        disabled: { command: "node", args: ["b.js"], enabled: false },
      };

      const result = generateCodexConfig(mcps);

      expect(result).toContain("enabled");
      expect(result).not.toContain("disabled");
    });

    it("handles MCPs without env", () => {
      const mcps: Record<string, McpServerConfig> = {
        simple: { command: "npx", args: ["mcp-server"], enabled: true },
      };

      const result = generateCodexConfig(mcps);

      expect(result).toContain('[mcp.servers."simple"]');
      expect(result).toContain('command = "npx"');
      expect(result).not.toContain('[mcp.servers."simple".env]');
    });
  });

  describe("generateGeminiConfig", () => {
    it("generates JSON format for Gemini CLI", () => {
      const mcps: Record<string, McpServerConfig> = {
        playwright: {
          command: "npx",
          args: ["@anthropic/mcp-playwright"],
          enabled: true,
        },
      };

      const result = generateGeminiConfig(mcps);

      // Gemini uses mcpServers format similar to Claude
      expect(result).toEqual({
        mcpServers: {
          playwright: {
            command: "npx",
            args: ["@anthropic/mcp-playwright"],
          },
        },
      });
    });
  });

  describe("generateOpenCodeConfig", () => {
    it("generates YAML format for OpenCode", () => {
      const mcps: Record<string, McpServerConfig> = {
        "whark-trading": {
          command: "uvx",
          args: ["whark-mcp"],
          env: { API_KEY: "secret" },
          enabled: true,
        },
      };

      const result = generateOpenCodeConfig(mcps);

      // OpenCode uses YAML with mcp.servers structure
      expect(result).toContain("mcp:");
      expect(result).toContain("  servers:");
      expect(result).toContain("    whark-trading:");
      expect(result).toContain("      command: uvx");
      expect(result).toContain("        - whark-mcp");
      expect(result).toContain("      env:");
      expect(result).toContain("        API_KEY: secret");
    });
  });

  describe("generateOpenClawConfig", () => {
    it("generates YAML format for OpenClaw", () => {
      const mcps: Record<string, McpServerConfig> = {
        "whark-trading": {
          command: "uvx",
          args: ["whark-mcp"],
          enabled: true,
        },
      };

      const result = generateOpenClawConfig(mcps);

      // OpenClaw uses similar YAML structure
      expect(result).toContain("mcp:");
      expect(result).toContain("  servers:");
      expect(result).toContain("    whark-trading:");
      expect(result).toContain("      command: uvx");
    });
  });

  describe("filterMcpsForTool", () => {
    it("includes MCPs with no tool restrictions", () => {
      const mcps: Record<string, McpServerConfig> = {
        universal: { command: "node", args: ["universal.js"], enabled: true },
      };

      const result = filterMcpsForTool(mcps, "claude-code");

      expect(result).toHaveProperty("universal");
    });

    it("includes MCPs when tool is in tools array", () => {
      const mcps: Record<string, McpServerConfig> = {
        "claude-only": {
          command: "node",
          args: ["claude.js"],
          tools: ["claude-code"],
          enabled: true,
        },
      };

      const result = filterMcpsForTool(mcps, "claude-code");

      expect(result).toHaveProperty("claude-only");
    });

    it("excludes MCPs when tool is not in tools array", () => {
      const mcps: Record<string, McpServerConfig> = {
        "claude-only": {
          command: "node",
          args: ["claude.js"],
          tools: ["claude-code"],
          enabled: true,
        },
      };

      const result = filterMcpsForTool(mcps, "codex");

      expect(result).not.toHaveProperty("claude-only");
    });

    it("excludes MCPs when tool is in excludeTools array", () => {
      const mcps: Record<string, McpServerConfig> = {
        "no-codex": {
          command: "node",
          args: ["no-codex.js"],
          excludeTools: ["codex"],
          enabled: true,
        },
      };

      const result = filterMcpsForTool(mcps, "codex");

      expect(result).not.toHaveProperty("no-codex");
    });

    it("includes MCPs when tool is not in excludeTools array", () => {
      const mcps: Record<string, McpServerConfig> = {
        "no-codex": {
          command: "node",
          args: ["no-codex.js"],
          excludeTools: ["codex"],
          enabled: true,
        },
      };

      const result = filterMcpsForTool(mcps, "claude-code");

      expect(result).toHaveProperty("no-codex");
    });

    it("excludes disabled MCPs", () => {
      const mcps: Record<string, McpServerConfig> = {
        disabled: { command: "node", args: ["disabled.js"], enabled: false },
      };

      const result = filterMcpsForTool(mcps, "claude-code");

      expect(result).not.toHaveProperty("disabled");
    });
  });

  describe("resolveEnvVarsInMcps", () => {
    it("resolves ${VAR} in MCP env settings", () => {
      const mcps: Record<string, McpServerConfig> = {
        test: {
          command: "node",
          env: {
            API_KEY: "${MY_API_KEY}",
            OTHER: "static",
          },
          enabled: true,
        },
      };
      const envVars = { MY_API_KEY: "secret123" };

      const result = resolveEnvVarsInMcps(mcps, envVars);

      expect(result.test.env?.API_KEY).toBe("secret123");
      expect(result.test.env?.OTHER).toBe("static");
    });

    it("resolves multiple variables in same value", () => {
      const mcps: Record<string, McpServerConfig> = {
        test: {
          command: "node",
          env: {
            URL: "${PROTOCOL}://${HOST}",
          },
          enabled: true,
        },
      };
      const envVars = { PROTOCOL: "https", HOST: "example.com" };

      const result = resolveEnvVarsInMcps(mcps, envVars);

      expect(result.test.env?.URL).toBe("https://example.com");
    });

    it("leaves unresolved variables as empty string", () => {
      const mcps: Record<string, McpServerConfig> = {
        test: {
          command: "node",
          env: { MISSING: "${NONEXISTENT}" },
          enabled: true,
        },
      };
      const envVars = {};

      const result = resolveEnvVarsInMcps(mcps, envVars);

      expect(result.test.env?.MISSING).toBe("");
    });

    it("does not mutate original MCPs", () => {
      const mcps: Record<string, McpServerConfig> = {
        test: {
          command: "node",
          env: { API_KEY: "${KEY}" },
          enabled: true,
        },
      };
      const envVars = { KEY: "resolved" };

      resolveEnvVarsInMcps(mcps, envVars);

      expect(mcps.test.env?.API_KEY).toBe("${KEY}");
    });

    it("resolves variables in args", () => {
      const mcps: Record<string, McpServerConfig> = {
        test: {
          command: "node",
          args: ["--config", "${CONFIG_PATH}"],
          enabled: true,
        },
      };
      const envVars = { CONFIG_PATH: "/home/user/config.json" };

      const result = resolveEnvVarsInMcps(mcps, envVars);

      expect(result.test.args?.[1]).toBe("/home/user/config.json");
    });
  });

  describe("injectMcpsToTool", () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-injector-test-"));
    });

    afterEach(async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
    });

    it("injects MCPs into existing Claude config", async () => {
      const configPath = path.join(tempDir, "mcp.json");
      const existingConfig = {
        mcpServers: {
          existing: { command: "existing" },
        },
        otherSetting: "preserved",
      };
      await fs.writeFile(configPath, JSON.stringify(existingConfig, null, 2));

      const mcps: Record<string, McpServerConfig> = {
        new: { command: "new", enabled: true },
      };

      await injectMcpsToTool("claude-code", mcps, configPath);

      const content = await fs.readFile(configPath, "utf-8");
      const config = JSON.parse(content);

      expect(config.mcpServers.new).toBeDefined();
      expect(config.otherSetting).toBe("preserved");
    });

    it("preserves other settings in config file", async () => {
      const configPath = path.join(tempDir, "mcp.json");
      const existingConfig = {
        mcpServers: {},
        theme: "dark",
        editor: { tabSize: 2 },
      };
      await fs.writeFile(configPath, JSON.stringify(existingConfig, null, 2));

      const mcps: Record<string, McpServerConfig> = {
        test: { command: "test", enabled: true },
      };

      await injectMcpsToTool("claude-code", mcps, configPath);

      const content = await fs.readFile(configPath, "utf-8");
      const config = JSON.parse(content);

      expect(config.theme).toBe("dark");
      expect(config.editor.tabSize).toBe(2);
    });

    it("injects MCPs into existing Codex TOML config", async () => {
      const configPath = path.join(tempDir, "config.toml");
      const existingConfig = `
model = "gpt-4"

[mcp]
enabled = true

[mcp.servers.existing]
command = "existing"
`;
      await fs.writeFile(configPath, existingConfig);

      const mcps: Record<string, McpServerConfig> = {
        new: { command: "new", args: ["arg1"], enabled: true },
      };

      await injectMcpsToTool("codex", mcps, configPath);

      const content = await fs.readFile(configPath, "utf-8");

      expect(content).toContain('model = "gpt-4"');
      expect(content).toContain('[mcp.servers."new"]');
      expect(content).toContain('command = "new"');
    });

    it("injects MCPs into existing OpenCode YAML config", async () => {
      const configPath = path.join(tempDir, "config.yaml");
      const existingConfig = `
model: gpt-4
mcp:
  enabled: true
  servers:
    existing:
      command: existing
`;
      await fs.writeFile(configPath, existingConfig);

      const mcps: Record<string, McpServerConfig> = {
        new: { command: "new", enabled: true },
      };

      await injectMcpsToTool("opencode", mcps, configPath);

      const content = await fs.readFile(configPath, "utf-8");

      expect(content).toContain("model: gpt-4");
      expect(content).toContain("new:");
      expect(content).toContain("command: new");
    });
  });

  describe("createDefaultConfig", () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-injector-test-"));
    });

    afterEach(async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
    });

    it("creates config file if missing for Claude", async () => {
      const configPath = path.join(tempDir, "mcp.json");

      await createDefaultConfig("claude-code", configPath);

      const content = await fs.readFile(configPath, "utf-8");
      const config = JSON.parse(content);

      expect(config).toHaveProperty("mcpServers");
      expect(config.mcpServers).toEqual({});
    });

    it("creates config file if missing for Codex", async () => {
      const configPath = path.join(tempDir, "config.toml");

      await createDefaultConfig("codex", configPath);

      const content = await fs.readFile(configPath, "utf-8");

      expect(content).toContain("[mcp]");
      expect(content).toContain("[mcp.servers]");
    });

    it("creates config file if missing for OpenCode", async () => {
      const configPath = path.join(tempDir, "config.yaml");

      await createDefaultConfig("opencode", configPath);

      const content = await fs.readFile(configPath, "utf-8");

      expect(content).toContain("mcp:");
      expect(content).toContain("servers:");
    });

    it("creates parent directories if needed", async () => {
      const configPath = path.join(tempDir, "nested", "deep", "mcp.json");

      await createDefaultConfig("claude-code", configPath);

      const exists = await fs
        .access(configPath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);
    });

    it("does not overwrite existing config", async () => {
      const configPath = path.join(tempDir, "mcp.json");
      const existingContent = '{"existing": true}';
      await fs.writeFile(configPath, existingContent);

      await createDefaultConfig("claude-code", configPath);

      const content = await fs.readFile(configPath, "utf-8");
      expect(content).toBe(existingContent);
    });
  });
});
