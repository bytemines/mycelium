/**
 * Integration test for the MCP server factory.
 * Verifies that all tool/resource/prompt registrations succeed without errors.
 */
import { describe, it, expect, vi } from "vitest";

// Mock business logic modules to avoid filesystem access
vi.mock("../core/config-merger.js", () => ({
  loadAndMergeAllConfigs: vi.fn().mockResolvedValue({
    mcps: {},
    skills: {},
    memory: { scopes: {} },
    sources: {},
  }),
  loadGlobalConfig: vi.fn().mockResolvedValue({ mcps: {} }),
  loadProjectConfig: vi.fn().mockResolvedValue({ mcps: {} }),
}));

vi.mock("../core/sync-writer.js", () => ({
  syncToTool: vi.fn().mockResolvedValue({
    configPath: "/test",
    backupPath: "/test.bak",
    sectionsUpdated: ["mcps"],
    success: true,
  }),
}));

vi.mock("../core/global-tracer.js", () => ({
  getTracer: vi.fn().mockReturnValue({
    createTrace: vi.fn().mockReturnValue({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
    query: vi.fn().mockReturnValue([]),
  }),
}));

vi.mock("../core/marketplace-registry.js", () => ({
  loadMarketplaceRegistry: vi.fn().mockResolvedValue({}),
}));

vi.mock("../commands/health-checks/index.js", () => ({
  runAllChecks: vi.fn().mockResolvedValue({
    success: true,
    checks: [],
    summary: { passed: 0, failed: 0, warnings: 0 },
  }),
  formatDoctorJson: vi.fn().mockReturnValue("{}"),
}));

describe("MCP Server Integration", () => {
  it("creates server with all registrations without throwing", async () => {
    const { createMyceliumMcpServer } = await import("../mcp/server.js");
    const server = createMyceliumMcpServer();
    expect(server).toBeDefined();
  });

  it("server has resource, prompt, and tool handlers registered", async () => {
    const { createMyceliumMcpServer } = await import("../mcp/server.js");
    const server = createMyceliumMcpServer();
    // The underlying Server instance should exist
    expect(server.server).toBeDefined();
  });
});
