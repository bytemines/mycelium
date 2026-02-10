import type { ToolDescriptor } from "./_types.js";

export const vscode: ToolDescriptor = {
  id: "vscode",
  display: { name: "VS Code", icon: "vscode", color: "#007ACC" },
  cli: { command: "code" },
  paths: {
    mcp: {
      darwin: "~/Library/Application Support/Code/User/mcp.json",
      linux: "~/.config/Code/User/mcp.json",
      win32: "%APPDATA%/Code/User/mcp.json",
    },
    projectMcp: ".vscode/mcp.json",
    skills: null,
    projectSkills: ".github/skills/",
    globalMemory: null,
    projectMemory: ".github/copilot-instructions.md",
    agents: null,
    projectAgents: ".github/agents/",
    rules: ".github/instructions/",
    hooks: null,
    commands: null,
    backupDirs: [],
  },
  mcp: { format: "jsonc", key: "servers", entryShape: "vscode" },
  scopes: ["shared", "coding"],
  capabilities: ["mcp", "skills", "memory", "agents", "rules"],
  enabled: true,
  memoryMaxLines: null,
};
