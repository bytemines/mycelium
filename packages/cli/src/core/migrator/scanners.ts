/**
 * Tool Scanners — scan installed AI tools for skills, MCPs, memory, hooks
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

import type {
  ToolId,
  ToolScanResult,
} from "@mycelium/core";

import { parseSkillMd } from "../skill-parser.js";
import { detectInstalledTools } from "../tool-detector.js";
import { readFileIfExists, MYCELIUM_HOME } from "../fs-helpers.js";
import { scanPluginCache } from "../plugin-scanner.js";

// ============================================================================
// Helpers
// ============================================================================

async function globDir(dir: string, pattern: RegExp): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const sub = await globDir(full, pattern);
        results.push(...sub);
      } else if (pattern.test(full)) {
        results.push(full);
      }
    }
  } catch {
    // directory doesn't exist or not readable
  }
  return results;
}

// ============================================================================
// Tool Scanners
// ============================================================================

export async function scanClaudeCode(): Promise<ToolScanResult> {
  const home = os.homedir();
  const result: ToolScanResult = {
    toolId: "claude-code",
    toolName: "Claude Code",
    installed: true,
    skills: [],
    mcps: [],
    memory: [],
    hooks: [],
    components: [],
  };

  try {
    // Skills: ~/.claude/plugins/cache/*/skills/*/SKILL.md
    const pluginsCache = path.join(home, ".claude", "plugins", "cache");
    const skillFiles = await globDir(pluginsCache, /SKILL\.md$/);
    for (const skillPath of skillFiles) {
      const content = await readFileIfExists(skillPath);
      if (content) {
        const parsed = parseSkillMd(content);
        // Extract provenance from cache path: cache/{marketplace}/{plugin}/{version}/...
        const parts = skillPath.split(path.sep);
        const cacheIdx = parts.indexOf("cache");
        const marketplace = cacheIdx >= 0 && parts.length > cacheIdx + 1 ? parts[cacheIdx + 1] : undefined;
        const pluginName = cacheIdx >= 0 && parts.length > cacheIdx + 2 ? parts[cacheIdx + 2] : undefined;
        result.skills.push({
          name: parsed.name || path.basename(path.dirname(skillPath)),
          path: skillPath,
          source: "claude-code",
          metadata: { description: parsed.description },
          marketplace,
          pluginName,
        });
      }
    }
  } catch {
    // ignore
  }

  try {
    // MCPs: ~/.claude.json and ~/.claude/mcp.json
    for (const mcpFile of [
      path.join(home, ".claude.json"),
      path.join(home, ".claude", "mcp.json"),
    ]) {
      const content = await readFileIfExists(mcpFile);
      if (content) {
        const parsed = JSON.parse(content);
        const servers = parsed.mcpServers || parsed.mcps || {};
        for (const [name, config] of Object.entries(servers)) {
          const cfg = config as { command?: string; args?: string[]; env?: Record<string, string> };
          result.mcps.push({
            name,
            config: {
              command: cfg.command || "",
              args: cfg.args || [],
              env: cfg.env,
            },
            source: "claude-code",
          });
        }
      }
    }
  } catch {
    // ignore
  }

  try {
    // Memory: ~/.claude/projects/*/memory/MEMORY.md
    const projectsDir = path.join(home, ".claude", "projects");
    const memoryFiles = await globDir(projectsDir, /MEMORY\.md$/);
    for (const memPath of memoryFiles) {
      const content = await readFileIfExists(memPath);
      result.memory.push({
        name: path.basename(path.dirname(path.dirname(memPath))),
        path: memPath,
        source: "claude-code",
        scope: "shared",
        content: content ?? undefined,
      });
    }
  } catch {
    // ignore
  }

  try {
    // Hooks: ~/.claude/hooks/*.py (file-based)
    const hooksDir = path.join(home, ".claude", "hooks");
    const hookFiles = await globDir(hooksDir, /\.py$/);
    for (const hookPath of hookFiles) {
      result.hooks.push({
        name: path.basename(hookPath, ".py"),
        path: hookPath,
        source: "claude-code",
      });
    }
  } catch {
    // ignore
  }

  try {
    // Hooks: ~/.claude/settings.json (config-based hooks)
    const settingsPath = path.join(home, ".claude", "settings.json");
    const settingsRaw = await readFileIfExists(settingsPath);
    if (settingsRaw) {
      const settings = JSON.parse(settingsRaw);
      const hookEvents = ["PreToolUse", "PostToolUse", "Notification", "Stop"];
      for (const event of hookEvents) {
        const hooks = settings.hooks?.[event];
        if (Array.isArray(hooks)) {
          for (const hook of hooks) {
            if (hook && typeof hook === "object" && hook.command) {
              result.hooks.push({
                name: `${event}/${hook.matcher || "default"}`,
                source: "claude-code",
                event,
                matchers: hook.matcher ? [hook.matcher] : undefined,
                command: hook.command,
                timeout: hook.timeout,
              });
            }
          }
        }
      }
    }
  } catch {
    // ignore
  }

  try {
    // Components: scan plugin cache for agents, commands, hooks, lib
    const pluginsCache = path.join(home, ".claude", "plugins", "cache");
    const components = await scanPluginCache(pluginsCache);
    // Filter out skills (already scanned above) to avoid duplicates
    result.components = components.filter((c) => c.type !== "skill");
  } catch {
    // ignore
  }

  return result;
}

