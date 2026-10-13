import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Express, NextFunction, Request, Response } from "express";
import { localRequestGuard } from "./local-request-guard.js";

const { handler, middleware, listen, use } = vi.hoisted(() => ({
  handler: vi.fn(), middleware: [] as any[], listen: vi.fn(), use: vi.fn(),
}));
vi.mock("express", () => ({
  default: Object.assign(() => ({ use, listen }), { json: () => vi.fn(), static: () => vi.fn() }),
}));
vi.mock("node:fs", () => ({ default: { existsSync: () => false } }));
vi.mock("./routes/state.js", () => ({ registerStateRoutes: (app: Express) => app.use(handler) }));
vi.mock("./routes/marketplace.js", () => ({ registerMarketplaceRoutes: vi.fn() }));
vi.mock("./routes/migrate.js", () => ({ registerMigrateRoutes: vi.fn() }));
vi.mock("./routes/sync.js", () => ({ registerSyncRoutes: vi.fn() }));
vi.mock("./routes/plugins.js", () => ({ registerPluginsRoutes: vi.fn() }));
vi.mock("./routes/remove.js", () => ({ registerRemoveRoutes: vi.fn() }));
import { createServer, startServer } from "./server.js";

function request(headers: Record<string, string | undefined>, method = "POST") {
  const req = { get: (name: string) => headers[name], method } as Request;
  const res = {
    setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn(), sendStatus: vi.fn(),
  };
  middleware[0](req, res, handler);
  return res;
}

describe("local server request boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    middleware.length = 0;
    use.mockImplementation(fn => middleware.push(fn));
    createServer();
  });

  it.each([
    {}, { host: "dashboard.example:3378" }, { host: "localhost:9000" },
    { host: "localhost:3378", origin: "https://example.com" },
    { host: "localhost:3378", origin: "null" },
    { host: "localhost:3378", origin: "http://localhost:9000" },
    { host: "localhost:3378", origin: "http://localhost:3378/" },
    { host: "localhost:3378", "sec-fetch-site": "cross-site" },
  ])("rejects invalid requests before handlers: %j", headers => {
    const res = request(headers);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(handler).not.toHaveBeenCalled();
    expect(res.setHeader).not.toHaveBeenCalled();
  });

  it.each(["GET", "POST", "DELETE", "OPTIONS"])("checks the boundary for %s", method => {
    expect(request({ host: "localhost:3378", origin: "https://example.com" }, method).status)
      .toHaveBeenCalledWith(403);
    expect(handler).not.toHaveBeenCalled();
  });

  it.each(["localhost:3378", "127.0.0.1:3378", "[::1]:3378"])("allows Node clients at %s without Origin", host => {
    const res = request({ host });
    expect(handler).toHaveBeenCalledOnce();
    expect(res.setHeader).not.toHaveBeenCalledWith("Access-Control-Allow-Origin", "*");
  });

  it.each(["http://localhost:3378", "http://127.0.0.1:3378", "http://localhost:3377"])("allows dashboard origin %s", origin => {
    const res = request({ host: "localhost:3378", origin });
    expect(handler).toHaveBeenCalledOnce();
    expect(res.setHeader).toHaveBeenCalledWith("Access-Control-Allow-Origin", origin);
    expect(res.setHeader).toHaveBeenCalledWith("X-Frame-Options", "DENY");
  });

  it("preserves the Vite proxy's original Host", () => {
    request({ host: "localhost:3377", origin: "http://localhost:3377" });
    expect(handler).toHaveBeenCalledOnce();
  });

  it("answers only allowed preflights without invoking a handler", () => {
    const res = request({ host: "localhost:3378", origin: "http://localhost:3377" }, "OPTIONS");
    expect(res.sendStatus).toHaveBeenCalledWith(204);
    expect(handler).not.toHaveBeenCalled();
  });

  it("guards static assets and fallback before registration, and binds only IPv4 loopback", () => {
    middleware.length = 0;
    startServer(4000);
    expect(listen).toHaveBeenCalledWith(4000, "127.0.0.1", expect.any(Function));
    const res = request({ host: "example.com:4000" }, "GET");
    expect(res.status).toHaveBeenCalledWith(403);
    expect(handler).not.toHaveBeenCalled();
  });

  it("uses the configured server port, not the default", () => {
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    localRequestGuard(4000)({ get: () => "localhost:3378" } as unknown as Request,
      res as unknown as Response, handler as NextFunction);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
