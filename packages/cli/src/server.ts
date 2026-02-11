import express from "express";
import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";

import { registerStateRoutes } from "./routes/state.js";
import { registerMarketplaceRoutes } from "./routes/marketplace.js";
import { registerMigrateRoutes } from "./routes/migrate.js";
import { registerSyncRoutes } from "./routes/sync.js";
import { registerPluginsRoutes } from "./routes/plugins.js";
import { registerRemoveRoutes } from "./routes/remove.js";
import { DEFAULT_PORT } from "./core/fs-helpers.js";

import type { Request, Response, NextFunction, Express } from "express";

export function createServer(port = DEFAULT_PORT): Express {
  const app = express();
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
    next();
  });
  app.use(express.json());

  // Mount route modules
  registerStateRoutes(app);
  registerMarketplaceRoutes(app);
  registerMigrateRoutes(app);
  registerSyncRoutes(app);
  registerPluginsRoutes(app);
  registerRemoveRoutes(app);

  // Error-handling middleware
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    res.status(500).json({ error: err.message });
  });

  return app;
}

export function startServer(port = DEFAULT_PORT) {
  const app = createServer(port);

  // Serve dashboard static files — check bundled location first, then monorepo fallback
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const bundledDashboard = path.resolve(__dirname, "dashboard");
  const monorepoDashboard = path.resolve(__dirname, "..", "..", "dashboard", "dist");

  let dashboardDist: string | null = null;
  if (fs.existsSync(path.join(bundledDashboard, "index.html"))) {
    dashboardDist = bundledDashboard;
  } else if (fs.existsSync(path.join(monorepoDashboard, "index.html"))) {
    dashboardDist = monorepoDashboard;
  }

  if (dashboardDist) {
    app.use(express.static(dashboardDist));
  }

  // SPA fallback — non-API routes get index.html or upgrade notice
  app.use((req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    if (!dashboardDist) {
      res.status(503).send(`<!DOCTYPE html>
<html><head><title>Mycelium</title><style>body{font-family:system-ui;background:#0a0a0a;color:#e5e5e5;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
.c{text-align:center;max-width:480px}.t{font-size:2rem;margin-bottom:1rem}code{background:#1a1a1a;padding:2px 8px;border-radius:4px;font-size:.9rem}</style></head>
<body><div class="c"><div class="t">🍄 Mycelium</div><p>Dashboard not available in this version.</p><p>Upgrade to get the dashboard:</p>
<p><code>npm install -g @mycelish/cli@latest</code></p><p style="color:#888;font-size:.85rem">API is running — tools and sync work fine without the dashboard.</p></div></body></html>`);
      return;
    }
    const indexPath = path.join(dashboardDist, "index.html");
    res.sendFile(indexPath, (err) => {
      if (err) res.status(500).send("Dashboard error");
    });
  });

  const server = app.listen(port, () => {
    console.log(`Mycelium dashboard running on http://localhost:${port}`);
  });
  return server;
}
