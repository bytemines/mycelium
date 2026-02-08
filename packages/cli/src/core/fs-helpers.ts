/**
 * Shared filesystem helpers used across CLI modules.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

export const MYCELIUM_HOME = path.join(os.homedir(), ".mycelium");
export const DEFAULT_PORT = 3378;
export const MEMORY_LINE_LIMIT = 200;

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
