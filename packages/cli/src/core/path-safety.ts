import { lstatSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

/** Validate a name used as a single filesystem component, not a public MCP ID. */
export function assertSafePathComponent(name: string): void {
  if (!name || name === "." || name === ".." || /[\\/\0]/.test(name) || isAbsolute(name)) {
    throw new Error(`Unsafe path component: ${name}`);
  }
}

function existingPath(path: string): string {
  try {
    lstatSync(path);
    return realpathSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    // A dangling symlink is not a safe prospective write destination.
    try { lstatSync(path); } catch (missing) {
      if ((missing as NodeJS.ErrnoException).code !== "ENOENT") throw missing;
      const parent = dirname(path);
      if (parent === path) throw error;
      return resolve(existingPath(parent), relative(parent, path));
    }
    throw error;
  }
}

function contained(root: string, candidate: string): boolean {
  const tail = relative(root, candidate);
  return tail !== ".." && !tail.startsWith(`..${sep}`) && !isAbsolute(tail);
}

/** The root is trusted (and may itself be a symlink); destination parents are not. */
export function assertContainedPath(root: string, candidate: string): void {
  const base = resolve(root);
  const target = resolve(candidate);
  if (!contained(base, target) || !contained(existingPath(base), existingPath(target))) {
    throw new Error(`Path escapes root: ${candidate}`);
  }
}
