import { describe, it, expect, vi, beforeEach } from "vitest";

const mockMergedConfig = {
  mcps: {
    "test-mcp": { command: "test-cmd", state: "enabled", tools: ["claude-code"] },
    "global-mcp": { command: "global-cmd", state: "enabled" },
  },
  skills: { "test-skill": { name: "test-skill", state: "enabled" } },
  memory: { scopes: {} },
  sources: { "test-mcp": "global", "global-mcp": "global" },
};

vi.mock("../../core/config-merger.js", () => ({
  loadAndMergeAllConfigs: vi.fn().mockResolvedValue(mockMergedConfig),
}));

const mockSyncResult = {
  configPath: "/test/config.json",
  backupPath: "/test/config.json.bak",
  sectionsUpdated: ["mcps"],
  success: true,
};

vi.mock("../../core/sync-writer.js", () => ({
  syncToTool: vi.fn().mockResolvedValue(mockSyncResult),
}));

const mockDoctorResult = {
  checks: [{ name: "global-dir", status: "pass", message: "ok" }],
  summary: { total: 1, pass: 1, warn: 0, fail: 0 },
};

vi.mock("../../commands/health-checks/index.js", () => ({
  runAllChecks: vi.fn().mockResolvedValue(mockDoctorResult),
  formatDoctorJson: vi.fn().mockReturnValue(JSON.stringify(mockDoctorResult)),
}));

vi.mock("../../core/global-tracer.js", () => ({
  getTracer: vi.fn().mockReturnValue({
    createTrace: vi.fn().mockReturnValue({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  }),
}));

// Helper to call a registered tool handler via the server internals
async function callTool(server: any, name: string, args: Record<string, unknown> = {}) {
  // McpServer stores tools internally; we access via the tool method
  // The SDK's McpServer doesn't expose a public call method, so we test
  // by verifying registration doesn't throw and the handler logic works.
  // We'll test the handlers directly by re-importing and calling the logic.
  return undefined;
}

describe("registerConfigTools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers without throwing", async () => {
    const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
    const { registerConfigTools } = await import("./config-tools.js");

    const server = new McpServer({ name: "test", version: "0.0.1" });
    expect(() => registerConfigTools(server)).not.toThrow();
  });

  it("registers three tools (status, sync, doctor)", async () => {
    const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
    const { registerConfigTools } = await import("./config-tools.js");

    const server = new McpServer({ name: "test", version: "0.0.1" });
    const spy = vi.spyOn(server, "registerTool");
    registerConfigTools(server);

    expect(spy).toHaveBeenCalledTimes(3);
    expect(spy).toHaveBeenCalledWith("mycelium_status", expect.any(Object), expect.any(Function));
    expect(spy).toHaveBeenCalledWith("mycelium_sync", expect.any(Object), expect.any(Function));
    expect(spy).toHaveBeenCalledWith("mycelium_doctor", expect.any(Object), expect.any(Function));
  });
});

describe("mycelium_status handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns full merged config when no tool filter", async () => {
    const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
    const { registerConfigTools } = await import("./config-tools.js");

    const server = new McpServer({ name: "test", version: "0.0.1" });
    const handlers: Record<string, Function> = {};
    (vi.spyOn(server, "registerTool") as any).mockImplementation((name: string, _opts: any, handler: any) => {
      handlers[name] = handler;
    });
    registerConfigTools(server);

    const result = await handlers["mycelium_status"]({ tool: undefined });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.mcps).toEqual(mockMergedConfig.mcps);
    expect(parsed.skills).toEqual(mockMergedConfig.skills);
  });

  it("filters MCPs by tool when tool param provided", async () => {
    const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
    const { registerConfigTools } = await import("./config-tools.js");

    const server = new McpServer({ name: "test", version: "0.0.1" });
    const handlers: Record<string, Function> = {};
    (vi.spyOn(server, "registerTool") as any).mockImplementation((name: string, _opts: any, handler: any) => {
      handlers[name] = handler;
    });
    registerConfigTools(server);

    const result = await handlers["mycelium_status"]({ tool: "claude-code" });
    const parsed = JSON.parse(result.content[0].text);
    // test-mcp has tools: ["claude-code"] so it's included
    // global-mcp has no tools filter so it's also included
    expect(parsed.mcps["test-mcp"]).toBeDefined();
    expect(parsed.mcps["global-mcp"]).toBeDefined();
    expect(parsed.sources).toBeDefined();
    // skills should NOT be in filtered result
    expect(parsed.skills).toBeUndefined();
  });

  it("excludes MCPs with excludeTools matching the filter", async () => {
    const { loadAndMergeAllConfigs } = await import("../../core/config-merger.js");
    vi.mocked(loadAndMergeAllConfigs).mockResolvedValueOnce({
      mcps: {
        "excluded-mcp": { command: "x", excludeTools: ["cursor"] } as any,
        "included-mcp": { command: "y" } as any,
      },
      skills: {},
      memory: { scopes: {} },
      sources: {},
    } as any);

    const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
    const { registerConfigTools } = await import("./config-tools.js");

    const server = new McpServer({ name: "test", version: "0.0.1" });
    const handlers: Record<string, Function> = {};
    (vi.spyOn(server, "registerTool") as any).mockImplementation((name: string, _opts: any, handler: any) => {
      handlers[name] = handler;
    });
    registerConfigTools(server);

    const result = await handlers["mycelium_status"]({ tool: "cursor" });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.mcps["excluded-mcp"]).toBeUndefined();
    expect(parsed.mcps["included-mcp"]).toBeDefined();
  });
});

