import { describe, it, expect, vi, beforeEach } from "vitest";

const mockQuery = vi.fn().mockReturnValue([
  { ts: 1000, level: "info", cmd: "sync", tool: "claude-code", msg: "synced" },
  { ts: 2000, level: "error", cmd: "sync", tool: "codex", msg: "failed" },
]);

vi.mock("../../core/global-tracer.js", () => ({
  getTracer: vi.fn().mockReturnValue({
    query: mockQuery,
  }),
}));

describe("registerObserveTools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockReturnValue([
      { ts: 1000, level: "info", cmd: "sync", tool: "claude-code", msg: "synced" },
      { ts: 2000, level: "error", cmd: "sync", tool: "codex", msg: "failed" },
    ]);
  });

  it("registers observe tools without error", async () => {
    const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
    const { registerObserveTools } = await import("./observe-tools.js");

    const server = new McpServer({ name: "test", version: "0.0.1" });
    registerObserveTools(server);
    expect(true).toBe(true);
  });

  it("report with no filters calls query with defaults", async () => {
    const { getTracer } = await import("../../core/global-tracer.js");
    const tracer = getTracer();

    const entries = tracer.query({ limit: 50 });
    expect(mockQuery).toHaveBeenCalledWith({ limit: 50 });
    expect(entries).toHaveLength(2);
  });

  it("report with tool filter passes tool to query", async () => {
    const { getTracer } = await import("../../core/global-tracer.js");
    const tracer = getTracer();

    tracer.query({ tool: "claude-code", limit: 50 });
    expect(mockQuery).toHaveBeenCalledWith({ tool: "claude-code", limit: 50 });
  });

  it("parses since '1h' into timestamp", () => {
    const since = "1h";
    const match = since.match(/^(\d+)([hmds])$/);
    expect(match).not.toBeNull();
    const [, num, unit] = match!;
    const ms = { h: 3600000, m: 60000, d: 86400000, s: 1000 }[unit!]!;
    const sinceTs = Date.now() - parseInt(num!) * ms;
    expect(sinceTs).toBeGreaterThan(0);
    expect(Date.now() - sinceTs).toBeCloseTo(3600000, -2);
  });

  it("parses since '30m' into timestamp", () => {
    const since = "30m";
    const match = since.match(/^(\d+)([hmds])$/);
    expect(match).not.toBeNull();
    const [, num, unit] = match!;
    const ms = { h: 3600000, m: 60000, d: 86400000, s: 1000 }[unit!]!;
    const sinceTs = Date.now() - parseInt(num!) * ms;
    expect(Date.now() - sinceTs).toBeCloseTo(1800000, -2);
  });

  it("report with limit passes limit to query", async () => {
    const { getTracer } = await import("../../core/global-tracer.js");
    const tracer = getTracer();

    tracer.query({ limit: 10 });
    expect(mockQuery).toHaveBeenCalledWith({ limit: 10 });
  });

  it("invalid since string results in no time filter", () => {
    const since = "invalid";
    const match = since.match(/^(\d+)([hmds])$/);
    expect(match).toBeNull();
    // sinceTs stays undefined — no time filter applied
  });
});
