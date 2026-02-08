/**
 * MCP Injector Module
 * Generates tool-specific MCP configurations and injects them into tool config files
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
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

// ============================================================================
// Create Default Config
// ============================================================================

/** @deprecated Adapters handle file creation internally */
export async function createDefaultConfig(
  toolId: ToolId,
  configPath: string
): Promise<void> {
  // Check if file already exists
  try {
    await fs.access(configPath);
    // File exists, don't overwrite
    return;
  } catch {
    // File doesn't exist, create it
  }

  // Ensure parent directory exists
  const parentDir = path.dirname(configPath);
  await fs.mkdir(parentDir, { recursive: true });

  let content: string;

  switch (toolId) {
    case "claude-code":
    case "gemini-cli":
      content = JSON.stringify({ mcpServers: {} }, null, 2);
      break;

    case "codex":
      content = `[mcp]\n\n[mcp.servers]\n`;
      break;

    case "opencode":
    case "openclaw":
    case "aider":
      content = YAML.stringify({ mcp: { servers: {} } }, { indent: 2 });
      break;

    default:
      content = JSON.stringify({ mcpServers: {} }, null, 2);
  }

  await fs.writeFile(configPath, content, "utf-8");
}

// ============================================================================
// Inject MCPs to Tool
// ============================================================================

/** @deprecated Use getAdapter(toolId).syncAll(mcps) instead */
export async function injectMcpsToTool(
  toolId: ToolId,
  mcps: Record<string, McpServerConfig>,
  configPath: string
): Promise<void> {
  // Ensure config file exists
  await createDefaultConfig(toolId, configPath);

  // Read existing config
  const content = await fs.readFile(configPath, "utf-8");

  let newContent: string;

  switch (toolId) {
    case "claude-code":
    case "gemini-cli":
      newContent = injectMcpsToJson(content, mcps);
      break;

    case "codex":
      newContent = injectMcpsToToml(content, mcps);
      break;

    case "opencode":
    case "openclaw":
    case "aider":
      newContent = injectMcpsToYaml(content, mcps);
      break;

    default:
      newContent = injectMcpsToJson(content, mcps);
  }

  await fs.writeFile(configPath, newContent, "utf-8");
}

// ============================================================================
// Format-Specific Injection Helpers
// ============================================================================

function injectMcpsToJson(
  content: string,
  mcps: Record<string, McpServerConfig>
): string {
  let config: Record<string, unknown>;

  try {
    config = JSON.parse(content);
  } catch {
    config = {};
  }

  // Preserve existing config, update mcpServers
  const existingMcpServers = (config.mcpServers as Record<string, unknown>) || {};
  const newMcpServers: Record<string, unknown> = { ...existingMcpServers };

  for (const [name, mcpConfig] of Object.entries(mcps)) {
    if (mcpConfig.enabled === false) {
      continue;
    }
    newMcpServers[name] = cleanMcpConfig(mcpConfig);
  }

  config.mcpServers = newMcpServers;

  return JSON.stringify(config, null, 2);
}

function injectMcpsToToml(
  content: string,
  mcps: Record<string, McpServerConfig>
): string {
  // Parse existing TOML to preserve non-MCP settings
  // For simplicity, we'll preserve lines that don't start with [mcp.servers
  const lines = content.split("\n");
  const preservedLines: string[] = [];
  let inMcpServersSection = false;

  for (const line of lines) {
    if (line.startsWith("[mcp.servers.")) {
      inMcpServersSection = true;
      continue;
    }

    if (line.startsWith("[") && inMcpServersSection) {
      // New section that's not mcp.servers
      if (!line.startsWith("[mcp.servers")) {
        inMcpServersSection = false;
        preservedLines.push(line);
      }
      continue;
    }

    if (!inMcpServersSection) {
      preservedLines.push(line);
    }
  }

  // Generate new MCP servers section
  const mcpServersToml = generateCodexConfig(mcps);

  // Combine preserved content with new MCP servers
  const result = preservedLines.join("\n").trim();

  if (result.length > 0) {
    return result + "\n\n" + mcpServersToml;
  }

  return mcpServersToml;
}

function injectMcpsToYaml(
  content: string,
  mcps: Record<string, McpServerConfig>
): string {
  let config: Record<string, unknown>;

  try {
    config = YAML.parse(content) || {};
  } catch {
    config = {};
  }

  // Preserve existing config
  const existingMcp = (config.mcp as Record<string, unknown>) || {};
  const existingServers = (existingMcp.servers as Record<string, unknown>) || {};
  const newServers: Record<string, unknown> = { ...existingServers };

  for (const [name, mcpConfig] of Object.entries(mcps)) {
    if (mcpConfig.enabled === false) {
      continue;
    }

    const serverConfig: Record<string, unknown> = {
      command: mcpConfig.command,
    };

    if (mcpConfig.args && mcpConfig.args.length > 0) {
      serverConfig.args = mcpConfig.args;
    }

    if (mcpConfig.env && Object.keys(mcpConfig.env).length > 0) {
      serverConfig.env = mcpConfig.env;
    }

    newServers[name] = serverConfig;
  }

  config.mcp = {
    ...existingMcp,
    servers: newServers,
  };

  return YAML.stringify(config, { indent: 2 });
}
