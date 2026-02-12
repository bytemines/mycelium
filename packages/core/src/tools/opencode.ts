import type { ToolDescriptor } from "./_types.js";

export const opencode: ToolDescriptor = {
  id: "opencode",
  display: { name: "OpenCode", icon: "opencode", color: "#6366F1" },
  cli: null,
  detectPath: "~/.config/opencode/opencode.json",
  paths: {
    mcp: "~/.config/opencode/opencode.json",
    projectMcp: null,
    skills: "~/.config/opencode/plugin",
    projectSkills: null,
    agents: "~/.config/opencode/agents/",
    projectAgents: ".opencode/agents/",
    rules: null,
    hooks: "~/.config/opencode/settings.json",
    commands: "~/.config/opencode/commands/",
    backupDirs: ["~/.config/opencode"],
  },
  mcp: { format: "json", key: "mcp", entryShape: "opencode" },
  capabilities: ["mcp", "skills", "agents", "hooks", "commands"],
  enabled: true,
};
