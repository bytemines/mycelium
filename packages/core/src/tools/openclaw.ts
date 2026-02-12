import type { ToolDescriptor } from "./_types.js";

export const openclaw: ToolDescriptor = {
  id: "openclaw",
  display: { name: "OpenClaw", icon: "openclaw", color: "#EC4899" },
  cli: { command: "openclaw" },
  detectPath: null,
  paths: {
    mcp: "~/.openclaw/openclaw.json",
    projectMcp: null,
    skills: "~/.openclaw/workspace/skills",
    projectSkills: null,
    agents: "~/.openclaw/workspace/agents",
    projectAgents: null,
    rules: null,
    hooks: "~/.openclaw/hooks/",
    commands: null,
    backupDirs: ["~/.openclaw"],
  },
  mcp: { format: "json", key: "plugins.entries", entryShape: "openclaw" },
  capabilities: ["mcp", "skills", "hooks", "agents"],
  enabled: true,
};
