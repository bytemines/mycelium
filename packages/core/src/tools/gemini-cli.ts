import type { ToolDescriptor } from "./_types.js";

export const geminiCli: ToolDescriptor = {
  id: "gemini-cli",
  display: { name: "Gemini CLI", icon: "gemini", color: "#4285F4" },
  cli: { command: "gemini", mcp: { add: ["mcp", "add"], remove: ["mcp", "remove"], enable: ["mcp", "enable"], disable: ["mcp", "disable"] } },
  detectPath: null,
  paths: {
    mcp: "~/.gemini/settings.json",
    projectMcp: null,
    skills: "~/.gemini/extensions",
    projectSkills: null,
    agents: null,
    projectAgents: null,
    rules: null,
    hooks: "~/.gemini/settings.json",
    commands: null,
    backupDirs: ["~/.gemini"],
  },
  mcp: { format: "json", key: "mcpServers", entryShape: "standard" },
  capabilities: ["mcp", "skills", "hooks"],
  enabled: true,
};
