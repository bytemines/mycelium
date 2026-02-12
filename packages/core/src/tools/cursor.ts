import type { ToolDescriptor } from "./_types.js";

export const cursor: ToolDescriptor = {
  id: "cursor",
  display: { name: "Cursor", icon: "cursor", color: "#00D4AA" },
  cli: { command: "cursor" },
  detectPath: null,
  paths: {
    mcp: "~/.cursor/mcp.json",
    projectMcp: ".cursor/mcp.json",
    skills: null,
    projectSkills: null,
    agents: null,
    projectAgents: ".cursor/agents/",
    rules: ".cursor/rules/",
    hooks: ".cursor/hooks.json",
    commands: ".cursor/commands/",
    backupDirs: ["~/.cursor"],
  },
  mcp: { format: "json", key: "mcpServers", entryShape: "standard" },
  capabilities: ["mcp", "rules", "agents", "hooks", "commands"],
  enabled: true,
};
