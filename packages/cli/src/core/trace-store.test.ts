import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TraceStore } from "./trace-store.js";
import { createLogEntry } from "@mycelish/core";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("TraceStore", () => {
  let store: TraceStore;
  let dbPath: string;

  beforeEach(() => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mycelium-trace-"));
    dbPath = path.join(tmpDir, "trace.db");
    store = new TraceStore(dbPath);
  });

  afterEach(() => {
    store.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  it("inserts and queries a log entry", () => {
    const entry = createLogEntry({
      traceId: "sync-001",
      level: "info",
      cmd: "sync",
      scope: "mcp",
      op: "write",
      msg: "Wrote MCP entry",
      tool: "cursor",
      item: "postgres-mcp",
    });
    store.insert(entry);
    const results = store.query({ tool: "cursor" });
    expect(results).toHaveLength(1);
    expect(results[0].item).toBe("postgres-mcp");
  });

  it("filters by multiple dimensions", () => {
    store.insert(createLogEntry({ traceId: "t1", level: "info", cmd: "sync", scope: "mcp", op: "write", msg: "a", tool: "cursor" }));
    store.insert(createLogEntry({ traceId: "t1", level: "error", cmd: "sync", scope: "mcp", op: "write", msg: "b", tool: "cursor" }));
    store.insert(createLogEntry({ traceId: "t1", level: "info", cmd: "sync", scope: "skill", op: "symlink", msg: "c", tool: "vscode" }));

    const errors = store.query({ tool: "cursor", level: "error" });
    expect(errors).toHaveLength(1);
    expect(errors[0].msg).toBe("b");

    const mcps = store.query({ scope: "mcp" });
    expect(mcps).toHaveLength(2);
  });

  it("filters by traceId", () => {
    store.insert(createLogEntry({ traceId: "t1", level: "info", cmd: "sync", scope: "mcp", op: "write", msg: "a" }));
    store.insert(createLogEntry({ traceId: "t2", level: "info", cmd: "add", scope: "skill", op: "write", msg: "b" }));
    const results = store.query({ traceId: "t1" });
    expect(results).toHaveLength(1);
  });

  it("filters by time range (since)", () => {
    const old = createLogEntry({ traceId: "t1", level: "info", cmd: "sync", scope: "config", op: "read", msg: "old", ts: Date.now() - 7200_000 });
    const recent = createLogEntry({ traceId: "t2", level: "info", cmd: "sync", scope: "config", op: "read", msg: "recent" });
    store.insert(old);
    store.insert(recent);
    const results = store.query({ since: Date.now() - 3600_000 });
    expect(results).toHaveLength(1);
    expect(results[0].msg).toBe("recent");
  });

  it("limits results", () => {
    for (let i = 0; i < 100; i++) {
      store.insert(createLogEntry({ traceId: "t1", level: "info", cmd: "sync", scope: "mcp", op: "write", msg: `entry-${i}` }));
    }
    const results = store.query({ limit: 10 });
    expect(results).toHaveLength(10);
  });

  it("exports to JSONL string", () => {
    store.insert(createLogEntry({ traceId: "t1", level: "error", cmd: "sync", scope: "mcp", op: "write", msg: "fail", tool: "cursor" }));
    const jsonl = store.exportJsonl({ tool: "cursor" });
    const lines = jsonl.trim().split("\n");
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.tool).toBe("cursor");
  });

  it("enforces ring buffer (max rows)", () => {
    const small = new TraceStore(dbPath, { maxRows: 100 });
    for (let i = 0; i < 150; i++) {
      small.insert(createLogEntry({ traceId: "t1", level: "info", cmd: "sync", scope: "mcp", op: "write", msg: `e-${i}` }));
    }
    small.vacuum();
    const all = small.query({});
    expect(all.length).toBeLessThanOrEqual(100);
    small.close();
  });

  it("filters by state and source (manifest v2)", () => {
    store.insert(createLogEntry({ traceId: "t1", level: "info", cmd: "sync", scope: "mcp", op: "filter", msg: "skipped", item: "pg", state: "disabled", source: "superpowers" }));
    store.insert(createLogEntry({ traceId: "t1", level: "info", cmd: "sync", scope: "mcp", op: "write", msg: "wrote", item: "redis", state: "enabled", source: "manual" }));

    const disabled = store.query({ state: "disabled" });
    expect(disabled).toHaveLength(1);
    expect(disabled[0].item).toBe("pg");

    const fromPlugin = store.query({ source: "superpowers" });
    expect(fromPlugin).toHaveLength(1);
  });

  it("filters by project", () => {
    store.insert(createLogEntry({ traceId: "t1", level: "info", cmd: "sync", scope: "config", op: "merge", msg: "a", project: "mycelium" }));
    store.insert(createLogEntry({ traceId: "t2", level: "info", cmd: "sync", scope: "config", op: "merge", msg: "b", project: "other" }));
    const results = store.query({ project: "mycelium" });
    expect(results).toHaveLength(1);
  });
});
