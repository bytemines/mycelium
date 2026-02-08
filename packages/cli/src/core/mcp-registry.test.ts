import { describe, it, expect, vi, afterEach } from "vitest";
import { searchRegistry, parseRegistryEntry, getRegistryEntry } from "./mcp-registry.js";

describe("mcp-registry", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses a registry entry into McpServerConfig", () => {
    const entry = {
      name: "git-mcp",
      command: "npx",
      args: ["-y", "@anthropics/git-mcp"],
      description: "Git operations MCP server",
    };
    const config = parseRegistryEntry(entry);
    expect(config.command).toBe("npx");
    expect(config.args).toEqual(["-y", "@anthropics/git-mcp"]);
    expect(config.enabled).toBe(true);
  });

  it("parses a registry entry with env vars", () => {
    const entry = {
      name: "db-mcp",
      command: "npx",
      args: ["-y", "@db/mcp"],
      env: { DATABASE_URL: "postgres://localhost" },
    };
    const config = parseRegistryEntry(entry);
    expect(config.env).toEqual({ DATABASE_URL: "postgres://localhost" });
  });

  it("searchRegistry returns results matching query", async () => {
    const mockResults = [
      { name: "git-mcp", description: "Git operations" },
      { name: "github-mcp", description: "GitHub API" },
    ];
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResults),
    });

    const results = await searchRegistry("git");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name).toContain("git");
  });

  it("searchRegistry throws on failed response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      statusText: "Not Found",
    });

    await expect(searchRegistry("nonexistent")).rejects.toThrow("Registry search failed");
  });

  it("getRegistryEntry returns entry for valid name", async () => {
    const mockEntry = { name: "git-mcp", command: "npx", args: ["-y", "git-mcp"] };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockEntry),
    });

    const entry = await getRegistryEntry("git-mcp");
    expect(entry).not.toBeNull();
    expect(entry!.name).toBe("git-mcp");
  });

  it("getRegistryEntry returns null for missing entry", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
    });

    const entry = await getRegistryEntry("nonexistent");
    expect(entry).toBeNull();
  });
});
