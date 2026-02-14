import { Router } from "express";

import { searchMarketplace, installFromMarketplace, getPopularSkills, updateSkill, checkForUpdates, checkMyceliumUpdate } from "../core/marketplace.js";
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

  router.get("/updates", asyncHandler(async (_req, res) => {
    const updates = await checkForUpdates();
    res.json(updates);
  }));

  router.get("/self-update", asyncHandler(async (_req, res) => {
    const result = await checkMyceliumUpdate();
    res.json(result ?? { current: "unknown", latest: "unknown", hasUpdate: false });
  }));

  router.get("/content", asyncHandler(async (req, res) => {
    const url = req.query.url as string;
    const type = (req.query.type as string) || "skill";
    if (!url) { res.status(400).json({ error: "Missing url parameter" }); return; }

    const ALLOWED_TYPES = ["skill", "agent", "command", "mcp", "plugin"];
    if (!ALLOWED_TYPES.includes(type)) {
      res.status(400).json({ error: "Invalid type parameter" }); return;
    }

    // Strict URL validation — parse and whitelist hostnames
    let parsedUrl: URL;
    try { parsedUrl = new URL(url); } catch {
      res.status(400).json({ error: "Invalid URL" }); return;
    }
    if (parsedUrl.protocol !== "https:") {
      res.status(400).json({ error: "Only HTTPS URLs are supported" }); return;
    }
    const allowedHosts = ["github.com", "raw.githubusercontent.com"];
    if (!allowedHosts.includes(parsedUrl.hostname)) {
      res.status(400).json({ error: "Only GitHub URLs are supported" }); return;
    }

    try {
      // Build raw URL using parsed components (not string replace) to prevent hostname spoofing
      let rawUrl: string;
      if (parsedUrl.hostname === "github.com" && parsedUrl.pathname.includes("/tree/main/")) {
        const rawPath = parsedUrl.pathname.replace("/tree/main/", "/main/");
        rawUrl = `https://raw.githubusercontent.com${rawPath}`;
      } else {
        rawUrl = parsedUrl.href;
      }
      // Append correct file extension based on type
      if (type === "skill" && !rawUrl.endsWith(".md")) rawUrl += "/SKILL.md";
      else if (!rawUrl.endsWith(".md")) rawUrl += ".md";

      const ghRes = await fetch(rawUrl, {
        signal: AbortSignal.timeout(10000),
        redirect: "manual",  // Block redirects to prevent SSRF via open redirects
      });
      if (!ghRes.ok) { res.status(404).json({ error: "Content not found" }); return; }
      const content = await ghRes.text();
      res.json({ content });
    } catch {
      res.status(500).json({ error: "Failed to fetch content" });
    }
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
