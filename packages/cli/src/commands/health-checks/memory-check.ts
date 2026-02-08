/**
 * Memory size/limit checks for doctor command.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { expandPath, pathExists } from "@mycelium/core";
import { MEMORY_LINE_LIMIT } from "../../core/fs-helpers.js";
import type { DiagnosticResult } from "./types.js";

export { MEMORY_LINE_LIMIT };

/**
 * Check if memory files exist
 */
export async function checkMemoryFilesExist(): Promise<DiagnosticResult> {
  const memoryBasePath = expandPath("~/.mycelium/global/memory");
  const exists = await pathExists(memoryBasePath);

  if (!exists) {
    return {
      name: "Memory Files",
      status: "warn",
      message: "Memory directory not found",
      fix: "Run: mycelium init --global",
    };
  }

  try {
    const scopes = ["shared", "coding", "personal"];
    let totalFiles = 0;

    for (const scope of scopes) {
      const scopePath = path.join(memoryBasePath, scope);
      if (await pathExists(scopePath)) {
        const files = await fs.readdir(scopePath);
        const mdFiles = files.filter((f) => f.endsWith(".md"));
        totalFiles += mdFiles.length;
      }
    }

    if (totalFiles === 0) {
      return {
        name: "Memory Files",
        status: "warn",
        message: "No memory files found in any scope",
        fix: "Add .md files to ~/.mycelium/global/memory/{shared,coding,personal}/",
      };
    }

    return {
      name: "Memory Files",
      status: "pass",
      message: `${totalFiles} memory files found`,
    };
  } catch (error) {
    return {
      name: "Memory Files",
      status: "warn",
      message: `Error checking memory files: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Check if a memory file exceeds the line limit for a tool
 */
export async function checkMemoryFileSize(
  filePath: string,
  maxLines: number
): Promise<DiagnosticResult> {
  if (!(await pathExists(filePath))) {
    return {
      name: "Memory File Size",
      status: "pass",
      message: `File not present: ${filePath}`,
    };
  }

  try {
    const content = await fs.readFile(filePath, "utf-8");
    const lineCount = content.split("\n").length;

    if (lineCount > maxLines) {
      return {
        name: "Memory File Size",
        status: "warn",
        message: `${filePath} has ${lineCount} lines (limit: ${maxLines})`,
        fix: "Run: mycelium sync (smart compression will reduce it)",
      };
    }

    return {
      name: "Memory File Size",
      status: "pass",
      message: `${filePath} is within limits (${lineCount}/${maxLines} lines)`,
    };
  } catch (error) {
    return {
      name: "Memory File Size",
      status: "warn",
      message: `Error reading ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
