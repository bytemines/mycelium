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
    agents: null,
    projectAgents: null,
    rules: ".codex/rules/",
    hooks: "~/.codex/config.toml",
    commands: null,
    backupDirs: ["~/.codex"],
  },
  mcp: { format: "toml", key: "mcp.servers", entryShape: "standard" },
  capabilities: ["mcp", "skills", "rules", "hooks"],
  enabled: true,
};
