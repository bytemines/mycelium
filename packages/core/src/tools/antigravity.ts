import type { ToolDescriptor } from "./_types.js";

export const antigravity: ToolDescriptor = {
  id: "antigravity",
  display: { name: "Antigravity", icon: "antigravity", color: "#FF6B35" },
  cli: { command: "agy" },
  paths: {
    mcp: "~/.gemini/antigravity/mcp_config.json",
    projectMcp: null,
    skills: "~/.gemini/antigravity/skills/",
    projectSkills: ".agent/skills/",
    globalMemory: "~/.gemini/antigravity/rules.md",
    projectMemory: ".antigravity/rules.md",
    agents: null,
    projectAgents: ".agent/",
    rules: null,
    hooks: null,
    backupDirs: ["~/.gemini/antigravity"],
  },
  mcp: { format: "json", key: "mcpServers", entryShape: "standard" },
  scopes: ["shared", "coding"],
  capabilities: ["mcp", "skills", "memory", "agents"],
  enabled: true,
  memoryMaxLines: null,
};
