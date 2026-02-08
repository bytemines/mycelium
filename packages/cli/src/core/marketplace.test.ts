/**
 * Tests for the Marketplace module
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "node:fs/promises";

vi.mock("node:fs/promises");
vi.mock("./marketplace-registry.js", () => ({
  loadMarketplaceRegistry: vi.fn().mockResolvedValue({
    skillsmp: { type: "remote", enabled: true },
    openskills: { type: "remote", enabled: true },
    "claude-plugins": { type: "local", enabled: true },
    "mcp-registry": { type: "remote", enabled: true },
    "anthropic-skills": { type: "remote", enabled: true },
    clawhub: { type: "remote", enabled: true },
  }),
}));
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
    // npm search for openskills
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ objects: [{ package: { name: "openskills", description: "desc", version: "1.0.0" } }] }),
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

  it("filters empty results", async () => {
    // SkillsMP returns empty (no API key)
    const results = await searchMarketplace("test", "skillsmp");
    expect(results).toEqual([]);
  });
});

describe("installFromMarketplace", () => {
  it("returns error for skillsmp (no API key)", async () => {
    const result = await installFromMarketplace({
      name: "test-skill",
      description: "desc",
      source: "skillsmp",
      type: "skill",
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("API key");
  });

  it("installs from openskills", async () => {
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.writeFile.mockResolvedValue(undefined);

    const result = await installFromMarketplace({
      name: "openskill-test",
      description: "Open skill",
      source: "openskills",
      type: "skill",
    });
    expect(result.success).toBe(true);
  });

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

  it("installs from clawhub", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => "# Skill content",
    });
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.writeFile.mockResolvedValue(undefined);

    const result = await installFromMarketplace({
      name: "git-workflows",
      description: "Git workflows",
      source: "clawhub",
      type: "skill",
    });
    expect(result.success).toBe(true);
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

  it("reads v1 format (plain array) as fallback", async () => {
    const v1Data = [
      { name: "plugin1", description: "Plugin 1", version: "1.0.0" },
    ];
    mockFs.readFile.mockResolvedValue(JSON.stringify(v1Data));

    const result = await listInstalledPlugins();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("plugin1");
    expect(result[0].type).toBe("plugin");
  });

  it("returns empty array when file does not exist", async () => {
    mockFs.readFile.mockRejectedValue(new Error("ENOENT"));

    const result = await listInstalledPlugins();
    expect(result).toEqual([]);
  });
});
