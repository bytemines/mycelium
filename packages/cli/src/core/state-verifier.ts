/**
 * State Verifier — checks both mycelium manifest AND actual tool config files.
 *
 * Answers the question: "Is item X truly disabled/absent in tool Y's config?"
 * Works for all item types (skill, mcp, hook, agent, command)
 * and all 9 tools.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as jsonc from "jsonc-parser";
import {
  type ToolId,
  ALL_TOOL_IDS,
  TOOL_REGISTRY,
  resolvePath,
} from "@mycelish/core";
import { readFileIfExists } from "./fs-helpers.js";
import { getItemState, type ItemStateInfo, type ItemType } from "./manifest-state.js";

// ============================================================================
// Types
// ============================================================================

export interface ToolPresence {
  toolId: ToolId;
  toolName: string;
  presentInConfig: boolean;
  configPath: string | null;
  details?: string;
}

export interface VerificationResult extends ItemStateInfo {
  /** Per-tool presence check — is the item actually in each tool's config? */
  toolPresence: ToolPresence[];
  /** Items where manifest says disabled but tool config still has it */
  drifted: string[];
}

// ============================================================================
// Tool Config Readers (by item type)
// ============================================================================

/** Check if an MCP entry exists in a tool's config file */
async function checkMcpInTool(name: string, toolId: ToolId): Promise<{ present: boolean; configPath: string | null; details?: string }> {
  const desc = TOOL_REGISTRY[toolId];
  const configPath = resolvePath(desc.paths.mcp);
  if (!configPath) return { present: false, configPath: null, details: "no mcp path configured" };

  const content = await readFileIfExists(configPath);
  if (!content) return { present: false, configPath, details: "config file not found" };

  try {
    // TOML: simple regex check for section header
    if (desc.mcp.format === "toml") {
      return { present: parseMcpFromToml(content, name), configPath };
    }

    const parsed = desc.mcp.format === "jsonc"
      ? jsonc.parse(content) as Record<string, unknown>
      : JSON.parse(content) as Record<string, unknown>;

    // Navigate nested key (e.g., "mcpServers" or "settings.mcpServers")
    const mcpSection = getNestedKey(parsed, desc.mcp.key);
    if (!mcpSection || typeof mcpSection !== "object") {
      return { present: false, configPath, details: `no ${desc.mcp.key} section` };
    }

    // OpenClaw uses object format: plugins.entries.{name}
    if (desc.mcp.entryShape === "openclaw") {
      const entries = (mcpSection as Record<string, unknown>).entries;
      if (entries && typeof entries === "object" && !Array.isArray(entries)) {
        const found = name in (entries as Record<string, unknown>);
        return { present: found, configPath };
      }
      return { present: false, configPath };
    }

    // Standard: check if name is a key in the mcpServers object
    const present = name in (mcpSection as Record<string, unknown>);
    return { present, configPath };
  } catch {
    return { present: false, configPath, details: "failed to parse config" };
  }
}

/** Check if a skill/agent/command directory/symlink exists in a tool's dir */
async function checkFileInToolDir(name: string, toolId: ToolId, pathKey: keyof import("@mycelish/core").ToolPaths): Promise<{ present: boolean; configPath: string | null; details?: string }> {
  const desc = TOOL_REGISTRY[toolId];
  const dirPath = resolvePath(desc.paths[pathKey] as import("@mycelish/core").PathSpec);
  if (!dirPath) return { present: false, configPath: null, details: `no ${pathKey} path configured` };

  try {
    // Check if name exists as file, dir, or symlink in the tool's directory
    await fs.access(path.join(dirPath, name));
    return { present: true, configPath: dirPath };
  } catch {
    // Also check with common extensions
    for (const ext of [".md", ".yaml", ".yml"]) {
      try {
        await fs.access(path.join(dirPath, name + ext));
        return { present: true, configPath: dirPath };
      } catch { /* continue */ }
    }
    return { present: false, configPath: dirPath };
  }
}

// ============================================================================
// Helpers
// ============================================================================

function getNestedKey(obj: Record<string, unknown>, key: string): unknown {
  const parts = key.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function parseMcpFromToml(content: string, name: string): boolean {
  // Simple check: look for [mcpServers.name] section header
  const pattern = new RegExp(`\\[mcpServers\\.${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\]`);
  return pattern.test(content);
}

/** Map item type → which tool path to check */
const TYPE_TO_CHECK: Record<ItemType, (name: string, toolId: ToolId) => Promise<{ present: boolean; configPath: string | null; details?: string }>> = {
  mcp: checkMcpInTool,
  skill: (name, toolId) => checkFileInToolDir(name, toolId, "skills"),
  agent: (name, toolId) => checkFileInToolDir(name, toolId, "agents"),
  command: (name, toolId) => checkFileInToolDir(name, toolId, "skills"), // commands live in skills dir
  hook: (name, toolId) => checkFileInToolDir(name, toolId, "hooks"),
  rule: (name, toolId) => checkFileInToolDir(name, toolId, "rules"),
};

// ============================================================================
// Main Verification Function
// ============================================================================

/**
 * Verify an item's state across both manifest AND actual tool configs.
 *
 * @param name - Item name (e.g., "code-reviewer", "postgres-mcp")
 * @param opts.projectRoot - Project root for project-level manifest
 * @param opts.tool - Single tool to check (default: all installed tools)
 * @param opts.type - Override item type if not in manifest (e.g., "agent")
 */
export async function verifyItemState(
  name: string,
  opts?: { projectRoot?: string; tool?: ToolId; type?: ItemType },
): Promise<VerificationResult> {
  // 1. Get manifest state
  const manifestState = await getItemState(name, opts);

  // 2. Determine item type
  const itemType = opts?.type ?? manifestState.type ?? "skill";

  // 3. Determine which tools to check
  const toolIds: ToolId[] = opts?.tool ? [opts.tool] : ALL_TOOL_IDS;

  // 4. Check actual tool configs
  const checker = TYPE_TO_CHECK[itemType];
  const toolPresence: ToolPresence[] = [];

  for (const toolId of toolIds) {
    const desc = TOOL_REGISTRY[toolId];
    const result = await checker(name, toolId);
    toolPresence.push({
      toolId,
      toolName: desc.display.name,
      presentInConfig: result.present,
      configPath: result.configPath,
      details: result.details,
    });
  }

  // 5. Detect drift — manifest says disabled but tool still has item
  const drifted: string[] = [];
  const manifestDisabled = manifestState.state === "disabled" || manifestState.state === "deleted";
  if (manifestDisabled) {
    for (const tp of toolPresence) {
      if (tp.presentInConfig) {
        drifted.push(`${tp.toolName}: item still present in config (${tp.configPath})`);
      }
    }
  }

  return {
    ...manifestState,
    type: itemType,
    toolPresence,
    drifted,
  };
}
