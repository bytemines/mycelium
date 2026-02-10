import * as path from "node:path";
import { Router } from "express";

import { loadManifest } from "../core/migrator/index.js";
import {
  togglePlugin,
} from "../core/marketplace-registry.js";
import { enableSkillOrMcp } from "../commands/enable.js";
import { disableSkillOrMcp } from "../commands/disable.js";
import { buildPluginMap } from "./plugin-map.js";
import { asyncHandler } from "./async-handler.js";
import { readFileIfExists } from "../core/fs-helpers.js";
import { parse as yamlParse } from "yaml";
import { expandPath } from "@mycelish/core";

import type { Express } from "express";
import type { ToolId } from "@mycelish/core";

export function registerPluginsRoutes(app: Express): void {
  const router = Router();

  router.get("/", asyncHandler(async (_req, res) => {
    const manifest = await loadManifest();
    const pluginMap = buildPluginMap(manifest);

    // Load state manifest to determine disabled items
    const disabledItems = new Set<string>();
    for (const manifestPath of [
      path.join(expandPath("~/.mycelium"), "manifest.yaml"),
      path.join(process.cwd(), ".mycelium", "manifest.yaml"),
    ]) {
      const content = await readFileIfExists(manifestPath);
      if (!content) continue;
      const stateManifest = yamlParse(content);
      for (const section of ["skills", "mcps", "hooks", "memory"]) {
        const items = stateManifest?.[section];
        if (!items || typeof items !== "object") continue;
        for (const [itemName, config] of Object.entries(items)) {
          const state = (config as any)?.state;
          if (state === "disabled" || state === "deleted") disabledItems.add(itemName);
          else if (state === "enabled") disabledItems.delete(itemName);
        }
      }
    }

    const plugins = Array.from(pluginMap.entries()).map(([name, data]) => {
      const parts: string[] = [];
      if (data.skills.length) parts.push(`${data.skills.length} skills`);
      if (data.agents.length) parts.push(`${data.agents.length} agents`);
      if (data.commands.length) parts.push(`${data.commands.length} commands`);
      if (data.hooks.length) parts.push(`${data.hooks.length} hooks`);
      if (data.libs.length) parts.push(`${data.libs.length} libs`);
      const allItems = [...data.skills, ...data.agents, ...data.commands, ...data.hooks, ...data.libs];
      const allEnabled = allItems.every(i => !disabledItems.has(i));
      return {
        name,
        marketplace: data.marketplace,
        version: "",
        description: parts.join(", "),
        enabled: allEnabled,
        skills: data.skills,
        agents: data.agents,
        commands: data.commands,
        hooks: data.hooks,
        libs: data.libs,
        disabledItems: allItems.filter(i => disabledItems.has(i)),
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
    if (typeof enabled !== "boolean") {
      res.status(400).json({ success: false, error: "Missing required field: enabled (boolean)" });
      return;
    }

    const options = { name: itemName, global: isGlobal ?? true, tool: tool as ToolId | undefined };
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
