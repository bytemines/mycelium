/**
 * Shared filesystem helpers used across CLI modules.
 */
import * as fs from "node:fs/promises";

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