export async function scanCodex(): Promise<ToolScanResult> {
  const home = os.homedir();
  const result: ToolScanResult = {
    toolId: "codex",
    toolName: "Codex CLI",
    installed: true,
    skills: [],
    mcps: [],
    memory: [],
    hooks: [],
    components: [],
  };

  try {
    // MCPs: ~/.codex/config.toml — parse [mcp.servers.*] sections
    const configPath = path.join(home, ".codex", "config.toml");
    const content = await readFileIfExists(configPath);
    if (content) {
      const serverRegex = /\[mcp\.servers\.(\w+)\]/g;
      let match: RegExpExecArray | null;
      while ((match = serverRegex.exec(content)) !== null) {
        const serverName = match[1];
        const startIdx = match.index + match[0].length;
        const nextSection = content.indexOf("\n[", startIdx);
        const block = content.slice(startIdx, nextSection === -1 ? undefined : nextSection);

        const commandMatch = block.match(/command\s*=\s*"([^"]+)"/);
        const argsMatch = block.match(/args\s*=\s*\[([^\]]*)\]/);
        const args = argsMatch
          ? argsMatch[1].match(/"([^"]+)"/g)?.map((a) => a.replace(/"/g, "")) ?? []
          : [];

        result.mcps.push({
          name: serverName,
          config: {
            command: commandMatch?.[1] ?? serverName,
            args,
          },
          source: "codex",
        });
      }
    }
  } catch {
    // ignore
  }

  try {
    // Skills: ~/.codex/skills/ directory
    const skillsDir = path.join(home, ".codex", "skills");
    const entries = await fs.readdir(skillsDir, { withFileTypes: true });
    for (const entry of entries) {
      // Skip hidden dirs/files (e.g., .system)
      if (entry.name.startsWith(".")) continue;
      const fullPath = path.join(skillsDir, entry.name);
      result.skills.push({
        name: entry.name.replace(/\.[^.]+$/, ""),
        path: fullPath,
        source: "codex",
      });
    }
  } catch {
    // ignore
  }

  try {
    // Memory: ~/.codex/AGENTS.md
    const agentsPath = path.join(home, ".codex", "AGENTS.md");
    const content = await readFileIfExists(agentsPath);
    if (content) {
      result.memory.push({
        name: "AGENTS",
        path: agentsPath,
        source: "codex",
        scope: "shared",
        content,
      });
    }
  } catch {
    // ignore
  }

  return result;
}

export async function scanGemini(): Promise<ToolScanResult> {
  const home = os.homedir();
  const result: ToolScanResult = {
    toolId: "gemini-cli",
    toolName: "Gemini CLI",
    installed: true,
    skills: [],
    mcps: [],
    memory: [],
    hooks: [],
    components: [],
  };

  try {
    const geminiPath = path.join(home, ".gemini", "GEMINI.md");
    const content = await readFileIfExists(geminiPath);
    if (content) {
      result.memory.push({
        name: "GEMINI",
        path: geminiPath,
        source: "gemini-cli",
        scope: "shared",
        content,
      });
    }
  } catch {
    // ignore
  }

  return result;
}

export async function scanOpenClaw(): Promise<ToolScanResult> {
  const home = os.homedir();
  const result: ToolScanResult = {
    toolId: "openclaw",
    toolName: "OpenClaw",
    installed: true,
    skills: [],
    mcps: [],
    memory: [],
    hooks: [],
    components: [],
  };

  try {
    const configPath = path.join(home, ".openclaw", "openclaw.json");
    let raw = await readFileIfExists(configPath);
    if (raw) {
      // Strip // comments for JSON5 compat (only at line start or after whitespace)
      raw = raw.replace(/^\s*\/\/.*$/gm, "");
      const config = JSON.parse(raw);

      // Skills from skills.entries[]
      if (config.skills?.entries) {
        for (const entry of config.skills.entries) {
          result.skills.push({
            name: entry.name,
            path: entry.path ?? "",
            source: "openclaw",
            metadata: { enabled: String(entry.enabled ?? true) },
          });
        }
      }

      // MCPs from plugins.entries[] where type === "mcp-adapter"
      if (config.plugins?.entries) {
        for (const entry of config.plugins.entries) {
          if (entry.type === "mcp-adapter") {
            result.mcps.push({
              name: entry.name,
              config: {
                command: entry.config?.serverUrl ?? "",
                args: entry.config?.transport ? [entry.config.transport] : [],
              },
              source: "openclaw",
            });
          }
        }
      }
    }
  } catch {
    // ignore
  }

  try {
    // Memory: workspace MEMORY.md files
    const memoryDir = path.join(home, ".openclaw");
    const memFiles = await globDir(memoryDir, /MEMORY\.md$/);
    for (const memPath of memFiles) {
      const content = await readFileIfExists(memPath);
      result.memory.push({
        name: path.basename(path.dirname(memPath)),
        path: memPath,
        source: "openclaw",
        scope: "shared",
        content: content ?? undefined,
      });
    }
  } catch {
    // ignore
  }

  return result;
}

export async function scanTool(toolId: ToolId): Promise<ToolScanResult> {
  switch (toolId) {
    case "claude-code":
      return scanClaudeCode();
    case "codex":
      return scanCodex();
    case "gemini-cli":
      return scanGemini();
    case "openclaw":
      return scanOpenClaw();
    case "opencode":
    case "aider":
    default:
      return {
        toolId,
        toolName: toolId,
        installed: false,
        skills: [],
        mcps: [],
        memory: [],
        hooks: [],
        components: [],
      };
  }
}

export async function scanAllTools(): Promise<ToolScanResult[]> {
  const detected = await detectInstalledTools();
  const installed = detected.filter((t) => t.installed);
  const results: ToolScanResult[] = [];
  for (const tool of installed) {
    const scan = await scanTool(tool.id as ToolId);
    results.push(scan);
  }
  return results;
}
