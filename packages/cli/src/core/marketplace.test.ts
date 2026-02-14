/**
 * Tests for the Marketplace module
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "node:fs/promises";

vi.mock("node:fs/promises");
vi.mock("./marketplace-registry.js", () => ({
  loadMarketplaceRegistry: vi.fn().mockResolvedValue({
    "claude-plugins": { type: "local", enabled: true },
    "mcp-registry": { type: "remote", enabled: true },
    "anthropic-skills": { type: "remote", enabled: true },
  }),
}));
vi.mock("./manifest-state.js", () => {
  let stored: Record<string, any> | null = null;
  return {
    loadStateManifest: vi.fn(async () => stored),
    saveStateManifest: vi.fn(async (_dir: string, manifest: Record<string, any>) => { stored = manifest; }),
    __resetStore: () => { stored = null; },
  };
});
vi.mock("./mcp-registry.js", () => ({
  searchRegistry: vi.fn().mockResolvedValue([
    { name: "test-mcp", command: "test-mcp", description: "A test MCP" },
  ]),
  getRegistryEntry: vi.fn().mockResolvedValue({
    name: "test-mcp",
    command: "test-mcp",
    args: ["--stdio"],
    description: "A test MCP",
  }),
  parseRegistryEntry: vi.fn().mockReturnValue({
    command: "test-mcp",
    args: ["--stdio"],
    enabled: true,
  }),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

import {
  searchMarketplace,
  installFromMarketplace,
  listInstalledPlugins,
} from "./marketplace.js";

const mockFs = vi.mocked(fs);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("searchMarketplace", () => {
  it("searches enabled sources and returns results", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ servers: [{ server: { name: "test-mcp", description: "desc", version: "1.0.0" } }] }),
    });
    mockFs.readFile.mockRejectedValue(new Error("ENOENT"));

    const results = await searchMarketplace("test");
    expect(results.length).toBeGreaterThan(0);
  });

  it("handles source failures gracefully", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));
    mockFs.readFile.mockRejectedValue(new Error("ENOENT"));

    const results = await searchMarketplace("test");
    expect(Array.isArray(results)).toBe(true);
  });

  it("filters empty results for unknown source", async () => {
    const results = await searchMarketplace("test", "nonexistent-source");
    expect(results).toEqual([]);
  });
});

describe("installFromMarketplace", () => {
  it("symlinks claude plugins", async () => {
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.symlink.mockResolvedValue(undefined);

    const result = await installFromMarketplace({
      name: "claude-plugin",
      description: "A Claude plugin",
      source: "claude-plugins",
      type: "skill",
    });
    expect(result.success).toBe(true);
  });

  it("installs from MCP registry", async () => {
    mockFs.appendFile.mockResolvedValue(undefined);

    const result = await installFromMarketplace({
      name: "test-mcp",
      description: "A test MCP",
      source: "mcp-registry",
      type: "mcp",
    });
    expect(result.success).toBe(true);
  });

  it("installs from anthropic-skills", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => "# Skill\nBody",
    });
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.writeFile.mockResolvedValue(undefined);

    const result = await installFromMarketplace({
      name: "canvas-design",
      description: "Canvas design skill",
      source: "anthropic-skills",
      type: "skill",
    });
    expect(result.success).toBe(true);
    expect(result.path).toContain("canvas-design");
  });

});

describe("manifest registration on install", () => {
  it("registers skill in manifest after successful install", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => "# Skill\nBody",
    });
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.writeFile.mockResolvedValue(undefined);
    const { saveStateManifest } = await import("./manifest-state.js");

    await installFromMarketplace({
      name: "canvas-test",
      description: "Anthropic skill",
      source: "anthropic-skills",
      type: "skill",
    });

    expect(saveStateManifest).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        skills: expect.objectContaining({
          "canvas-test": expect.objectContaining({ state: "enabled", source: "anthropic-skills" }),
        }),
      })
    );
  });

  it("registers MCP registry entries with version in manifest", async () => {
    mockFs.appendFile.mockResolvedValue(undefined);
    const { saveStateManifest } = await import("./manifest-state.js");
    vi.mocked(saveStateManifest).mockClear();

    await installFromMarketplace({
      name: "test-mcp",
      description: "A test MCP",
      source: "mcp-registry",
      type: "mcp",
    });

    expect(saveStateManifest).toHaveBeenCalled();
  });
});

describe("dynamic GitHub marketplace", () => {
  it("searches GitHub repo sources not in KNOWN_SEARCHERS", async () => {
    const { loadMarketplaceRegistry } = await import("./marketplace-registry.js");
    vi.mocked(loadMarketplaceRegistry).mockResolvedValueOnce({
      "my-github-mp": {
        type: "remote",
        enabled: true,
        url: "https://github.com/bytemines/sherpai",
      },
    });
    // GitHub tree API response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        tree: [
          { path: "skills/cool-skill/SKILL.md", type: "blob" },
          { path: "agents/helper.md", type: "blob" },
        ],
      }),
    });

    const results = await searchMarketplace("cool");
    // Results are now flat MarketplaceEntry[] after deduplication
    const skillEntry = results.find(e => e.name === "cool-skill");
    expect(skillEntry).toBeDefined();
    expect(skillEntry!.source).toBe("my-github-mp");
    expect(skillEntry!.type).toBe("skill");
  });

  it("installs from dynamic GitHub marketplace", async () => {
    const { loadMarketplaceRegistry } = await import("./marketplace-registry.js");
    vi.mocked(loadMarketplaceRegistry).mockResolvedValueOnce({
      "my-github-mp": {
        type: "remote",
        enabled: true,
        url: "https://github.com/bytemines/sherpai",
      },
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => "# My Skill\n\nContent here",
    });
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.writeFile.mockResolvedValue(undefined);

    const result = await installFromMarketplace({
      name: "my-skill",
      description: "A skill",
      source: "my-github-mp",
      type: "skill",
    });
    expect(result.success).toBe(true);
    expect(result.path).toContain("my-skill");
  });
});

describe("listInstalledPlugins", () => {
  it("reads v2 format installed_plugins.json", async () => {
    const v2Data = {
      version: 2,
      plugins: {
        "sherpai@sherpai-marketplace": [
          { scope: "user", installPath: "/path", version: "1.27.0", installedAt: "2026-01-03T12:00:00Z", lastUpdated: "2026-01-05T12:00:00Z" },
        ],
        "superpowers@superpowers-marketplace": [
          { scope: "user", installPath: "/path2", version: "4.0.3", installedAt: "2026-01-01T00:00:00Z" },
        ],
      },
    };
    mockFs.readFile.mockResolvedValue(JSON.stringify(v2Data));

    const result = await listInstalledPlugins();
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("sherpai");
    expect(result[0].version).toBe("1.27.0");
    expect(result[0].installed).toBe(true);
    expect(result[0].type).toBe("plugin");
    expect(result[0].source).toBe("claude-plugins");
    expect(result[1].name).toBe("superpowers");
  });

  it("returns empty for non-v2 format", async () => {
    const v1Data = [
      { name: "plugin1", description: "Plugin 1", version: "1.0.0" },
    ];
    mockFs.readFile.mockResolvedValue(JSON.stringify(v1Data));

    const result = await listInstalledPlugins();
    expect(result).toHaveLength(0);
  });

  it("returns empty array when file does not exist", async () => {
    mockFs.readFile.mockRejectedValue(new Error("ENOENT"));

    const result = await listInstalledPlugins();
    expect(result).toEqual([]);
  });
});
