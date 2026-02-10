import type { ToolDescriptor } from "./_types.js";

export const openclaw: ToolDescriptor = {
  id: "openclaw",
  display: { name: "OpenClaw", icon: "openclaw", color: "#EC4899" },
  cli: null,
  paths: {
    mcp: "~/.openclaw/openclaw.json",
    projectMcp: null,
    skills: "~/.openclaw/skills",
    projectSkills: null,
    globalMemory: "~/.openclaw/MEMORY.md",
    projectMemory: null,
    agents: null,
    projectAgents: null,
    rules: null,
    hooks: "~/.openclaw/hooks/",
    commands: null,
    backupDirs: ["~/.openclaw"],
  },
  mcp: { format: "json", key: "plugins.entries", entryShape: "openclaw" },
  scopes: ["shared", "personal"],
  capabilities: ["mcp", "skills", "memory", "hooks"],
  enabled: true,
  memoryMaxLines: null,
};
