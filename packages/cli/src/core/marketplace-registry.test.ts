/**
 * Tests for the Marketplace Registry module
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

vi.mock("node:fs/promises");

const mockFs = vi.mocked(fs);
const home = os.homedir();

import {
  discoverMarketplaces,
  loadMarketplaceRegistry,
  saveMarketplaceRegistry,
  addMarketplace,
  removeMarketplace,
  listPlugins,
  getPluginDetails,
  togglePlugin,
} from "./marketplace-registry.js";

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================================
// discoverMarketplaces
// ============================================================================

describe("discoverMarketplaces", () => {
  it("discovers marketplaces from installed_plugins.json", async () => {
    const plugins = [
      { name: "plugin-a", marketplace: "acme-store" },
      { name: "plugin-b", marketplace: "acme-store" },
      { name: "plugin-c", marketplace: "other-store" },
    ];
    mockFs.readFile.mockResolvedValue(JSON.stringify(plugins));

    const result = await discoverMarketplaces();
    expect(result["acme-store"]).toBeDefined();
    expect(result["acme-store"].type).toBe("claude-marketplace");
    expect(result["other-store"]).toBeDefined();
    expect(result["claude-plugins"]).toBeDefined();
    expect(result["claude-plugins"].type).toBe("local");
  });

  it("returns empty when no installed_plugins.json", async () => {
    mockFs.readFile.mockRejectedValue(new Error("ENOENT"));
    const result = await discoverMarketplaces();
    expect(Object.keys(result).length).toBe(0);
  });

  it("skips plugins without marketplace field", async () => {
    const plugins = [{ name: "no-mp" }];
    mockFs.readFile.mockResolvedValue(JSON.stringify(plugins));
    const result = await discoverMarketplaces();
    // claude-plugins should exist (since plugins.length > 0) but no named marketplace
    expect(result["claude-plugins"]).toBeDefined();
    expect(Object.keys(result).length).toBe(1);
  });
});

// ============================================================================
// loadMarketplaceRegistry
// ============================================================================

describe("loadMarketplaceRegistry", () => {
  it("returns defaults when no saved config or plugins", async () => {
    mockFs.readFile.mockRejectedValue(new Error("ENOENT"));
    const registry = await loadMarketplaceRegistry();
    expect(registry["openskills"]).toBeDefined();
    expect(registry["mcp-registry"]).toBeDefined();
    expect(registry["anthropic-skills"]).toBeDefined();
    expect(registry["awesome-mcp-servers"]).toBeDefined();
  });

  it("merges saved YAML config with defaults", async () => {
    const yaml = `marketplaces:
  custom-source:
    type: remote
    enabled: true
    url: "https://example.com"
`;
    // First call: registry file, second call: installed_plugins.json (for discover)
    mockFs.readFile.mockImplementation(async (filePath: any) => {
      if (String(filePath).endsWith("marketplaces.yaml")) return yaml;
      throw new Error("ENOENT");
    });

    const registry = await loadMarketplaceRegistry();
    expect(registry["custom-source"]).toBeDefined();
    expect(registry["custom-source"].url).toBe("https://example.com");
    // Defaults still present
    expect(registry["openskills"]).toBeDefined();
  });

  it("merges discovered marketplaces", async () => {
    const plugins = [{ name: "p1", marketplace: "discovered-mp" }];
    mockFs.readFile.mockImplementation(async (filePath: any) => {
      if (String(filePath).endsWith("installed_plugins.json"))
        return JSON.stringify(plugins);
      throw new Error("ENOENT");
    });

    const registry = await loadMarketplaceRegistry();
    expect(registry["discovered-mp"]).toBeDefined();
    expect(registry["discovered-mp"].discovered).toBe(true);
  });
});

// ============================================================================
// saveMarketplaceRegistry
// ============================================================================

describe("saveMarketplaceRegistry", () => {
  it("writes YAML to file", async () => {
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.writeFile.mockResolvedValue(undefined);

    await saveMarketplaceRegistry({
      test: { type: "remote", enabled: true, url: "https://test.com" },
    });

    expect(mockFs.mkdir).toHaveBeenCalled();
    expect(mockFs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining("marketplaces.yaml"),
      expect.stringContaining("test:"),
      "utf-8"
    );
  });
});

// ============================================================================
// addMarketplace / removeMarketplace
// ============================================================================

describe("addMarketplace", () => {
  it("adds and saves", async () => {
    // loadMarketplaceRegistry reads
    mockFs.readFile.mockRejectedValue(new Error("ENOENT"));
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.writeFile.mockResolvedValue(undefined);

    await addMarketplace("new-mp", {
      type: "remote",
      enabled: true,
      url: "https://new.com",
    });

    expect(mockFs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining("marketplaces.yaml"),
      expect.stringContaining("new-mp:"),
      "utf-8"
    );
  });
});

describe("removeMarketplace", () => {
  it("removes and saves", async () => {
    mockFs.readFile.mockRejectedValue(new Error("ENOENT"));
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.writeFile.mockResolvedValue(undefined);

    await removeMarketplace("openskills");

    const written = mockFs.writeFile.mock.calls[0][1] as string;
    expect(written).not.toContain("openskills:");
  });
});

// ============================================================================
// listPlugins
// ============================================================================

describe("listPlugins", () => {
  it("lists plugins from cache directory", async () => {
    mockFs.readdir.mockResolvedValue(["plugin-a", "plugin-b"] as any);
    mockFs.readFile.mockImplementation(async (filePath: any) => {
      const p = String(filePath);
      if (p.includes("plugin-a"))
        return JSON.stringify({
          name: "plugin-a",
          marketplace: "store-1",
          version: "1.0.0",
          description: "Plugin A",
          skills: ["skill-1"],
        });
      if (p.includes("plugin-b"))
        return JSON.stringify({
          name: "plugin-b",
          marketplace: "store-2",
          version: "2.0.0",
          description: "Plugin B",
        });
      throw new Error("ENOENT");
    });

    const plugins = await listPlugins();
    expect(plugins.length).toBe(2);
    expect(plugins[0].name).toBe("plugin-a");
    expect(plugins[0].skills).toEqual(["skill-1"]);
  });

  it("filters by marketplace", async () => {
    mockFs.readdir.mockResolvedValue(["plugin-a", "plugin-b"] as any);
    mockFs.readFile.mockImplementation(async (filePath: any) => {
      const p = String(filePath);
      if (p.includes("plugin-a"))
        return JSON.stringify({ name: "plugin-a", marketplace: "store-1" });
      if (p.includes("plugin-b"))
        return JSON.stringify({ name: "plugin-b", marketplace: "store-2" });
      throw new Error("ENOENT");
    });

    const plugins = await listPlugins("store-1");
    expect(plugins.length).toBe(1);
    expect(plugins[0].name).toBe("plugin-a");
  });

  it("returns empty when no cache dir", async () => {
    mockFs.readdir.mockRejectedValue(new Error("ENOENT"));
    const plugins = await listPlugins();
    expect(plugins).toEqual([]);
  });
});

// ============================================================================
// getPluginDetails
// ============================================================================

describe("getPluginDetails", () => {
  it("returns plugin by name", async () => {
    mockFs.readdir.mockResolvedValue(["my-plugin"] as any);
    mockFs.readFile.mockResolvedValue(
      JSON.stringify({ name: "my-plugin", version: "1.0.0", description: "desc" })
    );

    const details = await getPluginDetails("my-plugin");
    expect(details).not.toBeNull();
    expect(details!.name).toBe("my-plugin");
  });

  it("returns null when not found", async () => {
    mockFs.readdir.mockResolvedValue([] as any);
    const details = await getPluginDetails("nonexistent");
    expect(details).toBeNull();
  });
});

// ============================================================================
// togglePlugin
// ============================================================================

describe("togglePlugin", () => {
  it("writes enabled state to plugins.json", async () => {
    mockFs.readFile.mockRejectedValue(new Error("ENOENT"));
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.writeFile.mockResolvedValue(undefined);

    await togglePlugin("my-plugin", false);

    expect(mockFs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining("plugins.json"),
      expect.stringContaining('"my-plugin"'),
      "utf-8"
    );
    const written = JSON.parse(mockFs.writeFile.mock.calls[0][1] as string);
    expect(written["my-plugin"].enabled).toBe(false);
  });

  it("preserves existing config", async () => {
    mockFs.readFile.mockResolvedValue(
      JSON.stringify({ existing: { enabled: true } })
    );
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.writeFile.mockResolvedValue(undefined);

    await togglePlugin("new-plugin", true);

    const written = JSON.parse(mockFs.writeFile.mock.calls[0][1] as string);
    expect(written["existing"].enabled).toBe(true);
    expect(written["new-plugin"].enabled).toBe(true);
  });
});

