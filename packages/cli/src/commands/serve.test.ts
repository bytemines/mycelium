import { describe, it, expect, vi, beforeEach } from "vitest";

const mockExecFileSync = vi.fn();
const mockStartServer = vi.fn().mockReturnValue({ close: vi.fn() });

vi.mock("node:child_process", () => ({
  execFileSync: mockExecFileSync,
}));

vi.mock("../server.js", () => ({
  startServer: mockStartServer,
}));

vi.mock("../core/fs-helpers.js", () => ({
  DEFAULT_PORT: 3378,
}));

describe("serveCommand", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
    mockStartServer.mockReturnValue({ close: vi.fn() });
  });

  it("exports a Command named 'serve'", async () => {
    const { serveCommand } = await import("./serve.js");
    expect(serveCommand.name()).toBe("serve");
  });

  it("has --port and --build options", async () => {
    const { serveCommand } = await import("./serve.js");
    const portOpt = serveCommand.options.find((o) => o.long === "--port");
    const buildOpt = serveCommand.options.find((o) => o.long === "--build");
    expect(portOpt).toBeDefined();
    expect(buildOpt).toBeDefined();
  });

  it("starts server on default port without building by default", async () => {
    const { serveCommand } = await import("./serve.js");
    await serveCommand.parseAsync([], { from: "user" });

    expect(mockExecFileSync).not.toHaveBeenCalled();
    expect(mockStartServer).toHaveBeenCalledWith(3378);
  });

  it("runs build when --build is passed", async () => {
    const { serveCommand } = await import("./serve.js");
    await serveCommand.parseAsync(["--build"], { from: "user" });

    expect(mockExecFileSync).toHaveBeenCalledWith(
      "pnpm",
      ["run", "build"],
      expect.objectContaining({ stdio: "inherit" }),
    );
    expect(mockStartServer).toHaveBeenCalledWith(3378);
  });

  it("uses custom port when --port is specified", async () => {
    const { serveCommand } = await import("./serve.js");
    await serveCommand.parseAsync(["--port", "4000"], { from: "user" });

    expect(mockStartServer).toHaveBeenCalledWith(4000);
  });

  it("starts server even if build fails", async () => {
    mockExecFileSync.mockImplementation(() => { throw new Error("build failed"); });
    const { serveCommand } = await import("./serve.js");
    await serveCommand.parseAsync(["--build"], { from: "user" });

    expect(mockStartServer).toHaveBeenCalledWith(3378);
  });
});

describe("createServer (from server.ts)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
  });

  it("returns an Express app with listen and use methods", async () => {
    vi.doUnmock("../server.js");
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
