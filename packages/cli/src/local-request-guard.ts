import type { RequestHandler } from "express";

/** Trust only the local dashboard and its documented Vite development proxy. */
export function localRequestGuard(port: number): RequestHandler {
  const hosts = new Set([port, 3377].flatMap(p =>
    ["localhost", "127.0.0.1", "[::1]"].map(host => `${host}${p === 80 ? "" : `:${p}`}`)));
  const origins = new Set([...hosts].map(host => `http://${host}`));

  return (req, res, next) => {
    const host = req.get("host");
    const origin = req.get("origin");
    if (!host || !hosts.has(host.toLowerCase()) ||
        (origin !== undefined && !origins.has(origin)) ||
        (origin === undefined && req.get("sec-fetch-site") === "cross-site")) {
      res.status(403).json({ error: "Only local dashboard requests are allowed" });
      return;
    }

    // Apply to the dashboard HTML as well as the API; no cross-site embedding/bootstrap.
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Content-Security-Policy", "frame-ancestors 'none'");
    if (origin !== undefined) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    }
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  };
}
