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
// Memory Compression Types
// ============================================================================

export interface CompressOptions {
  maxLines: number;
  preserveHeaders?: boolean;
}

// ============================================================================
// Agent Team Types
// ============================================================================

export interface AgentConfig {
  name: string;
  role: string;
  model?: string;
}

export interface TeamConfig {
  name: string;
  agents: AgentConfig[];
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

// ============================================================================
// Dashboard Types
// ============================================================================

export interface ToggleAction {
  type: "skill" | "mcp" | "memory";
  name: string;
  toolId: ToolId;
  enabled: boolean;
}

// ============================================================================
// Migration Types
// ============================================================================

export interface ToolScanResult {
  toolId: ToolId;
  toolName: string;
  installed: boolean;
  skills: ScannedSkill[];
  mcps: ScannedMcp[];
  memory: ScannedMemory[];
  hooks: ScannedHook[];
}

export interface ScannedSkill {
  name: string;
  path: string;
  source: ToolId;
  version?: string;
  lastUpdated?: Date;
  metadata?: Record<string, string>;
  marketplace?: string;
  pluginName?: string;
}

export interface ScannedMcp {
  name: string;
  config: McpServerConfig;
  source: ToolId;
  projectPath?: string;
}

export interface ScannedMemory {
  name: string;
  path: string;
  source: ToolId;
  scope: MemoryScope;
  content?: string;
}

export interface ScannedHook {
  name: string;
  path: string;
  source: ToolId;
}

export type ConflictStrategy = "latest" | "interactive" | "all";

export interface MigrationConflict {
  name: string;
  type: "skill" | "mcp";
  entries: Array<{
    source: ToolId;
    version?: string;
    lastUpdated?: Date;
    config?: McpServerConfig;
  }>;
  resolved?: { source: ToolId };
}

export interface MigrationPlan {
  skills: ScannedSkill[];
  mcps: ScannedMcp[];
  memory: ScannedMemory[];
  conflicts: MigrationConflict[];
  strategy: ConflictStrategy;
}

export interface MigrationResult {
  success: boolean;
  skillsImported: number;
  mcpsImported: number;
  memoryImported: number;
  conflicts: MigrationConflict[];
  errors: string[];
  manifest: MigrationManifest;
}

export interface MigrationManifestEntry {
  name: string;
  type: "skill" | "mcp" | "memory";
  source: ToolId;
  originalPath: string;
  importedPath: string;
  importedAt: string;
  version?: string;
  strategy?: ConflictStrategy;
  marketplace?: string;
  pluginName?: string;
}

export interface MigrationManifest {
  version: string;
  lastMigration: string;
  entries: MigrationManifestEntry[];
}

// ============================================================================
// Marketplace Types
// ============================================================================

export type MarketplaceSource = string;

/** Well-known marketplace source identifiers */
export const MARKETPLACE_SOURCES = {
  SKILLSMP: "skillsmp" as const,
  OPENSKILLS: "openskills" as const,
  CLAUDE_PLUGINS: "claude-plugins" as const,
  MCP_REGISTRY: "mcp-registry" as const,
  ANTHROPIC_SKILLS: "anthropic-skills" as const,
  CLAWHUB: "clawhub" as const,
};

/** Well-known entry types with display metadata */
export type MarketplaceEntryType = "skill" | "mcp" | "plugin" | "agent" | "template" | string;

export const ENTRY_TYPE_META: Record<string, { label: string; color: string; bgColor: string; borderColor: string; fileExt: string }> = {
  skill:    { label: "Skill",    color: "text-purple-400", bgColor: "bg-purple-500/10", borderColor: "border-purple-500/30", fileExt: ".md" },
  mcp:      { label: "MCP",      color: "text-blue-400",   bgColor: "bg-blue-500/10",   borderColor: "border-blue-500/30",   fileExt: ".yaml" },
  plugin:   { label: "Plugin",   color: "text-amber-400",  bgColor: "bg-amber-500/10",  borderColor: "border-amber-500/30",  fileExt: ".json" },
  agent:    { label: "Agent",    color: "text-emerald-400",bgColor: "bg-emerald-500/10",borderColor: "border-emerald-500/30",fileExt: ".md" },
  template: { label: "Template", color: "text-pink-400",   bgColor: "bg-pink-500/10",   borderColor: "border-pink-500/30",   fileExt: ".yaml" },
};

export interface MarketplaceConfig {
  type: "local" | "claude-marketplace" | "remote";
  enabled: boolean;
  default?: boolean;
  url?: string;
  description?: string;
  discovered?: boolean;
}

export interface PluginInfo {
  name: string;
  marketplace: string;
  version: string;
  description: string;
  author?: string;
  enabled: boolean;
  skills: string[];
  agents: string[];
  commands: string[];
  installPath: string;
  installedAt?: string;
  lastUpdated?: string;
}

export interface MarketplaceEntry {
  name: string;
  description: string;
  source: MarketplaceSource;
  author?: string;
  version?: string;
  downloads?: number;
  stars?: number;
  category?: string;
  updatedAt?: string;
  installedVersion?: string;
  latestVersion?: string;
  installed?: boolean;
  type: MarketplaceEntryType;
}

export interface MarketplaceSearchResult {
  entries: MarketplaceEntry[];
  total: number;
  source: MarketplaceSource;
}

// ============================================================================
// Dashboard Types
// ============================================================================

export interface DashboardState {
  tools: Array<{
    id: ToolId;
    name: string;
    status: SyncStatus;
    installed: boolean;
  }>;
  skills: Array<{
    name: string;
    status: SyncStatus;
    enabled: boolean;
    connectedTools: ToolId[];
  }>;
  mcps: Array<{
    name: string;
    status: SyncStatus;
    enabled: boolean;
    connectedTools: ToolId[];
  }>;
  memory: Array<{
    name: string;
    scope: MemoryScope;
    status: SyncStatus;
  }>;
}
