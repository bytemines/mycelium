/**
 * Migrator — scans installed AI tools and imports configs into ~/.mycelium/
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

import type {
  ToolId,
  ToolScanResult,
  ScannedSkill,
  ScannedMcp,
  ScannedMemory,
  ScannedHook,
  MigrationPlan,
  MigrationResult,
  MigrationManifest,
  MigrationManifestEntry,
  ConflictStrategy,
  MigrationConflict,
  McpServerConfig,
} from "@mycelium/core";

import { parseSkillMd } from "./skill-parser.js";
import { detectInstalledTools } from "./tool-detector.js";

// ============================================================================
// Helpers
// ============================================================================

export function expandHome(p: string): string {
  if (p.startsWith("~")) {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

const MYCELIUM_DIR = path.join(os.homedir(), ".mycelium");
const MANIFEST_PATH = path.join(MYCELIUM_DIR, "migration-manifest.json");

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

async function readFileIfExists(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return null;
  }
}

async function mkdirp(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
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
          const cfg = config as Record<string, any>;
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
    // Hooks: ~/.claude/hooks/*.py
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

// ============================================================================
// Migration Plan
// ============================================================================

export function generateMigrationPlan(
  scans: ToolScanResult[],
  strategy: ConflictStrategy = "latest",
): MigrationPlan {
  const allSkills: ScannedSkill[] = [];
  const allMcps: ScannedMcp[] = [];
  const allMemory: ScannedMemory[] = [];
  const conflicts: MigrationConflict[] = [];

  // Collect everything
  for (const scan of scans) {
    allSkills.push(...scan.skills);
    allMcps.push(...scan.mcps);
    allMemory.push(...scan.memory);
  }

  // Detect skill conflicts (same name from different tools)
  const skillsByName = new Map<string, ScannedSkill[]>();
  for (const skill of allSkills) {
    const group = skillsByName.get(skill.name) ?? [];
    group.push(skill);
    skillsByName.set(skill.name, group);
  }

  const resolvedSkills: ScannedSkill[] = [];
  for (const [name, group] of skillsByName) {
    if (group.length === 1) {
      resolvedSkills.push(group[0]);
      continue;
    }
    // Conflict
    const conflict: MigrationConflict = {
      name,
      type: "skill",
      entries: group.map((s) => ({
        source: s.source,
        version: s.version,
        lastUpdated: s.lastUpdated,
      })),
    };

    if (strategy === "latest") {
      // Pick newest or first
      const sorted = [...group].sort((a, b) => {
        if (a.lastUpdated && b.lastUpdated) {
          return b.lastUpdated.getTime() - a.lastUpdated.getTime();
        }
        return 0;
      });
      conflict.resolved = { source: sorted[0].source };
      resolvedSkills.push(sorted[0]);
    } else if (strategy === "all") {
      // Namespace as name@toolId
      for (const s of group) {
        resolvedSkills.push({ ...s, name: `${s.name}@${s.source}` });
      }
      conflict.resolved = { source: group[0].source };
    }
    // "interactive" leaves unresolved

    conflicts.push(conflict);
  }

  // Deduplicate MCPs by name
  const mcpsByName = new Map<string, ScannedMcp[]>();
  for (const mcp of allMcps) {
    const group = mcpsByName.get(mcp.name) ?? [];
    group.push(mcp);
    mcpsByName.set(mcp.name, group);
  }

  const resolvedMcps: ScannedMcp[] = [];
  for (const [name, group] of mcpsByName) {
    if (group.length === 1) {
      resolvedMcps.push(group[0]);
      continue;
    }
    // Check if configs differ
    const configStrings = group.map((m) => JSON.stringify(m.config));
    const allSame = configStrings.every((c) => c === configStrings[0]);
    if (allSame) {
      resolvedMcps.push(group[0]);
    } else {
      conflicts.push({
        name,
        type: "mcp",
        entries: group.map((m) => ({
          source: m.source,
          config: m.config,
        })),
        resolved: strategy !== "interactive" ? { source: group[0].source } : undefined,
      });
      if (strategy !== "interactive") {
        resolvedMcps.push(group[0]);
      }
    }
  }

  return {
    skills: resolvedSkills,
    mcps: resolvedMcps,
    memory: allMemory,
    conflicts,
    strategy,
  };
}

// ============================================================================
// Migration Execution
// ============================================================================

function serializeMcpsYaml(mcps: ScannedMcp[]): string {
  let yaml = "# Mycelium MCP Configuration\n# Auto-generated by migration\n\n";
  for (const mcp of mcps) {
    yaml += `${mcp.name}:\n`;
    yaml += `  command: ${mcp.config.command}\n`;
    if (mcp.config.args && mcp.config.args.length > 0) {
      yaml += `  args:\n`;
      for (const arg of mcp.config.args) {
        yaml += `    - ${arg}\n`;
      }
    }
    if (mcp.config.env) {
      yaml += `  env:\n`;
      for (const [key, val] of Object.entries(mcp.config.env)) {
        yaml += `    ${key}: ${val}\n`;
      }
    }
    yaml += "\n";
  }
  return yaml;
}

export async function executeMigration(plan: MigrationPlan): Promise<MigrationResult> {
  const errors: string[] = [];
  const entries: MigrationManifestEntry[] = [];
  const now = new Date().toISOString();

  const skillsDir = path.join(MYCELIUM_DIR, "global", "skills");
  const memoryDir = path.join(MYCELIUM_DIR, "memory");
  await mkdirp(skillsDir);
  await mkdirp(memoryDir);

  // Skills: symlink from original path
  let skillsImported = 0;
  for (const skill of plan.skills) {
    const dest = path.join(skillsDir, skill.name);
    try {
      // Remove existing symlink if any
      try {
        await fs.unlink(dest);
      } catch {
        // doesn't exist
      }
      await fs.symlink(skill.path, dest);
      skillsImported++;
      entries.push({
        name: skill.name,
        type: "skill",
        source: skill.source,
        originalPath: skill.path,
        importedPath: dest,
        importedAt: now,
        version: skill.version,
        strategy: plan.strategy,
        marketplace: skill.marketplace,
        pluginName: skill.pluginName,
      });
    } catch (err) {
      errors.push(`Failed to symlink skill ${skill.name}: ${err}`);
    }
  }

  // MCPs: write mcps.yaml
  let mcpsImported = 0;
  if (plan.mcps.length > 0) {
    const mcpsPath = path.join(MYCELIUM_DIR, "global", "mcps.yaml");
    try {
      await mkdirp(path.join(MYCELIUM_DIR, "global"));
      await fs.writeFile(mcpsPath, serializeMcpsYaml(plan.mcps), "utf-8");
      mcpsImported = plan.mcps.length;
      for (const mcp of plan.mcps) {
        entries.push({
          name: mcp.name,
          type: "mcp",
          source: mcp.source,
          originalPath: "",
          importedPath: mcpsPath,
          importedAt: now,
          strategy: plan.strategy,
        });
      }
    } catch (err) {
      errors.push(`Failed to write mcps.yaml: ${err}`);
    }
  }

  // Memory: copy files
  let memoryImported = 0;
  for (const mem of plan.memory) {
    const dest = path.join(memoryDir, `${mem.source}-${mem.name}.md`);
    try {
      if (mem.content) {
        await fs.writeFile(dest, mem.content, "utf-8");
      } else {
        await fs.copyFile(mem.path, dest);
      }
      memoryImported++;
      entries.push({
        name: mem.name,
        type: "memory",
        source: mem.source,
        originalPath: mem.path,
        importedPath: dest,
        importedAt: now,
        strategy: plan.strategy,
      });
    } catch (err) {
      errors.push(`Failed to copy memory ${mem.name}: ${err}`);
    }
  }

  // Auto-register discovered marketplaces from migrated skills
  const discoveredMarketplaces = new Set<string>();
  for (const skill of plan.skills) {
    if (skill.marketplace) {
      discoveredMarketplaces.add(skill.marketplace);
    }
  }
  if (discoveredMarketplaces.size > 0) {
    try {
      const { loadMarketplaceRegistry, saveMarketplaceRegistry } = await import("./marketplace-registry.js");
      const registry = await loadMarketplaceRegistry();
      for (const mp of discoveredMarketplaces) {
        if (!registry[mp]) {
          registry[mp] = {
            type: "claude-marketplace",
            enabled: true,
            discovered: true,
          };
        }
      }
      await saveMarketplaceRegistry(registry);
    } catch {
      // Non-fatal: marketplace registry update failed
    }
  }

  const manifest: MigrationManifest = {
    version: "1.0.0",
    lastMigration: now,
    entries,
  };
  await saveManifest(manifest);

  return {
    success: errors.length === 0,
    skillsImported,
    mcpsImported,
    memoryImported,
    conflicts: plan.conflicts,
    errors,
    manifest,
  };
}

// ============================================================================
// Clear Migration
// ============================================================================

export async function clearMigration(
  options?: { toolId?: ToolId },
): Promise<{ cleared: string[]; errors: string[] }> {
  const cleared: string[] = [];
  const errors: string[] = [];

  const manifest = await loadManifest();

  if (options?.toolId) {
    // Only clear entries from specific tool
    const toRemove = manifest.entries.filter((e) => e.source === options.toolId);
    const remaining = manifest.entries.filter((e) => e.source !== options.toolId);

    for (const entry of toRemove) {
      try {
        await fs.unlink(entry.importedPath);
        cleared.push(entry.importedPath);
      } catch (err) {
        // For mcps.yaml, don't delete if other entries still reference it
        if (entry.type !== "mcp" || !remaining.some((r) => r.type === "mcp")) {
          errors.push(`Failed to remove ${entry.importedPath}: ${err}`);
        }
      }
    }

    manifest.entries = remaining;
    manifest.lastMigration = new Date().toISOString();
    await saveManifest(manifest);
  } else {
    // Clear everything
    const dirs = [
      path.join(MYCELIUM_DIR, "global", "skills"),
      path.join(MYCELIUM_DIR, "memory"),
    ];
    for (const dir of dirs) {
      try {
        await fs.rm(dir, { recursive: true, force: true });
        cleared.push(dir);
      } catch (err) {
        errors.push(`Failed to remove ${dir}: ${err}`);
      }
    }

    const mcpsPath = path.join(MYCELIUM_DIR, "global", "mcps.yaml");
    try {
      await fs.unlink(mcpsPath);
      cleared.push(mcpsPath);
    } catch {
      // doesn't exist
    }

    try {
      await fs.unlink(MANIFEST_PATH);
      cleared.push(MANIFEST_PATH);
    } catch {
      // doesn't exist
    }
  }

  return { cleared, errors };
}

// ============================================================================
// Manifest
// ============================================================================

export async function loadManifest(): Promise<MigrationManifest> {
  const content = await readFileIfExists(MANIFEST_PATH);
  if (content) {
    return JSON.parse(content);
  }
  return {
    version: "1.0.0",
    lastMigration: "",
    entries: [],
  };
}

export async function saveManifest(manifest: MigrationManifest): Promise<void> {
  await mkdirp(path.dirname(MANIFEST_PATH));
  await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2), "utf-8");
}
