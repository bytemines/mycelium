/**
 * Tool Registry Types — defines the ToolDescriptor interface and related types.
 */

export type Capability = "mcp" | "skills" | "memory" | "agents" | "hooks" | "rules";

export type McpFormat = "json" | "jsonc" | "toml" | "yaml";

export type McpEntryShape = "standard" | "openclaw" | "opencode" | "vscode";

export interface PlatformPaths {
  darwin: string;
  linux: string;
  win32: string;
}

export type PathSpec = string | PlatformPaths | null;

export interface ToolPaths {
  mcp: PathSpec;
  projectMcp: PathSpec;
  skills: PathSpec;
  projectSkills: PathSpec;
  globalMemory: PathSpec;
  projectMemory: PathSpec;
  agents: PathSpec;
  projectAgents: PathSpec;
  rules: PathSpec;
  hooks: PathSpec;
  backupDirs: string[];
}

export interface McpConfig {
  format: McpFormat;
  key: string;
  entryShape: McpEntryShape;
}

export interface ToolCli {
  command: string;
  mcp?: {
    add: string[];
    remove: string[];
    enable?: string[];
    disable?: string[];
  };
}

export interface ToolDisplay {
  name: string;
  icon: string;
  color: string;
}

export interface ToolDescriptor {
  id: string;
  display: ToolDisplay;
  cli: ToolCli | null;
  paths: ToolPaths;
  mcp: McpConfig;
  scopes: string[];
  capabilities: Capability[];
  enabled: boolean;
  memoryMaxLines: number | null;
}
