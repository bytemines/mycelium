import { Router } from "express";
import { asyncHandler } from "./async-handler.js";

import type { Express } from "express";

export function registerSyncRoutes(app: Express): void {
  const router = Router();

  router.post("/", asyncHandler(async (_req, res) => {
    const { execFileSync } = await import("node:child_process");
    execFileSync("npx", ["mycelium", "sync"], { stdio: "pipe", timeout: 30000 });
    res.json({ success: true });
  }));

  app.use("/api/sync", router);
}
