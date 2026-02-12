import { Router } from "express";
import { asyncHandler } from "./async-handler.js";

import type { Express } from "express";

export function registerRemoveRoutes(app: Express): void {
  const router = Router();

  router.delete("/:name", asyncHandler(async (req, res) => {
    const { removeItem } = await import("../commands/remove.js");
    const type = req.query.type as string | undefined;
    const purge = req.query.purge === "true";
    const result = await removeItem(req.params.name as string, { type, purge });
    res.json(result);
  }));

  router.delete("/plugin/:name", asyncHandler(async (req, res) => {
    const { removeBySource } = await import("../commands/remove.js");
    const result = await removeBySource(req.params.name as string);
    res.json(result);
  }));

  app.use("/api/remove", router);
}
