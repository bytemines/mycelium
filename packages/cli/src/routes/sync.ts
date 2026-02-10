import { Router } from "express";
import { asyncHandler } from "./async-handler.js";
import { ALL_TOOL_IDS } from "@mycelish/core";
import { syncAll } from "../commands/sync.js";

import type { Express } from "express";
import type { ToolId } from "@mycelish/core";

export function registerSyncRoutes(app: Express): void {
  const router = Router();

  router.post("/", asyncHandler(async (_req, res) => {
    const enabledTools: Record<string, { enabled: boolean }> = Object.fromEntries(
      ALL_TOOL_IDS.map(id => [id, { enabled: true }])
    );
    const result = await syncAll(process.cwd(), enabledTools as Record<ToolId, { enabled: boolean }>);
    if (result.success) {
      res.json({ success: true, tools: result.tools.length });
    } else {
      res.status(500).json({ success: false, errors: result.errors });
    }
  }));

  app.use("/api/sync", router);
}
