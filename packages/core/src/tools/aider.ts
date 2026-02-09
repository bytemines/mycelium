import type { ToolDescriptor } from "./_types.js";

export const aider: ToolDescriptor = {
  id: "aider",
  display: { name: "Aider", icon: "aider", color: "#22C55E" },
  cli: null,
  paths: {
    mcp: "~/.aider/mcp-servers.json",
    projectMcp: null,
    skills: "~/.aider/plugins",
    projectSkills: null,
    globalMemory: "~/.aider/MEMORY.md",
    projectMemory: null,
    agents: null,
    projectAgents: null,
    rules: null,
    hooks: null,
    backupDirs: ["~/.aider"],
  },
  mcp: { format: "json", key: "mcpServers", entryShape: "standard" },
  scopes: ["shared", "coding"],
  capabilities: ["mcp", "skills", "memory"],
  enabled: true,
  memoryMaxLines: null,
};
