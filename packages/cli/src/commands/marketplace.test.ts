import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../core/marketplace-registry.js", () => ({
  loadMarketplaceRegistry: vi.fn(),
  addMarketplace: vi.fn(),
  removeMarketplace: vi.fn(),
  listPlugins: vi.fn(),
  togglePlugin: vi.fn(),
}));

describe("marketplaceCommand", () => {
  beforeEach(() => {
    vi.resetAllMocks();
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

  it("add subcommand has --url and --type options", async () => {
    const { marketplaceCommand } = await import("./marketplace.js");
    const addCmd = marketplaceCommand.commands.find((c) => c.name() === "add");
    const urlOpt = addCmd?.options.find((o) => o.long === "--url");
    const typeOpt = addCmd?.options.find((o) => o.long === "--type");
    expect(urlOpt).toBeDefined();
    expect(typeOpt).toBeDefined();
  });

  it("plugins subcommand has --marketplace option", async () => {
    const { marketplaceCommand } = await import("./marketplace.js");
    const pluginsCmd = marketplaceCommand.commands.find((c) => c.name() === "plugins");
    const opt = pluginsCmd?.options.find((o) => o.long === "--marketplace");
    expect(opt).toBeDefined();
  });
});
