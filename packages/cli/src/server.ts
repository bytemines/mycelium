import express from "express";
import cors from "cors";

import { scanAllTools } from "./core/migrator.js";
import { executeMigration, clearMigration } from "./core/migrator.js";
import { searchMarketplace, installFromMarketplace, getPopularSkills, updateSkill } from "./core/marketplace.js";
import {
  loadMarketplaceRegistry,
  addMarketplace,
  removeMarketplace,
  listPlugins,
  togglePlugin,
  toggleSkillInPlugin,
} from "./core/marketplace-registry.js";

import type { MigrationPlan, MarketplaceConfig, MarketplaceSource, MarketplaceEntry } from "@mycelium/core";
import type { Express } from "express";

export function createServer(port = 3378): Express {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // GET /api/state
  app.get("/api/state", async (_req, res) => {
    try {
      res.json({ tools: [], skills: [], mcps: [], memory: [] });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // POST /api/toggle
  app.post("/api/toggle", async (req, res) => {
    try {
      res.json({ success: true, action: req.body });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // GET /api/migrate/scan
  app.get("/api/migrate/scan", async (_req, res) => {
    try {
      const results = await scanAllTools();
      res.json(results);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // POST /api/migrate/apply
  app.post("/api/migrate/apply", async (req, res) => {
    try {
      const plan = req.body as MigrationPlan;
      const result = await executeMigration(plan);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // POST /api/migrate/clear
  app.post("/api/migrate/clear", async (req, res) => {
    try {
      const toolId = req.query.tool as string | undefined;
      const result = await clearMigration(toolId ? { toolId: toolId as any } : undefined);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // GET /api/marketplace/search
  app.get("/api/marketplace/search", async (req, res) => {
    try {
      const query = (req.query.q as string) || "";
      const source = req.query.source as string | undefined;
      const results = await searchMarketplace(query, source as MarketplaceSource | undefined);
      res.json(results);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // POST /api/marketplace/install
  app.post("/api/marketplace/install", async (req, res) => {
    try {
      const entry = req.body as MarketplaceEntry;
      await installFromMarketplace(entry);
      res.json({ success: true });
    } catch (e) {
      res.json({ success: false, error: (e as Error).message });
    }
  });

  // GET /api/marketplace/registry
  app.get("/api/marketplace/registry", async (_req, res) => {
    try {
      const registry = await loadMarketplaceRegistry();
      res.json(registry);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // POST /api/marketplace/registry
  app.post("/api/marketplace/registry", async (req, res) => {
    try {
      const { name, ...config } = req.body as { name: string } & MarketplaceConfig;
      await addMarketplace(name, config);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // DELETE /api/marketplace/registry/:name
  app.delete("/api/marketplace/registry/:name", async (req, res) => {
    try {
      await removeMarketplace(req.params.name);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // GET /api/marketplace/popular
  app.get("/api/marketplace/popular", async (_req, res) => {
    try {
      const results = await getPopularSkills();
      res.json(results);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // POST /api/marketplace/update
  app.post("/api/marketplace/update", async (req, res) => {
    try {
      const { name, source } = req.body as { name: string; source: string };
      const result = await updateSkill(name, source);
      res.json(result);
    } catch (e) {
      res.json({ success: false, error: (e as Error).message });
    }
  });

  // GET /api/plugins
  app.get("/api/plugins", async (req, res) => {
    try {
      const marketplace = req.query.marketplace as string | undefined;
      const plugins = await listPlugins(marketplace);
      res.json(plugins);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // POST /api/plugins/toggle
  app.post("/api/plugins/toggle", async (req, res) => {
    try {
      const { name, enabled } = req.body as { name: string; enabled: boolean };
      await togglePlugin(name, enabled);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // POST /api/plugins/toggle-skill
  app.post("/api/plugins/toggle-skill", async (req, res) => {
    try {
      const { pluginName, skillName, enabled } = req.body as {
        pluginName: string;
        skillName: string;
        enabled: boolean;
      };
      await toggleSkillInPlugin(pluginName, skillName, enabled);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  return app;
}

export function startServer(port = 3378): Express {
  const app = createServer(port);
  app.listen(port, () => {
    console.log(`Mycelium dashboard API running on http://localhost:${port}`);
  });
  return app;
}
