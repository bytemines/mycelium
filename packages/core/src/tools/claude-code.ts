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
    globalMemory: "~/.claude/CLAUDE.md",
    projectMemory: "CLAUDE.md",
    agents: "~/.claude/agents/",
    projectAgents: ".claude/agents/",
    rules: null,
    hooks: "~/.claude/settings.json",
    commands: null,
    backupDirs: ["~/.claude", "~/"],
  },
  mcp: { format: "json", key: "mcpServers", entryShape: "standard" },
  scopes: ["shared", "coding"],
  capabilities: ["mcp", "skills", "memory", "agents", "hooks"],
  enabled: true,
  memoryMaxLines: 200,
};
