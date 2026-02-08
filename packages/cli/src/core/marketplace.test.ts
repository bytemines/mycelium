/**
 * Tests for the Marketplace module
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

vi.mock("node:fs/promises");
vi.mock("./marketplace-registry.js", () => ({
  loadMarketplaceRegistry: vi.fn().mockResolvedValue({
    skillsmp: { type: "remote", enabled: true },
    openskills: { type: "remote", enabled: true },
    "claude-plugins": { type: "local", enabled: true },
    "mcp-registry": { type: "remote", enabled: true },
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
  it("searches all sources by default", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ skills: [{ name: "skill1", description: "desc", author: "a", downloads: 10 }] }),
      text: async () => "",
    });
    // Mock listInstalledPlugins dependency
    mockFs.readFile.mockRejectedValue(new Error("ENOENT"));

    const results = await searchMarketplace("test");
    expect(results.length).toBeGreaterThan(0);
  });

  it("searches single source when specified", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ skills: [{ name: "skill1", description: "desc", author: "a", downloads: 10 }] }),
    });

    const results = await searchMarketplace("test", "skillsmp");
    expect(results.length).toBe(1);
    expect(results[0].source).toBe("skillsmp");
  });

  it("handles source failures gracefully", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));
    mockFs.readFile.mockRejectedValue(new Error("ENOENT"));

    const results = await searchMarketplace("test");
    // Should not throw, but may return empty or partial results
    expect(Array.isArray(results)).toBe(true);
  });
});

describe("installFromMarketplace", () => {
  it("installs from skillsmp", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => "---\nname: test\n---\nBody",
    });
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.writeFile.mockResolvedValue(undefined);

    const result = await installFromMarketplace({
      name: "test-skill",
      description: "desc",
      source: "skillsmp",
      type: "skill",
    });
    expect(result.success).toBe(true);
    expect(result.path).toContain("test-skill");
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

  it("returns error on failure", async () => {
    mockFetch.mockRejectedValue(new Error("Download failed"));

    const result = await installFromMarketplace({
      name: "fail",
      description: "",
      source: "skillsmp",
      type: "skill",
    });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe("listInstalledPlugins", () => {
  it("returns plugins from installed_plugins.json", async () => {
    const plugins = [
      { name: "plugin1", description: "Plugin 1", version: "1.0.0" },
      { name: "plugin2", description: "Plugin 2" },
    ];
    mockFs.readFile.mockResolvedValue(JSON.stringify(plugins));

    const result = await listInstalledPlugins();
    expect(result.length).toBe(2);
    expect(result[0].name).toBe("plugin1");
    expect(result[0].source).toBe("claude-plugins");
    expect(result[0].type).toBe("skill");
  });

  it("returns empty array when file does not exist", async () => {
    mockFs.readFile.mockRejectedValue(new Error("ENOENT"));

    const result = await listInstalledPlugins();
    expect(result).toEqual([]);
  });
});
