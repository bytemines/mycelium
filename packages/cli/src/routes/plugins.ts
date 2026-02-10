import { Router } from "express";

import { enableSkillOrMcp } from "../commands/enable.js";
import { disableSkillOrMcp } from "../commands/disable.js";
import { asyncHandler } from "./async-handler.js";
import { getLivePluginState } from "../core/plugin-state.js";

import type { Express } from "express";
import type { ToolId } from "@mycelish/core";

export function registerPluginsRoutes(app: Express): void {
  const router = Router();

  router.get("/", asyncHandler(async (_req, res) => {
    const plugins = await getLivePluginState(process.cwd());
    res.json(plugins);
  }));

  router.post("/toggle", asyncHandler(async (req, res) => {
    const { name, enabled } = req.body as { name: string; enabled: boolean };

    // Load plugin's items from live cache scan
    const plugins = await getLivePluginState(process.cwd());
    const plugin = plugins.find(p => p.name === name);
    if (!plugin) {
      res.status(404).json({ success: false, error: `Plugin '${name}' not found` });
      return;
    }

    const allItems = [...plugin.skills, ...(plugin.agents ?? []), ...(plugin.commands ?? []), ...(plugin.hooks ?? []), ...(plugin.libs ?? [])];
    const results = [];
    let anyTakeover = false;
    let anyReleased = false;

    for (const itemName of allItems) {
      const options = { name: itemName, global: true };
      const result = enabled
        ? await enableSkillOrMcp(options)
        : await disableSkillOrMcp(options);
      results.push(result);
      if ((result as any).pluginTakeover) anyTakeover = true;
      if ((result as any).pluginReleased) anyReleased = true;
    }

    const failures = results.filter(r => !r.success);
    res.json({
      success: failures.length === 0,
      plugin: name,
      enabled,
      itemCount: allItems.length,
      pluginTakeover: anyTakeover,
      pluginReleased: anyReleased,
      failures: failures.map(f => ({ name: f.name, error: f.error })),
    });
  }));

  router.post("/:pluginName/items/:itemName/toggle", asyncHandler(async (req, res) => {
    const pluginName = req.params.pluginName as string;
    const itemName = req.params.itemName as string;
    const { enabled, global: isGlobal, tool } = req.body as { enabled: boolean; global?: boolean; tool?: string };
    if (typeof enabled !== "boolean") {
      res.status(400).json({ success: false, error: "Missing required field: enabled (boolean)" });
      return;
    }

    const options = { name: itemName, global: isGlobal ?? true, tool: tool as ToolId | undefined };
    const result = enabled
      ? await enableSkillOrMcp(options)
      : await disableSkillOrMcp(options);

    if (result.success) {
      res.json({
        success: true,
        plugin: pluginName,
        item: itemName,
        enabled,
        type: result.type,
        level: result.level,
        pluginTakeover: (result as any).pluginTakeover ?? false,
        pluginReleased: (result as any).pluginReleased ?? false,
      });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  }));

  app.use("/api/plugins", router);
}
