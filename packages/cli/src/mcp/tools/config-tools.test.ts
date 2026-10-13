import { describe, it, expect, vi, beforeEach } from "vitest";

const mockMergedConfig = {
  mcps: {
    "test-mcp": { command: "test-cmd", state: "enabled", tools: ["claude-code"] },
    "global-mcp": { command: "global-cmd", state: "enabled" },
  },
  skills: { "test-skill": { name: "test-skill", state: "enabled" } },
  sources: { "test-mcp": "global", "global-mcp": "global" },
};

vi.mock("../../core/config-merger.js", () => ({
  loadAndMergeAllConfigs: vi.fn().mockResolvedValue(mockMergedConfig),
}));

vi.mock("../../core/sync-writer.js", () => ({
  syncToTool: vi.fn(),
}));

vi.mock("../../commands/sync.js", () => ({
  syncAll: vi.fn().mockImplementation(async (_root, tools) => ({
    success: true,
    tools: Object.entries(tools).filter(([, config]) => (config as { enabled: boolean }).enabled)
      .map(([tool]) => ({ tool, status: "synced" })),
    errors: [], warnings: [],
  })),
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
    const { syncAll } = await import("../../commands/sync.js");
    const { ALL_TOOL_IDS } = await import("@mycelish/core");

    const server = new McpServer({ name: "test", version: "0.0.1" });
    const handlers: Record<string, Function> = {};
    (vi.spyOn(server, "registerTool") as any).mockImplementation((name: string, _opts: any, handler: any) => {
      handlers[name] = handler;
    });
    registerConfigTools(server);

    const result = await handlers["mycelium_sync"]({ tool: undefined });
    const parsed = JSON.parse(result.content[0].text);

    expect(syncAll).toHaveBeenCalledOnce();
    expect(syncAll).toHaveBeenCalledWith(process.cwd(), Object.fromEntries(
      ALL_TOOL_IDS.map(id => [id, { enabled: true }]),
    ));
    expect(syncToTool).not.toHaveBeenCalled();
    expect(result.isError).toBe(false);
    for (const id of ALL_TOOL_IDS) {
      expect(parsed[id]).toEqual({ success: true });
    }
  });

  it("syncs only specified tool when tool param provided", async () => {
    const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
    const { registerConfigTools } = await import("./config-tools.js");
    const { syncAll } = await import("../../commands/sync.js");
    const { ALL_TOOL_IDS } = await import("@mycelish/core");

    const server = new McpServer({ name: "test", version: "0.0.1" });
    const handlers: Record<string, Function> = {};
    (vi.spyOn(server, "registerTool") as any).mockImplementation((name: string, _opts: any, handler: any) => {
      handlers[name] = handler;
    });
    registerConfigTools(server);

    const result = await handlers["mycelium_sync"]({ tool: "claude-code" });
    const parsed = JSON.parse(result.content[0].text);

    expect(syncAll).toHaveBeenCalledOnce();
    expect(syncAll).toHaveBeenCalledWith(process.cwd(), Object.fromEntries(
      ALL_TOOL_IDS.map(id => [id, { enabled: id === "claude-code" }]),
    ));
    expect(parsed).toEqual({ "claude-code": { success: true } });
  });

  it("surfaces failed tool results without hiding successful tools", async () => {
    const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
    const { registerConfigTools } = await import("./config-tools.js");
    const { syncAll } = await import("../../commands/sync.js");
    vi.mocked(syncAll).mockResolvedValueOnce({
      success: false,
      tools: [
        { tool: "claude-code", status: "synced", skillsCount: 0, mcpsCount: 0, agentsCount: 0, rulesCount: 0, commandsCount: 0 },
        { tool: "cursor", status: "error", skillsCount: 0, mcpsCount: 0, agentsCount: 0, rulesCount: 0, commandsCount: 0, error: "write failed" },
      ],
      errors: ["cursor: write failed"], warnings: [],
    });
    const server = new McpServer({ name: "test", version: "0.0.1" });
    const handlers: Record<string, Function> = {};
    (vi.spyOn(server, "registerTool") as any).mockImplementation((name: string, _opts: any, handler: any) => {
      handlers[name] = handler;
    });
    registerConfigTools(server);
    const result = await handlers["mycelium_sync"]({});
    expect(JSON.parse(result.content[0].text)).toEqual({
      "claude-code": { success: true }, cursor: { success: false, error: "write failed" },
    });
    expect(result.isError).toBe(true);
  });

  it("rejects unknown tool IDs through SDK validation before syncing", async () => {
    const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
    const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
    const { InMemoryTransport } = await import("@modelcontextprotocol/sdk/inMemory.js");
    const { registerConfigTools } = await import("./config-tools.js");
    const { syncAll } = await import("../../commands/sync.js");
    const server = new McpServer({ name: "test", version: "0.0.1" });
    const client = new Client({ name: "test", version: "0.0.1" });
    registerConfigTools(server);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const result = await client.callTool({ name: "mycelium_sync", arguments: { tool: "unknown-tool" } });
      expect(result.isError).toBe(true);
      expect(syncAll).not.toHaveBeenCalled();
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("handles sync errors gracefully", async () => {
    const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
    const { registerConfigTools } = await import("./config-tools.js");
    const { syncAll } = await import("../../commands/sync.js");
    const { getTracer } = await import("../../core/global-tracer.js");

    vi.mocked(syncAll).mockRejectedValueOnce(new Error("write failed"));

    const server = new McpServer({ name: "test", version: "0.0.1" });
    const handlers: Record<string, Function> = {};
    (vi.spyOn(server, "registerTool") as any).mockImplementation((name: string, _opts: any, handler: any) => {
      handlers[name] = handler;
    });
    registerConfigTools(server);

    const result = await handlers["mycelium_sync"]({ tool: "claude-code" });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed["claude-code"]).toEqual({ success: false, error: "write failed" });
    expect(result.isError).toBe(true);
    expect(getTracer().createTrace("mcp").error).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "mcp", op: "sync", error: "write failed" }),
    );
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
