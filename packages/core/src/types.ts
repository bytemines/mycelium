/**
 * Core types for Mycelium orchestration system
 */

// ============================================================================
// Tool Types
// ============================================================================

export type ToolId = string;

// ============================================================================
// Item State
// ============================================================================

export type ItemState = "enabled" | "disabled" | "deleted";

// ============================================================================
// MCP Types
// ============================================================================

export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  state?: ItemState;
  source?: string;
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
  state?: ItemState;
  source?: string;
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

export interface MachineOverrideEntry {
  command: string;
  detectedAt: string;
}

export interface MachineOverridesFile {
  hostname: string;
  detectedAt: string;
  updatedAt: string;
  mcps: Record<string, MachineOverrideEntry>;
}

export interface Manifest {
  version: string;
  tools: Record<ToolId, { enabled: boolean; state?: ItemState }>;
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
// Snapshot Types
// ============================================================================

export interface SnapshotMetadata {
  name: string;
  createdAt: string;
  description?: string;
  skillSymlinks: Record<string, string>;
  fileList: string[];
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
  components: PluginComponent[];
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
  path?: string;
  source: ToolId;
  event?: string;
  matchers?: string[];
  command?: string;
  timeout?: number;
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
  components: PluginComponent[];
  conflicts: MigrationConflict[];
  strategy: ConflictStrategy;
}

export interface MigrationResult {
  success: boolean;
  skillsImported: number;
  mcpsImported: number;
  memoryImported: number;
  componentsImported: number;
  conflicts: MigrationConflict[];
  errors: string[];
  manifest: MigrationManifest;
}

export type PluginComponentType = "skill" | "agent" | "command" | "hook" | "lib";

export interface PluginComponent {
  name: string;
  type: PluginComponentType;
  path: string;
  description?: string;
  pluginName?: string;
  marketplace?: string;
  metadata?: Record<string, string>;
}

export interface PluginManifest {
  name: string;
  version: string;
  description?: string;
  author?: string;
  components: PluginComponent[];
}

export interface MigrationManifestEntry {
  name: string;
  type: "skill" | "mcp" | "memory" | "hook" | "agent" | "command" | "lib";
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
  hooks: string[];
  libs: string[];
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

export interface DashboardTool {
  id: ToolId;
  name: string;
  status: SyncStatus;
  installed: boolean;
}

export interface DashboardSkill {
  name: string;
  status: SyncStatus;
  enabled: boolean;
  connectedTools: ToolId[];
}

export interface DashboardMcp {
  name: string;
  status: SyncStatus;
  enabled: boolean;
  connectedTools: ToolId[];
}

export interface DashboardMemory {
  name: string;
  scope: MemoryScope;
  status: SyncStatus;
}

export interface DashboardState {
  tools: DashboardTool[];
  skills: DashboardSkill[];
  mcps: DashboardMcp[];
  memory: DashboardMemory[];
}
