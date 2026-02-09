import { Router } from "express";

import { scanAllTools, executeMigration, clearMigration } from "../core/migrator/index.js";
import { asyncHandler } from "./async-handler.js";

import type { MigrationPlan } from "@mycelish/core";
import type { Express } from "express";

export function registerMigrateRoutes(app: Express): void {
  const router = Router();

  router.get("/scan", asyncHandler(async (_req, res) => {
    const results = await scanAllTools();
    res.json(results);
  }));

  router.post("/apply", asyncHandler(async (req, res) => {
    const plan = req.body as MigrationPlan;
    const result = await executeMigration(plan);
    res.json(result);
  }));

  router.post("/clear", asyncHandler(async (req, res) => {
    const toolId = req.query.tool as string | undefined;
    const result = await clearMigration(toolId ? { toolId: toolId as any } : undefined);
    res.json(result);
  }));

  app.use("/api/migrate", router);
}
