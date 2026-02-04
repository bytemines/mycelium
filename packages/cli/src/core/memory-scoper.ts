/**
 * Memory Scoper Module
 * Manages memory file syncing across AI tools with privacy scopes
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  type ToolId,
  type MemoryScope,
  SUPPORTED_TOOLS,
  expandPath,
  pathExists,
  ensureDir,
} from "@mycelium/core";

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
    syncTo: ["claude-code", "codex", "gemini-cli", "opencode", "openclaw", "aider"],
    path: "global/memory/shared/",
  },
  coding: {
    syncTo: ["claude-code", "codex", "gemini-cli", "opencode", "aider"],
    excludeFrom: ["openclaw"],
    path: "global/memory/coding/",
  },
  personal: {
    syncTo: ["openclaw"],
    excludeFrom: ["claude-code", "codex", "gemini-cli", "opencode", "aider"],
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
export async function syncMemoryToTool(tool: ToolId): Promise<SyncResult> {
  try {
    const scopes = getScopesForTool(tool);
    const sections: string[] = [];

    for (const scope of scopes) {
      const files = await loadMemoryFiles(scope);

      if (files.length > 0) {
        sections.push(`<!-- SCOPE: ${scope} -->`);
        for (const file of files) {
          if (file.content) {
            sections.push(file.content);
          }
        }
      }
    }

    // No files to write
    if (sections.length === 0) {
      return { success: true, filesWritten: 0 };
    }

    // Get tool's memory path
    const toolConfig = SUPPORTED_TOOLS[tool];
    const memoryPath = expandPath(toolConfig.memoryPath);
    const memoryDir = path.dirname(memoryPath);

    // Ensure target directory exists
    await ensureDir(memoryDir);

    // Write concatenated content
    const content = sections.join("\n\n");
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
