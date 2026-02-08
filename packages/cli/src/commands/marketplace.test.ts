import { describe, it, expect, vi, beforeEach } from "vitest";

const mockLoadRegistry = vi.fn();
const mockAddMarketplace = vi.fn();
const mockRemoveMarketplace = vi.fn();
const mockListPlugins = vi.fn();
const mockTogglePlugin = vi.fn();

vi.mock("../core/marketplace-registry.js", () => ({
  loadMarketplaceRegistry: mockLoadRegistry,
  addMarketplace: mockAddMarketplace,
  removeMarketplace: mockRemoveMarketplace,
  listPlugins: mockListPlugins,
  togglePlugin: mockTogglePlugin,
}));

describe("marketplaceCommand", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
    mockLoadRegistry.mockResolvedValue({});
    mockListPlugins.mockResolvedValue([]);
  });

  it("exports a Command named 'marketplace'", async () => {
    const { marketplaceCommand } = await import("./marketplace.js");
    expect(marketplaceCommand.name()).toBe("marketplace");
  });

  it("has list, add, remove, plugins, enable, disable subcommands", async () => {
    const { marketplaceCommand } = await import("./marketplace.js");
    const names = marketplaceCommand.commands.map((c) => c.name());
    expect(names).toContain("list");
    expect(names).toContain("add");
    expect(names).toContain("remove");
    expect(names).toContain("plugins");
    expect(names).toContain("enable");
    expect(names).toContain("disable");
  });

  it("list calls loadMarketplaceRegistry", async () => {
    mockLoadRegistry.mockResolvedValue({
      "test-mp": { type: "remote", enabled: true, url: "https://example.com" },
    });
    const { marketplaceCommand } = await import("./marketplace.js");
    await marketplaceCommand.parseAsync(["list"], { from: "user" });

    expect(mockLoadRegistry).toHaveBeenCalled();
  });

  it("add calls addMarketplace with name and config", async () => {
    const { marketplaceCommand } = await import("./marketplace.js");
    await marketplaceCommand.parseAsync(
      ["add", "my-mp", "--url", "https://example.com"],
      { from: "user" },
    );

    expect(mockAddMarketplace).toHaveBeenCalledWith("my-mp", {
      type: "remote",
      enabled: true,
      url: "https://example.com",
    });
  });

  it("remove calls removeMarketplace with name", async () => {
    const { marketplaceCommand } = await import("./marketplace.js");
    await marketplaceCommand.parseAsync(["remove", "old-mp"], { from: "user" });

    expect(mockRemoveMarketplace).toHaveBeenCalledWith("old-mp");
  });

  it("plugins calls listPlugins", async () => {
    const { marketplaceCommand } = await import("./marketplace.js");
    await marketplaceCommand.parseAsync(["plugins"], { from: "user" });

    expect(mockListPlugins).toHaveBeenCalledWith(undefined);
  });

  it("plugins --marketplace filters by marketplace", async () => {
    const { marketplaceCommand } = await import("./marketplace.js");
    await marketplaceCommand.parseAsync(
      ["plugins", "--marketplace", "my-mp"],
      { from: "user" },
    );

    expect(mockListPlugins).toHaveBeenCalledWith("my-mp");
  });

  it("enable calls togglePlugin with true", async () => {
    const { marketplaceCommand } = await import("./marketplace.js");
    await marketplaceCommand.parseAsync(["enable", "my-plugin"], { from: "user" });

    expect(mockTogglePlugin).toHaveBeenCalledWith("my-plugin", true);
  });

  it("disable calls togglePlugin with false", async () => {
    const { marketplaceCommand } = await import("./marketplace.js");
    await marketplaceCommand.parseAsync(["disable", "my-plugin"], { from: "user" });

    expect(mockTogglePlugin).toHaveBeenCalledWith("my-plugin", false);
  });
});
