import { Router } from "express";

import { loadManifest } from "../core/migrator/index.js";
import {
  togglePlugin,
} from "../core/marketplace-registry.js";
import { enableSkillOrMcp } from "../commands/enable.js";
import { disableSkillOrMcp } from "../commands/disable.js";
import { buildPluginMap } from "./plugin-map.js";
import { asyncHandler } from "./async-handler.js";

import type { Express } from "express";

export function registerPluginsRoutes(app: Express): void {
  const router = Router();

  router.get("/", asyncHandler(async (_req, res) => {
    const manifest = await loadManifest();
    const pluginMap = buildPluginMap(manifest);
    const plugins = Array.from(pluginMap.entries()).map(([name, data]) => {
      const parts: string[] = [];
      if (data.skills.length) parts.push(`${data.skills.length} skills`);
      if (data.agents.length) parts.push(`${data.agents.length} agents`);
      if (data.commands.length) parts.push(`${data.commands.length} commands`);
      if (data.hooks.length) parts.push(`${data.hooks.length} hooks`);
      if (data.libs.length) parts.push(`${data.libs.length} libs`);
      return {
        name,
        marketplace: data.marketplace,
        version: "",
        description: parts.join(", "),
        enabled: true,
        skills: data.skills,
        agents: data.agents,
        commands: data.commands,
        hooks: data.hooks,
        libs: data.libs,
        installPath: "",
      };
    });
    res.json(plugins);
  }));

  router.post("/toggle", asyncHandler(async (req, res) => {
    const { name, enabled } = req.body as { name: string; enabled: boolean };
    await togglePlugin(name, enabled);
    res.json({ success: true });
  }));

  router.post("/:pluginName/items/:itemName/toggle", asyncHandler(async (req, res) => {
    const pluginName = req.params.pluginName as string;
    const itemName = req.params.itemName as string;
    const { enabled, global: isGlobal, tool } = req.body as { enabled: boolean; global?: boolean; tool?: string };

    const options = { name: itemName, global: isGlobal, tool: tool as any };
    const result = enabled
      ? await enableSkillOrMcp(options)
      : await disableSkillOrMcp(options);

    if (result.success) {
      res.json({ success: true, plugin: pluginName, item: itemName, enabled, type: result.type, level: result.level });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  }));

  app.use("/api/plugins", router);
}
