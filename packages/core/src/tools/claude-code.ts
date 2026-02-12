import type { ToolDescriptor } from "./_types.js";

export const claudeCode: ToolDescriptor = {
  id: "claude-code",
  display: { name: "Claude Code", icon: "claude", color: "#D97706" },
  cli: { command: "claude", mcp: { add: ["mcp", "add-json"], remove: ["mcp", "remove"] } },
  detectPath: null,
  paths: {
    mcp: "~/.claude.json",
    projectMcp: ".claude/mcp.json",
    skills: "~/.claude/skills",
    projectSkills: ".claude/skills/",
    agents: "~/.claude/agents/",
    projectAgents: ".claude/agents/",
    rules: null,
    hooks: "~/.claude/settings.json",
    commands: null,
    backupDirs: ["~/.claude", "~/"],
  },
  mcp: { format: "json", key: "mcpServers", entryShape: "standard" },
  capabilities: ["mcp", "skills", "agents", "hooks"],
  enabled: true,
};
