import { describe, it, expect } from "vitest";
import { createLogEntry, type LogEntry, type LogLevel } from "./logger.js";

describe("logger types", () => {
  it("creates a log entry with required fields", () => {
    const entry = createLogEntry({
      traceId: "sync-abc123",
      level: "info",
      cmd: "sync",
      scope: "mcp",
      op: "write",
      msg: "Writing MCP entry",
    });
    expect(entry.ts).toBeTypeOf("number");
    expect(entry.traceId).toBe("sync-abc123");
    expect(entry.level).toBe("info");
    expect(entry.cmd).toBe("sync");
    expect(entry.msg).toBe("Writing MCP entry");
  });

  it("accepts all optional dimensions", () => {
    const entry = createLogEntry({
      traceId: "sync-abc123",
      level: "error",
      cmd: "sync",
      scope: "mcp",
      op: "write",
      msg: "EACCES",
      tool: "cursor",
      item: "postgres-mcp",
      itemType: "mcp",
      state: "enabled",
      source: "manual",
      configLevel: "project",
      phase: "execute",
      method: "file",
      format: "json",
      entryShape: "standard",
      path: "/path/to/settings.json",
      progress: "3/10",
      dur: 28,
      error: "EACCES permission denied",
      project: "my-project",
      data: { extra: true },
    });
    expect(entry.tool).toBe("cursor");
    expect(entry.state).toBe("enabled");
    expect(entry.source).toBe("manual");
    expect(entry.project).toBe("my-project");
    expect(entry.data).toEqual({ extra: true });
  });

  it("generates timestamp automatically", () => {
    const before = Date.now();
    const entry = createLogEntry({
      traceId: "t1",
      level: "info",
      cmd: "sync",
      scope: "config",
      op: "read",
      msg: "test",
    });
    const after = Date.now();
    expect(entry.ts).toBeGreaterThanOrEqual(before);
    expect(entry.ts).toBeLessThanOrEqual(after);
  });
});
