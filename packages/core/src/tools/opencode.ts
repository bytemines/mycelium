import type { ToolDescriptor } from "./_types.js";

export const opencode: ToolDescriptor = {
  id: "opencode",
  display: { name: "OpenCode", icon: "opencode", color: "#6366F1" },
  cli: null,
  paths: {
    mcp: "~/.config/opencode/opencode.json",
    projectMcp: null,
    skills: "~/.config/opencode/plugin",
    projectSkills: null,
    globalMemory: "~/.opencode/context.md",
    projectMemory: null,
    agents: "~/.config/opencode/agents/",
    projectAgents: ".opencode/agents/",
    rules: null,
    hooks: "~/.config/opencode/settings.json",
    commands: "~/.config/opencode/commands/",
    backupDirs: ["~/.config/opencode"],
  },
  mcp: { format: "json", key: "mcp", entryShape: "opencode" },
  scopes: ["shared", "coding"],
  capabilities: ["mcp", "skills", "memory", "agents", "hooks", "commands"],
  enabled: true,
  memoryMaxLines: null,
};
