import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:fs/promises");
vi.mock("./fs-helpers.js", () => ({
  MYCELIUM_HOME: "/mock/.mycelium",
  readFileIfExists: vi.fn(),
  mkdirp: vi.fn(),
}));
vi.mock("./global-tracer.js", () => ({
  getTracer: () => ({
    createTrace: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  }),
}));

import * as fs from "node:fs/promises";
import { readFileIfExists, mkdirp } from "./fs-helpers.js";
import { cachedFetch, clearAllCaches, clearL1, getCacheInfo } from "./marketplace-cache.js";

beforeEach(() => {
  vi.clearAllMocks();
  clearL1();
});

describe("cachedFetch", () => {
  it("calls fetcher on cache miss and returns result", async () => {
    vi.mocked(readFileIfExists).mockResolvedValue(null);
    vi.mocked(mkdirp).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const fetcher = vi.fn().mockResolvedValue([1, 2, 3]);
    const result = await cachedFetch("test-key", fetcher);

    expect(result).toEqual([1, 2, 3]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("returns L1 hit without calling fetcher", async () => {
    vi.mocked(readFileIfExists).mockResolvedValue(null);
    vi.mocked(mkdirp).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const fetcher = vi.fn().mockResolvedValue("data");
    await cachedFetch("l1-key", fetcher);
    fetcher.mockClear();

    const result = await cachedFetch("l1-key", fetcher);
    expect(result).toBe("data");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("returns L2 disk hit after L1 clear", async () => {
    const diskEntry = { key: "l2-key", cachedAt: new Date().toISOString(), data: { hello: "world" } };
    vi.mocked(readFileIfExists).mockResolvedValue(JSON.stringify(diskEntry));

    const fetcher = vi.fn().mockResolvedValue("fresh");
    const result = await cachedFetch("l2-key", fetcher);
    expect(result).toEqual({ hello: "world" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("falls back to stale L2 on fetcher error", async () => {
    const diskEntry = { key: "stale-key", cachedAt: "2020-01-01T00:00:00Z", data: "stale-data" };
    // First readFileIfExists: L2 check (expired), second: stale fallback
    vi.mocked(readFileIfExists)
      .mockResolvedValueOnce(JSON.stringify(diskEntry))  // L2 check — expired
      .mockResolvedValueOnce(JSON.stringify(diskEntry));  // stale fallback

    const fetcher = vi.fn().mockRejectedValue(new Error("network down"));
    const result = await cachedFetch("stale-key", fetcher);
    expect(result).toBe("stale-data");
  });

  it("forceRefresh bypasses both caches", async () => {
    vi.mocked(readFileIfExists).mockResolvedValue(null);
    vi.mocked(mkdirp).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const fetcher = vi.fn().mockResolvedValue("v1");
    await cachedFetch("fr-key", fetcher);
    fetcher.mockClear();
    fetcher.mockResolvedValue("v2");

    const result = await cachedFetch("fr-key", fetcher, { forceRefresh: true });
    expect(result).toBe("v2");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("falls back to stale L1 when L2 unavailable", async () => {
    vi.mocked(readFileIfExists).mockResolvedValue(null);
    vi.mocked(mkdirp).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    // Populate L1 with data
    const fetcher = vi.fn().mockResolvedValue("original");
    await cachedFetch("stale-l1-key", fetcher);
    clearL1(); // expire L1 by clearing and re-inserting with old timestamp
    // Manually re-seed L1 as stale (we can't control ts, but the fallback path reads l1 regardless of ts)
    // Instead: populate L1, then force a fetch that fails — L2 returns null, L1 has data
    // Reset and use a fresh approach:
    vi.clearAllMocks();
    vi.mocked(readFileIfExists).mockResolvedValue(null); // no L2
    vi.mocked(mkdirp).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    // First call succeeds, populates L1
    fetcher.mockResolvedValueOnce("cached-value");
    await cachedFetch("stale-l1-only", fetcher);

    // Second call with forceRefresh + fetcher error — should fall back to L1
    fetcher.mockRejectedValueOnce(new Error("network down"));
    const result = await cachedFetch("stale-l1-only", fetcher, { forceRefresh: true });
    expect(result).toBe("cached-value");
  });

  it("rethrows when no stale fallback available", async () => {
    vi.mocked(readFileIfExists).mockResolvedValue(null);
    const fetcher = vi.fn().mockRejectedValue(new Error("fail"));
    await expect(cachedFetch("no-fallback", fetcher)).rejects.toThrow("fail");
  });
});

describe("clearAllCaches", () => {
  it("removes disk files and clears L1", async () => {
    vi.mocked(fs.readdir).mockResolvedValue(["a.json", "b.json", "readme.txt"] as any);
    vi.mocked(fs.unlink).mockResolvedValue(undefined);
    const count = await clearAllCaches();
    expect(count).toBe(2);
    expect(fs.unlink).toHaveBeenCalledTimes(2);
  });

  it("handles missing dir", async () => {
    vi.mocked(fs.readdir).mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
    expect(await clearAllCaches()).toBe(0);
  });
});

describe("getCacheInfo", () => {
  it("returns metadata for cached entries", async () => {
    const entry = { key: "github-anthropics-skills", cachedAt: "2026-01-01T00:00:00Z", data: [] };
    vi.mocked(fs.readdir).mockResolvedValue(["github-anthropics-skills.json"] as any);
    vi.mocked(readFileIfExists).mockResolvedValue(JSON.stringify(entry));
    const info = await getCacheInfo();
    expect(info).toEqual([{ key: "github-anthropics-skills", cachedAt: "2026-01-01T00:00:00Z" }]);
  });
});
