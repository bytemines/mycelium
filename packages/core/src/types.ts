/**
 * Core types for Mycelium orchestration system
 */

// ============================================================================
// Tool Types
// ============================================================================

export type ToolId =
  | "claude-code"
  | "codex"
  | "gemini-cli"
  | "opencode"
  | "openclaw"
  | "aider";

export interface ToolConfig {
  id: ToolId;
  name: string;
  skillsPath: string;
  mcpConfigPath: string;
  mcpConfigFormat: "json" | "toml" | "yaml";
  memoryPath: string;
  enabled: boolean;
}

export const SUPPORTED_TOOLS: Record<ToolId, ToolConfig> = {
  "claude-code": {
    id: "claude-code",
    name: "Claude Code",
    skillsPath: "~/.claude/skills",
    mcpConfigPath: "~/.claude/mcp.json",
    mcpConfigFormat: "json",
    memoryPath: "~/.claude/CLAUDE.md",
    enabled: true,
  },
  codex: {
    id: "codex",
    name: "Codex CLI",
    skillsPath: "~/.codex/skills",
    mcpConfigPath: "~/.codex/config.toml",
    mcpConfigFormat: "toml",
    memoryPath: "~/.codex/AGENTS.md",
    enabled: true,
  },
  "gemini-cli": {
    id: "gemini-cli",
    name: "Gemini CLI",
    skillsPath: "~/.gemini/extensions",
    mcpConfigPath: "~/.gemini/gemini-extension.json",
    mcpConfigFormat: "json",
    memoryPath: "~/.gemini/GEMINI.md",
    enabled: true,
  },
  opencode: {
    id: "opencode",
    name: "OpenCode",
    skillsPath: "~/.config/opencode/plugin",
    mcpConfigPath: "~/.config/opencode/config.yaml",
    mcpConfigFormat: "yaml",
    memoryPath: "~/.opencode/context.md",
    enabled: true,
  },
  openclaw: {
    id: "openclaw",
    name: "OpenClaw",
    skillsPath: "~/.openclaw/skills",
    mcpConfigPath: "~/.openclaw/config.yaml",
    mcpConfigFormat: "yaml",
    memoryPath: "~/.openclaw/MEMORY.md",
    enabled: true,
  },
  aider: {
    id: "aider",
    name: "Aider",
    skillsPath: "~/.aider/plugins",
    mcpConfigPath: "~/.aider/config.yaml",
    mcpConfigFormat: "yaml",
    memoryPath: "~/.aider/MEMORY.md",
    enabled: true,
  },
};

// ============================================================================
// MCP Types
// ============================================================================

export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  enabled?: boolean;
  tools?: ToolId[];
  excludeTools?: ToolId[];
}

export interface McpsConfig {
  mcps: Record<string, McpServerConfig>;
}

// ============================================================================
// Skill Types
// ============================================================================

export interface SkillManifest {
  name: string;
  description?: string;
  version?: string;
  author?: string;
  tools?: ToolId[];
  excludeTools?: ToolId[];
  enabled?: boolean;
}

export interface Skill {
  name: string;
  path: string;
  manifest: SkillManifest;
}

// ============================================================================
// Memory Types
// ============================================================================

export type MemoryScope = "shared" | "coding" | "personal";

export interface MemoryScopeConfig {
  syncTo: ToolId[];
  excludeFrom?: ToolId[];
  path: string;
  files: string[];
}

export interface MemoryConfig {
  scopes: Record<MemoryScope, MemoryScopeConfig>;
}

// ============================================================================
// Manifest Types
// ============================================================================

export interface MachineOverrides {
  hostname: string;
  mcps?: Record<string, Partial<McpServerConfig>>;
  skills?: Record<string, Partial<SkillManifest>>;
  memory?: Partial<MemoryConfig>;
}

export interface Manifest {
  version: string;
  tools: Record<ToolId, { enabled: boolean }>;
  memory: MemoryConfig;
}

// ============================================================================
// Sync Status Types
// ============================================================================

export type SyncStatus = "synced" | "pending" | "error" | "disabled";

export interface ToolSyncStatus {
  tool: ToolId;
  status: SyncStatus;
  skillsCount: number;
  mcpsCount: number;
  memoryFiles: string[];
  lastSync?: Date;
  error?: string;
}

export interface SyncResult {
  success: boolean;
  tools: ToolSyncStatus[];
  errors: string[];
  warnings: string[];
}

// ============================================================================
// Config Merge Types
// ============================================================================

export type ConfigLevel = "global" | "machine" | "project";

export interface MergedConfig {
  mcps: Record<string, McpServerConfig>;
  skills: Record<string, Skill>;
  memory: MemoryConfig;
  sources: Record<string, ConfigLevel>;
}
