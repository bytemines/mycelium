import express from "express";
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

  // Serve dashboard static files
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const dashboardDist = path.resolve(__dirname, "..", "..", "dashboard", "dist");

  app.use(express.static(dashboardDist));

  // SPA fallback — non-API routes get index.html
  app.use((req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    const indexPath = path.join(dashboardDist, "index.html");
    res.sendFile(indexPath, (err) => {
      if (err) res.status(404).send("Dashboard not built. Run: pnpm -C packages/dashboard build");
    });
  });

  const server = app.listen(port, () => {
    console.log(`Mycelium dashboard running on http://localhost:${port}`);
  });
  return server;
}
