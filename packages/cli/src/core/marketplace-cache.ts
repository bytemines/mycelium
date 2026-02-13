/**
 * Generic marketplace cache — L1 memory + L2 disk with 48h TTL.
 * Cache dir: ~/.mycelium/cache/marketplace/
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { MYCELIUM_HOME, readFileIfExists, mkdirp } from "./fs-helpers.js";
import { getTracer } from "./global-tracer.js";

export interface CacheOptions {
  forceRefresh?: boolean;
}

const DEFAULT_TTL_MS = 48 * 60 * 60 * 1000; // 48 hours

// L1: module-private Map
const l1 = new Map<string, { data: unknown; ts: number }>();

interface DiskEntry<T> {
  key: string;
  cachedAt: string;
  data: T;
}

export function getCacheDir(): string {
  return path.join(MYCELIUM_HOME, "cache", "marketplace");
}

function diskPath(key: string): string {
  return path.join(getCacheDir(), `${key}.json`);
}

export async function cachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  options?: CacheOptions,
): Promise<T> {
  const log = getTracer().createTrace("marketplace");
  const forceRefresh = options?.forceRefresh ?? false;

  // L1 memory hit
  if (!forceRefresh) {
    const cached = l1.get(key);
    if (cached && Date.now() - cached.ts < DEFAULT_TTL_MS) {
      log.debug({ scope: "cache", op: "l1-hit", item: key, msg: `L1 hit: ${key}` });
      return cached.data as T;
    }
  }

  // L2 disk hit
  if (!forceRefresh) {
    const raw = await readFileIfExists(diskPath(key));
    if (raw) {
      try {
        const entry = JSON.parse(raw) as DiskEntry<T>;
        const age = Date.now() - new Date(entry.cachedAt).getTime();
        if (age < DEFAULT_TTL_MS) {
          log.debug({ scope: "cache", op: "l2-hit", item: key, msg: `L2 hit: ${key}` });
          l1.set(key, { data: entry.data, ts: Date.now() });
          return entry.data;
        }
      } catch {
        // corrupt disk entry — treat as miss
      }
    }
  }

  // Fetch from source
  log.debug({ scope: "cache", op: "miss", item: key, msg: `Cache miss: ${key}` });
  try {
    const data = await fetcher();
    // Write L1 + L2
    l1.set(key, { data, ts: Date.now() });
    try {
      await mkdirp(getCacheDir());
      const entry: DiskEntry<T> = { key, cachedAt: new Date().toISOString(), data };
      await fs.writeFile(diskPath(key), JSON.stringify(entry), "utf-8");
    } catch {
      // disk write failure is non-critical
    }
    return data;
  } catch (err) {
    // Stale fallback: L2 disk
    const raw = await readFileIfExists(diskPath(key));
    if (raw) {
      try {
        const entry = JSON.parse(raw) as DiskEntry<T>;
        log.warn({ scope: "cache", op: "stale-l2", item: key, msg: "Falling back to stale disk cache" });
        l1.set(key, { data: entry.data, ts: Date.now() });
        return entry.data;
      } catch {
        // corrupt
      }
    }
    // Stale fallback: L1 memory
    const staleL1 = l1.get(key);
    if (staleL1) {
      log.warn({ scope: "cache", op: "stale-l1", item: key, msg: "Falling back to stale memory cache" });
      return staleL1.data as T;
    }
    throw err;
  }
}

export function clearL1(): void {
  l1.clear();
}

export async function clearAllCaches(): Promise<number> {
  clearL1();
  const dir = getCacheDir();
  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch {
    return 0;
  }
  const jsons = files.filter((f) => f.endsWith(".json"));
  await Promise.all(jsons.map((f) => fs.unlink(path.join(dir, f))));
  return jsons.length;
}

export async function getCacheInfo(): Promise<{ key: string; cachedAt: string }[]> {
  const dir = getCacheDir();
  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }
  const results: { key: string; cachedAt: string }[] = [];
  for (const f of files.filter((f) => f.endsWith(".json"))) {
    const raw = await readFileIfExists(path.join(dir, f));
    if (!raw) continue;
    try {
      const entry = JSON.parse(raw) as DiskEntry<unknown>;
      results.push({ key: entry.key, cachedAt: entry.cachedAt });
    } catch {
      // skip corrupt
    }
  }
  return results;
}
