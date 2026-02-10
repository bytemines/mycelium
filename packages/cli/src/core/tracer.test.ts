import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("Tracer", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mycelium-tracer-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("createTrace returns a logger with convenience methods", async () => {
    const { Tracer } = await import("./tracer.js");
    const tracer = new Tracer(path.join(tmpDir, "trace.db"));
    const log = tracer.createTrace("sync");

    log.info({ scope: "mcp", op: "write", msg: "wrote entry", tool: "cursor" });
    log.error({ scope: "mcp", op: "write", msg: "failed", tool: "cursor", error: "EACCES" });

    const all = tracer.query({ cmd: "sync" });
    expect(all).toHaveLength(2);
    expect(all[0].traceId).toMatch(/^sync-/);

    tracer.close();
  });

  it("auto-creates snapshot on error", async () => {
    const snapshotDir = path.join(tmpDir, "snapshots");
    const { Tracer } = await import("./tracer.js");
    const tracer = new Tracer(path.join(tmpDir, "trace.db"), { snapshotDir });
    const log = tracer.createTrace("sync");

    log.info({ scope: "config", op: "read", msg: "loaded config" });
    log.error({ scope: "mcp", op: "write", msg: "EACCES", tool: "cursor", error: "permission denied" });

    const snapshots = fs.readdirSync(snapshotDir);
    expect(snapshots.length).toBe(1);
    expect(snapshots[0]).toMatch(/\.jsonl$/);

    const content = fs.readFileSync(path.join(snapshotDir, snapshots[0]), "utf-8");
    const lines = content.trim().split("\n");
    expect(lines.length).toBe(2); // both entries from same trace
    expect(JSON.parse(lines[1]).error).toBe("permission denied");

    tracer.close();
  });

  it("debug level entries are skipped when debugMode is false", async () => {
    const { Tracer } = await import("./tracer.js");
    const tracer = new Tracer(path.join(tmpDir, "trace.db"), { debugMode: false });
    const log = tracer.createTrace("sync");

    log.debug({ scope: "mcp", op: "read", msg: "verbose detail" });
    log.info({ scope: "mcp", op: "write", msg: "normal" });

    const all = tracer.query({});
    expect(all).toHaveLength(1);
    expect(all[0].level).toBe("info");

    tracer.close();
  });
});
