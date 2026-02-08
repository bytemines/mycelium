import { Router } from "express";
import { asyncHandler } from "./async-handler.js";

import type { Express } from "express";

export function registerRemoveRoutes(app: Express): void {
  const router = Router();

  router.delete("/skill/:name", asyncHandler(async (req, res) => {
    const { removeSkill } = await import("../commands/remove.js");
    const result = await removeSkill(req.params.name as string);
    res.json(result);
  }));

  router.delete("/mcp/:name", asyncHandler(async (req, res) => {
    const { removeMcp } = await import("../commands/remove.js");
    const result = await removeMcp(req.params.name as string);
    res.json(result);
  }));

  router.delete("/hook/:name", asyncHandler(async (req, res) => {
    const { removeHook } = await import("../commands/remove.js");
    const result = await removeHook(req.params.name as string);
    res.json(result);
  }));

  router.delete("/plugin/:name", asyncHandler(async (req, res) => {
    const { removePlugin } = await import("../commands/remove.js");
    const result = await removePlugin(req.params.name as string);
    res.json(result);
  }));

  app.use("/api/remove", router);
}