describe("mycelium_sync handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("syncs all tools when no tool param", async () => {
    const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
    const { registerConfigTools } = await import("./config-tools.js");
    const { syncToTool } = await import("../../core/sync-writer.js");
    const { ALL_TOOL_IDS } = await import("@mycelish/core");

    const server = new McpServer({ name: "test", version: "0.0.1" });
    const handlers: Record<string, Function> = {};
    (vi.spyOn(server, "registerTool") as any).mockImplementation((name: string, _opts: any, handler: any) => {
      handlers[name] = handler;
    });
    registerConfigTools(server);

    const result = await handlers["mycelium_sync"]({ tool: undefined });
    const parsed = JSON.parse(result.content[0].text);

    expect(vi.mocked(syncToTool)).toHaveBeenCalledTimes(ALL_TOOL_IDS.length);
    for (const id of ALL_TOOL_IDS) {
      expect(parsed[id]).toEqual({ success: true });
    }
  });

  it("syncs only specified tool when tool param provided", async () => {
    const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
    const { registerConfigTools } = await import("./config-tools.js");
    const { syncToTool } = await import("../../core/sync-writer.js");

    const server = new McpServer({ name: "test", version: "0.0.1" });
    const handlers: Record<string, Function> = {};
    (vi.spyOn(server, "registerTool") as any).mockImplementation((name: string, _opts: any, handler: any) => {
      handlers[name] = handler;
    });
    registerConfigTools(server);

    const result = await handlers["mycelium_sync"]({ tool: "claude-code" });
    const parsed = JSON.parse(result.content[0].text);

    expect(vi.mocked(syncToTool)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(syncToTool)).toHaveBeenCalledWith("claude-code", expect.any(Object), undefined, expect.any(Object));
    expect(parsed["claude-code"]).toEqual({ success: true });
  });

  it("handles sync errors gracefully", async () => {
    const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
    const { registerConfigTools } = await import("./config-tools.js");
    const { syncToTool } = await import("../../core/sync-writer.js");

    vi.mocked(syncToTool).mockRejectedValueOnce(new Error("write failed"));

    const server = new McpServer({ name: "test", version: "0.0.1" });
    const handlers: Record<string, Function> = {};
    (vi.spyOn(server, "registerTool") as any).mockImplementation((name: string, _opts: any, handler: any) => {
      handlers[name] = handler;
    });
    registerConfigTools(server);

    const result = await handlers["mycelium_sync"]({ tool: "claude-code" });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed["claude-code"]).toEqual({ success: false, error: "write failed" });
  });
});

describe("mycelium_doctor handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns health check results", async () => {
    const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
    const { registerConfigTools } = await import("./config-tools.js");
    const { runAllChecks, formatDoctorJson } = await import("../../commands/health-checks/index.js");

    const server = new McpServer({ name: "test", version: "0.0.1" });
    const handlers: Record<string, Function> = {};
    (vi.spyOn(server, "registerTool") as any).mockImplementation((name: string, _opts: any, handler: any) => {
      handlers[name] = handler;
    });
    registerConfigTools(server);

    const result = await handlers["mycelium_doctor"]({});
    const parsed = JSON.parse(result.content[0].text);

    expect(vi.mocked(runAllChecks)).toHaveBeenCalledOnce();
    expect(vi.mocked(formatDoctorJson)).toHaveBeenCalledWith(mockDoctorResult);
    expect(parsed.summary.pass).toBe(1);
  });
});
