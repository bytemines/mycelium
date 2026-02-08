import { Router } from "express";

import { searchMarketplace, installFromMarketplace, getPopularSkills, updateSkill } from "../core/marketplace.js";
import {
  loadMarketplaceRegistry,
  addMarketplace,
  removeMarketplace,
} from "../core/marketplace-registry.js";
import { asyncHandler } from "./async-handler.js";

import type { MarketplaceSource, MarketplaceEntry, MarketplaceConfig } from "@mycelium/core";
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

  app.use("/api/marketplace", router);
}
