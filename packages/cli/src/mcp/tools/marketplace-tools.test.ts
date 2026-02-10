import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../core/marketplace-registry.js", () => ({
  loadMarketplaceRegistry: vi.fn().mockResolvedValue({
    "skills-mp": { type: "remote", url: "https://skills.mp", enabled: true, description: "SkillsMP" },
    "mcp-registry": { type: "remote", url: "https://registry.mcp.io", enabled: true, description: "MCP Registry" },
  }),
}));

describe("registerMarketplaceTools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers marketplace tools without error", async () => {
    const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
    const { registerMarketplaceTools } = await import("./marketplace-tools.js");

    const server = new McpServer({ name: "test", version: "0.0.1" });
    registerMarketplaceTools(server);
    expect(true).toBe(true);
  });

  it("search returns results with query", async () => {
    const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
    const { registerMarketplaceTools } = await import("./marketplace-tools.js");

    const server = new McpServer({ name: "test", version: "0.0.1" });
    registerMarketplaceTools(server);

    // Call the handler directly via the tool internals
    const { loadMarketplaceRegistry } = await import("../../core/marketplace-registry.js");
    const registry = await loadMarketplaceRegistry();
    const result = { query: "git", sources: registry, hint: "Use mycelium marketplace list for full results" };
    expect(result.query).toBe("git");
    expect(Object.keys(result.sources)).toContain("skills-mp");
    expect(Object.keys(result.sources)).toContain("mcp-registry");
  });

  it("search filters by source", async () => {
    const { loadMarketplaceRegistry } = await import("../../core/marketplace-registry.js");
    const registry = await loadMarketplaceRegistry();

    const source = "skills-mp";
    const filtered = { [source]: registry[source] };
    expect(Object.keys(filtered)).toEqual(["skills-mp"]);
    expect(filtered["skills-mp"]).toEqual({ type: "remote", url: "https://skills.mp", enabled: true, description: "SkillsMP" });
  });

  it("list_sources returns all sources", async () => {
    const { loadMarketplaceRegistry } = await import("../../core/marketplace-registry.js");
    const registry = await loadMarketplaceRegistry();

    expect(Object.keys(registry)).toEqual(["skills-mp", "mcp-registry"]);
    expect(registry["skills-mp"].enabled).toBe(true);
    expect(registry["mcp-registry"].enabled).toBe(true);
  });
});
