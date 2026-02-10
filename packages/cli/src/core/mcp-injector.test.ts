/**
 * Tests for MCP Injector module
 * Tests written FIRST following TDD
 */

import { describe, it, expect } from "vitest";
import type { McpServerConfig } from "@mycelish/core";

// Import the module under test (doesn't exist yet - tests will fail)
import {
  generateClaudeConfig,
  generateCodexConfig,
  generateGeminiConfig,
  generateOpenCodeConfig,
  generateOpenClawConfig,
  filterMcpsForTool,
  resolveEnvVarsInMcps,
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
      state: "enabled",
    },
    playwright: {
      command: "npx",
      args: ["@anthropic/mcp-playwright"],
      state: "enabled",
    },
    "claude-only-mcp": {
      command: "node",
      args: ["claude-mcp.js"],
      tools: ["claude-code"],
      state: "enabled",
    },
    "exclude-codex-mcp": {
      command: "python",
      args: ["-m", "some_mcp"],
      excludeTools: ["codex"],
      state: "enabled",
    },
    "disabled-mcp": {
      command: "node",
      args: ["disabled.js"],
      state: "disabled",
    },
  };

  describe("generateClaudeConfig", () => {
    it("generates mcp.json format for Claude Code", () => {
      const mcps: Record<string, McpServerConfig> = {
        "whark-trading": {
          command: "uvx",
          args: ["whark-mcp"],
          env: { API_KEY: "secret" },
          state: "enabled",
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
        enabled: { command: "node", args: ["a.js"], state: "enabled" },
        disabled: { command: "node", args: ["b.js"], state: "disabled" },
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
          state: "enabled",
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
        enabled: { command: "node", args: ["a.js"], state: "enabled" },
        disabled: { command: "node", args: ["b.js"], state: "disabled" },
      };

      const result = generateCodexConfig(mcps);

      expect(result).toContain("enabled");
      expect(result).not.toContain("disabled");
    });

    it("handles MCPs without env", () => {
      const mcps: Record<string, McpServerConfig> = {
        simple: { command: "npx", args: ["mcp-server"], state: "enabled" },
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
          state: "enabled",
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
          state: "enabled",
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
          state: "enabled",
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
        universal: { command: "node", args: ["universal.js"], state: "enabled" },
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
          state: "enabled",
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
          state: "enabled",
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
          state: "enabled",
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
          state: "enabled",
        },
      };

      const result = filterMcpsForTool(mcps, "claude-code");

      expect(result).toHaveProperty("no-codex");
    });

    it("excludes disabled MCPs", () => {
      const mcps: Record<string, McpServerConfig> = {
        disabled: { command: "node", args: ["disabled.js"], state: "disabled" },
      };

      const result = filterMcpsForTool(mcps, "claude-code");

      expect(result).not.toHaveProperty("disabled");
    });

    it("excludes deleted MCPs", () => {
      const mcps: Record<string, McpServerConfig> = {
        deleted: { command: "node", args: ["deleted.js"], state: "deleted" },
      };

      const result = filterMcpsForTool(mcps, "claude-code");

      expect(result).not.toHaveProperty("deleted");
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
          state: "enabled",
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
          state: "enabled",
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
          state: "enabled",
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
          state: "enabled",
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
          state: "enabled",
        },
      };
      const envVars = { CONFIG_PATH: "/home/user/config.json" };

      const result = resolveEnvVarsInMcps(mcps, envVars);

      expect(result.test.args?.[1]).toBe("/home/user/config.json");
    });
  });

});
