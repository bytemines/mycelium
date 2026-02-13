import { Router } from "express";

import { searchMarketplace, installFromMarketplace, getPopularSkills, updateSkill } from "../core/marketplace.js";
import {
  loadMarketplaceRegistry,
  addMarketplace,
  removeMarketplace,
} from "../core/marketplace-registry.js";
import { clearAllCaches } from "../core/marketplace-cache.js";
import { asyncHandler } from "./async-handler.js";

import type { MarketplaceSource, MarketplaceEntry, MarketplaceConfig } from "@mycelish/core";
import type { Express } from "express";

export function registerMarketplaceRoutes(app: Express): void {
  const router = Router();

  router.get("/search", asyncHandler(async (req, res) => {
    const query = (req.query.q as string) || "";
    const source = req.query.source as string | undefined;
    const results = await searchMarketplace(query, source as MarketplaceSource | undefined);
    res.json(results);
  }));

  router.post("/install", asyncHandler(async (req, res) => {
    const { name, source, description, type } = req.body || {};
    if (!name || !source) {
      res.status(400).json({ success: false, error: "Missing required fields: name, source" });
      return;
    }
    const entry: MarketplaceEntry = { name, source, description: description || "", type: type || "skill" };
    const result = await installFromMarketplace(entry);
    res.json(result);
  }));

  router.get("/registry", asyncHandler(async (_req, res) => {
    const registry = await loadMarketplaceRegistry();
    res.json(registry);
  }));

  router.post("/registry", asyncHandler(async (req, res) => {
    const { name, ...config } = req.body as { name: string } & MarketplaceConfig;
    await addMarketplace(name, config);
    res.json({ success: true });
  }));

  router.delete("/registry/:name", asyncHandler(async (req, res) => {
    await removeMarketplace(req.params.name as string);
    res.json({ success: true });
  }));

  router.get("/popular", asyncHandler(async (_req, res) => {
    const results = await getPopularSkills();
    res.json(results);
  }));

  router.post("/update", asyncHandler(async (req, res) => {
    const { name, source } = req.body || {};
    if (!name || !source) {
      res.status(400).json({ success: false, error: "Missing required fields: name, source" });
      return;
    }
    const result = await updateSkill(name, source);
    res.json(result);
  }));

  router.post("/refresh", asyncHandler(async (_req, res) => {
    const cleared = await clearAllCaches();
    const registry = await loadMarketplaceRegistry();
    const refreshed: string[] = [];
    const errors: string[] = [];

    for (const [name, config] of Object.entries(registry)) {
      if (!config.enabled) continue;
      try {
        await searchMarketplace("", name, { forceRefresh: true });
        refreshed.push(name);
      } catch (err) {
        errors.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    res.json({ cleared, refreshed, errors });
  }));

  router.post("/audit", asyncHandler(async (req, res) => {
    const { name, source, type, content, fileName } = req.body || {};

    if (content && fileName) {
      const { scanContent } = await import("../core/security-scanner.js");
      const result = scanContent(content, fileName);
      res.json(result);
      return;
    }

    if (!name || !source) {
      res.status(400).json({ success: false, error: "Missing required fields: name+source or content+fileName" });
      return;
    }

    // Sanitize name to prevent path traversal
    const safeName = String(name).replace(/[/\\..]/g, "");
    if (!safeName || safeName !== name) {
      res.status(400).json({ success: false, error: "Invalid item name" });
      return;
    }

    const os = await import("node:os");
    const path = await import("node:path");
    const skillPath = path.join(os.default.homedir(), ".mycelium", "global", "skills", safeName);

    try {
      const { scanSkill } = await import("../core/security-scanner.js");
      const result = await scanSkill(skillPath);
      res.json(result);
    } catch (err) {
      res.status(404).json({ safe: true, findings: [], scannedFiles: 0, duration: 0, error: `Item not found: ${safeName}` });
    }
  }));

  app.use("/api/marketplace", router);
}
