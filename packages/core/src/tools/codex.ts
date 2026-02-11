import type { ToolDescriptor } from "./_types.js";

export const codex: ToolDescriptor = {
  id: "codex",
  display: { name: "Codex CLI", icon: "openai", color: "#10A37F" },
  cli: { command: "codex", mcp: { add: ["mcp", "add"], remove: ["mcp", "remove"] } },
  detectPath: null,
  paths: {
    mcp: "~/.codex/config.toml",
    projectMcp: null,
    skills: "~/.codex/skills",
    projectSkills: null,
    globalMemory: "~/.codex/AGENTS.md",
    projectMemory: "AGENTS.md",
    agents: null,
    projectAgents: null,
    rules: ".codex/rules/",
    hooks: "~/.codex/config.toml",
    commands: null,
    backupDirs: ["~/.codex"],
  },
  mcp: { format: "toml", key: "mcp.servers", entryShape: "standard" },
  scopes: ["shared", "coding"],
  capabilities: ["mcp", "skills", "memory", "rules", "hooks"],
  enabled: true,
  memoryMaxLines: null,
};
