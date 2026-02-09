import type { ToolDescriptor } from "./_types.js";

export const geminiCli: ToolDescriptor = {
  id: "gemini-cli",
  display: { name: "Gemini CLI", icon: "gemini", color: "#4285F4" },
  cli: { command: "gemini", mcp: { add: ["mcp", "add"], remove: ["mcp", "remove"], enable: ["mcp", "enable"], disable: ["mcp", "disable"] } },
  paths: {
    mcp: "~/.gemini/settings.json",
    projectMcp: null,
    skills: "~/.gemini/extensions",
    projectSkills: null,
    globalMemory: "~/.gemini/GEMINI.md",
    projectMemory: "GEMINI.md",
    agents: null,
    projectAgents: null,
    rules: null,
    hooks: null,
    backupDirs: ["~/.gemini"],
  },
  mcp: { format: "json", key: "mcpServers", entryShape: "standard" },
  scopes: ["shared", "coding"],
  capabilities: ["mcp", "skills", "memory"],
  enabled: true,
  memoryMaxLines: null,
};
