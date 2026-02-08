/**
 * MCP Injector Module
 * Generates tool-specific MCP configurations and injects them into tool config files
 */

import YAML from "yaml";
import type { ToolId, McpServerConfig } from "@mycelium/core";
import { resolveEnvVarsInObject } from "@mycelium/core";

// ============================================================================
// Types
// ============================================================================

interface ClaudeConfig {
  mcpServers: Record<string, Omit<McpServerConfig, "enabled" | "tools" | "excludeTools">>;
  [key: string]: unknown;
}

interface GeminiConfig {
  mcpServers: Record<string, Omit<McpServerConfig, "enabled" | "tools" | "excludeTools">>;
  [key: string]: unknown;
}

// ============================================================================
// Filter MCPs for Tool
// ============================================================================

/**
 * Filter MCPs based on tool-specific restrictions
 */
export function filterMcpsForTool(
  mcps: Record<string, McpServerConfig>,
  toolId: ToolId
): Record<string, McpServerConfig> {
  const result: Record<string, McpServerConfig> = {};

  for (const [name, config] of Object.entries(mcps)) {
    // Skip disabled MCPs
    if (config.enabled === false) {
      continue;
    }

    // If tools is specified, only include if tool is in the list
    if (config.tools && config.tools.length > 0) {
      if (!config.tools.includes(toolId)) {
        continue;
      }
    }

    // If excludeTools is specified, exclude if tool is in the list
    if (config.excludeTools && config.excludeTools.length > 0) {
      if (config.excludeTools.includes(toolId)) {
        continue;
      }
    }

    result[name] = config;
  }

  return result;
}

// ============================================================================
// Resolve Environment Variables
// ============================================================================

/**
 * Resolve ${VAR} environment variables in MCP configs
 */
export function resolveEnvVarsInMcps(
  mcps: Record<string, McpServerConfig>,
  envVars: Record<string, string>
): Record<string, McpServerConfig> {
  return resolveEnvVarsInObject(mcps, envVars);
}

// ============================================================================
// Clean MCP Config (remove internal fields)
// ============================================================================

function cleanMcpConfig(
  config: McpServerConfig
): Omit<McpServerConfig, "enabled" | "tools" | "excludeTools"> {
  const { enabled, tools, excludeTools, ...clean } = config;

  // Remove undefined/empty fields
  const result: Record<string, unknown> = { command: clean.command };

  if (clean.args && clean.args.length > 0) {
    result.args = clean.args;
  }

  if (clean.env && Object.keys(clean.env).length > 0) {
    result.env = clean.env;
  }

  return result as Omit<McpServerConfig, "enabled" | "tools" | "excludeTools">;
}

// ============================================================================
// Generate Claude Config (JSON)
// ============================================================================

/**
 * Generate mcp.json format for Claude Code
 */
export function generateClaudeConfig(
  mcps: Record<string, McpServerConfig>
): ClaudeConfig {
  const mcpServers: ClaudeConfig["mcpServers"] = {};

  for (const [name, config] of Object.entries(mcps)) {
    // Skip disabled MCPs
    if (config.enabled === false) {
      continue;
    }

    mcpServers[name] = cleanMcpConfig(config);
  }

  return { mcpServers };
}

// ============================================================================
// Generate Gemini Config (JSON)
// ============================================================================

/**
 * Generate gemini-extension.json format for Gemini CLI
 */
export function generateGeminiConfig(
  mcps: Record<string, McpServerConfig>
): GeminiConfig {
  const mcpServers: GeminiConfig["mcpServers"] = {};

  for (const [name, config] of Object.entries(mcps)) {
    // Skip disabled MCPs
    if (config.enabled === false) {
      continue;
    }

    mcpServers[name] = cleanMcpConfig(config);
  }

  return { mcpServers };
}

// ============================================================================
// Generate Codex Config (TOML)
// ============================================================================

/**
 * Generate TOML format for Codex CLI
 */
export function generateCodexConfig(
  mcps: Record<string, McpServerConfig>
): string {
  const lines: string[] = [];

  for (const [name, config] of Object.entries(mcps)) {
    // Skip disabled MCPs
    if (config.enabled === false) {
      continue;
    }

    lines.push(`[mcp.servers."${name}"]`);
    lines.push(`command = "${config.command}"`);

    if (config.args && config.args.length > 0) {
      const argsStr = config.args.map((a) => `"${a}"`).join(", ");
      lines.push(`args = [${argsStr}]`);
    }

    if (config.env && Object.keys(config.env).length > 0) {
      lines.push(`[mcp.servers."${name}".env]`);
      for (const [key, value] of Object.entries(config.env)) {
        lines.push(`${key} = "${value}"`);
      }
    }

    lines.push("");
  }

  return lines.join("\n");
}

// ============================================================================
// Generate OpenCode Config (YAML)
// ============================================================================

/**
 * Generate YAML format for OpenCode
 */
export function generateOpenCodeConfig(
  mcps: Record<string, McpServerConfig>
): string {
  const servers: Record<string, unknown> = {};

  for (const [name, config] of Object.entries(mcps)) {
    // Skip disabled MCPs
    if (config.enabled === false) {
      continue;
    }

    const serverConfig: Record<string, unknown> = {
      command: config.command,
    };

    if (config.args && config.args.length > 0) {
      serverConfig.args = config.args;
    }

    if (config.env && Object.keys(config.env).length > 0) {
      serverConfig.env = config.env;
    }

    servers[name] = serverConfig;
  }

  const yamlConfig = {
    mcp: {
      servers,
    },
  };

  return YAML.stringify(yamlConfig, { indent: 2 });
}

// ============================================================================
// Generate OpenClaw Config (YAML)
// ============================================================================

/**
 * Generate YAML format for OpenClaw
 */
export function generateOpenClawConfig(
  mcps: Record<string, McpServerConfig>
): string {
  // OpenClaw uses same format as OpenCode
  return generateOpenCodeConfig(mcps);
}

