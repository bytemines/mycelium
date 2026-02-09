/**
 * Memory Scoper Module
 * Manages memory file syncing across AI tools with privacy scopes
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  type ToolId,
  type MemoryScope,
  TOOL_REGISTRY,
  toolsForScope,
  expandPath,
  pathExists,
  ensureDir,
} from "@mycelium/core";
import { compressMemory, mergeMemoryFiles } from "./smart-memory.js";

// ============================================================================
// Types
// ============================================================================

export interface MemoryScopeDefinition {
  syncTo: ToolId[];
  excludeFrom?: ToolId[];
  path: string;
}

export interface MemoryFile {
  scope: MemoryScope;
  filename: string;
  path: string;
  content?: string;
}

export interface SyncResult {
  success: boolean;
  filesWritten: number;
  error?: string;
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Memory scope configuration defining which tools receive which scopes
 */
export const MEMORY_SCOPE_CONFIG: Record<MemoryScope, MemoryScopeDefinition> = {
  shared: {
    syncTo: toolsForScope("shared").map(t => t.id),
    path: "global/memory/shared/",
  },
  coding: {
    syncTo: toolsForScope("coding").map(t => t.id),
    excludeFrom: Object.values(TOOL_REGISTRY)
      .filter(t => !t.scopes.includes("coding"))
      .map(t => t.id),
    path: "global/memory/coding/",
  },
  personal: {
    syncTo: toolsForScope("personal").map(t => t.id),
    excludeFrom: Object.values(TOOL_REGISTRY)
      .filter(t => !t.scopes.includes("personal"))
      .map(t => t.id),
    path: "global/memory/personal/",
  },
};

// ============================================================================
// Functions
// ============================================================================

/**
 * Check if a tool should receive a specific memory scope
 */
export function isToolInScope(tool: ToolId, scope: MemoryScope): boolean {
  const scopeConfig = MEMORY_SCOPE_CONFIG[scope];
  return scopeConfig.syncTo.includes(tool);
}

/**
 * Get all memory scopes applicable to a tool
 */
export function getScopesForTool(tool: ToolId): MemoryScope[] {
  const scopes: MemoryScope[] = [];
  for (const [scope, config] of Object.entries(MEMORY_SCOPE_CONFIG)) {
    if (config.syncTo.includes(tool)) {
      scopes.push(scope as MemoryScope);
    }
  }
  return scopes;
}

/**
 * Get the full path to a scope's memory directory
 */
function getScopeDirectory(scope: MemoryScope): string {
  const scopeConfig = MEMORY_SCOPE_CONFIG[scope];
  return expandPath(`~/.mycelium/${scopeConfig.path}`);
}

/**
 * Load all memory files from a specific scope directory
 */
export async function loadMemoryFiles(scope: MemoryScope): Promise<MemoryFile[]> {
  const scopeDir = getScopeDirectory(scope);

  if (!(await pathExists(scopeDir))) {
    return [];
  }

  const entries = await fs.readdir(scopeDir);
  const mdFiles = entries.filter((f) => f.endsWith(".md"));

  const files: MemoryFile[] = [];
  for (const filename of mdFiles) {
    const filePath = path.join(scopeDir, filename);
    const content = await fs.readFile(filePath, "utf-8");
    files.push({
      scope,
      filename,
      path: filePath,
      content,
    });
  }

  return files;
}

/**
 * Get all memory files applicable to a tool (without content)
 */
export async function getMemoryFilesForTool(tool: ToolId): Promise<MemoryFile[]> {
  const scopes = getScopesForTool(tool);
  const allFiles: MemoryFile[] = [];

  for (const scope of scopes) {
    const scopeDir = getScopeDirectory(scope);

    if (!(await pathExists(scopeDir))) {
      continue;
    }

    const entries = await fs.readdir(scopeDir);
    const mdFiles = entries.filter((f) => f.endsWith(".md"));

    for (const filename of mdFiles) {
      allFiles.push({
        scope,
        filename,
        path: path.join(scopeDir, filename),
      });
    }
  }

  return allFiles;
}

/**
 * Sync memory files to a specific tool
 * Concatenates all applicable memory files with scope headers
 */
import { TOOL_MAX_LINES } from "./fs-helpers.js";

export async function syncMemoryToTool(tool: ToolId): Promise<SyncResult> {
  try {
    const scopes = getScopesForTool(tool);
    const memoryFiles: Array<{ scope: string; content: string }> = [];

    for (const scope of scopes) {
      const files = await loadMemoryFiles(scope);

      for (const file of files) {
        if (file.content) {
          memoryFiles.push({ scope, content: file.content });
        }
      }
    }

    // No files to write
    if (memoryFiles.length === 0) {
      return { success: true, filesWritten: 0 };
    }

    // Merge and deduplicate across scopes
    let content = mergeMemoryFiles(memoryFiles);

    // Compress if tool has a max line limit
    const maxLines = TOOL_MAX_LINES[tool];
    if (maxLines) {
      content = compressMemory(content, { maxLines });
    }

    // Get tool's memory path — use expandPath so mocks work in tests
    const desc = TOOL_REGISTRY[tool];
    const gm = desc.paths.globalMemory;
    const rawMemPath = typeof gm === "string"
      ? gm
      : gm === null
        ? null
        : (gm as unknown as Record<string, string>)[process.platform] ?? (gm as unknown as Record<string, string>).linux;
    const memoryPath = rawMemPath ? expandPath(rawMemPath) : null;
    if (!memoryPath) {
      return { success: true, filesWritten: 0 };
    }
    const memoryDir = path.dirname(memoryPath);

    // Ensure target directory exists
    await ensureDir(memoryDir);

    // Write content
    await fs.writeFile(memoryPath, content, "utf-8");

    return { success: true, filesWritten: 1 };
  } catch (error) {
    return {
      success: false,
      filesWritten: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
