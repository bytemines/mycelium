/**
 * Utility functions for Mycelium
 */

import * as os from "node:os";
import * as path from "node:path";

/**
 * Expand ~ to home directory in path
 */
export function expandPath(p: string): string {
  if (p.startsWith("~")) {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

/**
 * Contract home directory to ~ in path
 */
export function contractPath(p: string): string {
  const home = os.homedir();
  if (p.startsWith(home)) {
    return "~" + p.slice(home.length);
  }
  return p;
}

/**
 * Get the hostname for machine-specific configs
 */
export function getHostname(): string {
  return os.hostname();
}

/**
 * Get the global mycelium directory path
 */
export function getGlobalMyceliumPath(): string {
  return expandPath("~/.mycelium");
}

/**
 * Get the project mycelium directory path
 */
export function getProjectMyceliumPath(projectRoot: string): string {
  return path.join(projectRoot, ".mycelium");
}

/**
 * Deep merge two objects, with source taking priority
 */
export function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Partial<T>
): T {
  const result = { ...target };

  for (const key in source) {
    const sourceValue = source[key];
    const targetValue = target[key];

    if (
      sourceValue !== undefined &&
      typeof sourceValue === "object" &&
      sourceValue !== null &&
      !Array.isArray(sourceValue) &&
      typeof targetValue === "object" &&
      targetValue !== null &&
      !Array.isArray(targetValue)
    ) {
      result[key] = deepMerge(
        targetValue as Record<string, unknown>,
        sourceValue as Record<string, unknown>
      ) as T[Extract<keyof T, string>];
    } else if (sourceValue !== undefined) {
      result[key] = sourceValue as T[Extract<keyof T, string>];
    }
  }

  return result;
}

/**
 * Resolve environment variables in a string (e.g., ${VAR_NAME})
 */
export function resolveEnvVars(
  str: string,
  env: Record<string, string> = process.env as Record<string, string>
): string {
  return str.replace(/\$\{([^}]+)\}/g, (_, varName) => {
    return env[varName] || "";
  });
}

/**
 * Resolve environment variables in an object recursively
 */
export function resolveEnvVarsInObject<T>(
  obj: T,
  env: Record<string, string> = process.env as Record<string, string>
): T {
  if (typeof obj === "string") {
    return resolveEnvVars(obj, env) as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => resolveEnvVarsInObject(item, env)) as T;
  }

  if (typeof obj === "object" && obj !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = resolveEnvVarsInObject(value, env);
    }
    return result as T;
  }

  return obj;
}

/**
 * Format a sync status for display
 */
export function formatStatus(
  status: "synced" | "pending" | "error" | "disabled"
): string {
  const statusMap = {
    synced: "\u001b[32m\u25CF synced\u001b[0m",
    pending: "\u001b[33m\u25CF pending\u001b[0m",
    error: "\u001b[31m\u25CF error\u001b[0m",
    disabled: "\u001b[90m\u25CB disabled\u001b[0m",
  };
  return statusMap[status];
}

/**
 * Check if a path exists
 */
export async function pathExists(p: string): Promise<boolean> {
  const fs = await import("node:fs/promises");
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure a directory exists, creating it if necessary
 */
export async function ensureDir(dirPath: string): Promise<void> {
  const fs = await import("node:fs/promises");
  await fs.mkdir(dirPath, { recursive: true });
}
