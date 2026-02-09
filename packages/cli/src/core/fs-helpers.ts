/**
 * Shared filesystem helpers used across CLI modules.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { TOOL_REGISTRY } from "@mycelish/core";

export const MYCELIUM_HOME = path.join(os.homedir(), ".mycelium");
export const DEFAULT_PORT = 3378;
export const MEMORY_LINE_LIMIT = 200;

/** Per-tool max line limits for memory files — derived from registry */
export const TOOL_MAX_LINES: Partial<Record<string, number>> = Object.fromEntries(
  Object.values(TOOL_REGISTRY)
    .filter(t => t.memoryMaxLines !== null)
    .map(t => [t.id, t.memoryMaxLines!])
);

export async function readFileIfExists(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return null;
  }
}

export async function mkdirp(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}
