import type { ToolDescriptor } from "./_types.js";

export const antigravity: ToolDescriptor = {
  id: "antigravity",
  display: { name: "Antigravity", icon: "antigravity", color: "#FF6B35" },
  cli: { command: "agy" },
  detectPath: null,
  paths: {
    mcp: "~/.gemini/antigravity/mcp_config.json",
    projectMcp: null,
    skills: "~/.gemini/antigravity/skills/",
    projectSkills: ".agent/skills/",
    agents: null,
    projectAgents: ".agent/",
    rules: null,
    hooks: null,
    commands: null,
    backupDirs: ["~/.gemini/antigravity"],
  },
  mcp: { format: "json", key: "mcpServers", entryShape: "standard" },
  capabilities: ["mcp", "skills", "agents"],
  enabled: true,
};
