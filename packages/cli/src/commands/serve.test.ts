import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

vi.mock("../server.js", () => ({
  startServer: vi.fn().mockReturnValue({ close: vi.fn() }),
}));

vi.mock("../core/fs-helpers.js", () => ({
  DEFAULT_PORT: 3378,
}));

describe("serveCommand", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("exports a Command named 'serve'", async () => {
    const { serveCommand } = await import("./serve.js");
    expect(serveCommand.name()).toBe("serve");
  });

  it("has --port option", async () => {
    const { serveCommand } = await import("./serve.js");
    const portOpt = serveCommand.options.find((o) => o.long === "--port");
    expect(portOpt).toBeDefined();
  });

  it("has --no-build option", async () => {
    const { serveCommand } = await import("./serve.js");
    const buildOpt = serveCommand.options.find((o) => o.long === "--no-build");
    expect(buildOpt).toBeDefined();
  });
});

describe("createServer (from server.ts)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns an Express app with middleware", async () => {
    // Unmock server.ts for this test
    vi.doUnmock("../server.js");

    // We need to mock the route registrations
    vi.mock("../routes/state.js", () => ({ registerStateRoutes: vi.fn() }));
    vi.mock("../routes/marketplace.js", () => ({ registerMarketplaceRoutes: vi.fn() }));
    vi.mock("../routes/migrate.js", () => ({ registerMigrateRoutes: vi.fn() }));
    vi.mock("../routes/sync.js", () => ({ registerSyncRoutes: vi.fn() }));
    vi.mock("../routes/plugins.js", () => ({ registerPluginsRoutes: vi.fn() }));
    vi.mock("../routes/remove.js", () => ({ registerRemoveRoutes: vi.fn() }));

    const { createServer } = await import("../server.js");
    const app = createServer();

    expect(app).toBeDefined();
    expect(typeof app.listen).toBe("function");
    expect(typeof app.use).toBe("function");
  });
});
