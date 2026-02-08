/**
 * Watcher Module
 *
 * Watches config directories for changes and triggers auto-sync.
 * Uses Node 20+ fs.watch API with debouncing.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { expandPath } from "@mycelium/core";

const CONFIG_FILE_PATTERNS = [
  "manifest.yaml",
  "mcps.yaml",
  "skills.yaml",
  "memory.yaml",
  ".env.local",
];

/**
 * Get paths that should be watched for config changes.
 */
export function getWatchPaths(projectRoot: string): string[] {
  const globalDir = expandPath("~/.mycelium");
  const projectDir = path.join(projectRoot, ".mycelium");
  return [globalDir, projectDir];
}

/**
 * Determine if a changed filename should trigger a sync.
 */
export function shouldTriggerSync(filename: string): boolean {
  const base = path.basename(filename);
  return CONFIG_FILE_PATTERNS.some((pattern) => base === pattern);
}

/**
 * Start watching config directories and trigger callback on changes.
 * Returns an abort function to stop watching.
 */
export function startWatcher(
  projectRoot: string,
  onSync: () => Promise<void>,
  options: { debounceMs?: number } = {}
): () => void {
  const { debounceMs = 500 } = options;
  const watchPaths = getWatchPaths(projectRoot);
  const abortController = new AbortController();
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const triggerSync = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      onSync().catch((err) => {
        console.error("Watch sync error:", err);
      });
    }, debounceMs);
  };

  for (const watchPath of watchPaths) {
    try {
      fs.watch(
        watchPath,
        { signal: abortController.signal, recursive: true },
        (_eventType, filename) => {
          if (filename && shouldTriggerSync(filename)) {
            triggerSync();
          }
        }
      );
    } catch {
      // Directory may not exist yet — skip silently
    }
  }

  return () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    abortController.abort();
  };
}
