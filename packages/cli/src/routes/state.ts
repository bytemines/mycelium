import { Router } from "express";
import fs from "fs/promises";
import path from "path";
import { parse as parseYaml } from "yaml";

import { loadManifest } from "../core/migrator/index.js";
import { detectInstalledTools } from "../core/tool-detector.js";
import { getAdapter } from "../core/tool-adapter.js";
import { MYCELIUM_HOME } from "../core/fs-helpers.js";
import { buildPluginMap } from "./plugin-map.js";
import { asyncHandler } from "./async-handler.js";

import type { ToolId, McpServerConfig } from "@mycelium/core";
import type { Express } from "express";

const DISABLED_MCPS_FILE = path.join(MYCELIUM_HOME, "disabled-mcps.json");

async function loadDisabledMcps(): Promise<Record<string, ToolId[]>> {
  try {
    const content = await fs.readFile(DISABLED_MCPS_FILE, "utf-8");
    return JSON.parse(content);
  } catch {
    return {};
  }
}

async function saveDisabledMcps(disabled: Record<string, ToolId[]>): Promise<void> {
  await fs.mkdir(path.dirname(DISABLED_MCPS_FILE), { recursive: true });
  await fs.writeFile(DISABLED_MCPS_FILE, JSON.stringify(disabled, null, 2), "utf-8");
}

export function registerStateRoutes(app: Express): void {
  const stateRouter = Router();
  const toggleRouter = Router();

  // GET /api/state
  stateRouter.get("/", asyncHandler(async (_req, res) => {
    const detectedTools = await detectInstalledTools();
    const installedToolIds = detectedTools.filter((t) => t.installed).map((t) => t.id as ToolId);
    const tools = detectedTools.map((t) => ({
      id: t.id,
      name: t.name,
      status: t.status,
      installed: t.installed,
    }));

    const skillsDir = path.join(MYCELIUM_HOME, "global", "skills");
    let skills: Array<{ name: string; status: "synced"; enabled: boolean; connectedTools: ToolId[] }> = [];
    try {
      const entries = await fs.readdir(skillsDir);
      skills = entries.map((name) => ({
        name,
        status: "synced" as const,
        enabled: true,
        connectedTools: installedToolIds,
      }));
    } catch {
      // directory doesn't exist yet
    }

    const disabledMcps = await loadDisabledMcps();
    let mcps: Array<{ name: string; status: "synced" | "disabled"; enabled: boolean; connectedTools: ToolId[] }> = [];
    try {
      const mcpContent = await fs.readFile(path.join(MYCELIUM_HOME, "global", "mcps.yaml"), "utf-8");
      const parsed = parseYaml(mcpContent) as Record<string, unknown> | null;
      if (parsed && typeof parsed === "object") {
        mcps = Object.keys(parsed).map((name) => {
          const disabledFor = disabledMcps[name] || [];
          const enabled = disabledFor.length === 0;
          return {
            name,
            status: enabled ? "synced" as const : "disabled" as const,
            enabled,
            connectedTools: installedToolIds,
          };
        });
      }
    } catch {
      // file doesn't exist yet
    }

    let memory: Array<{ name: string; scope: "global"; status: "synced" }> = [];
    try {
      const memEntries = await fs.readdir(path.join(MYCELIUM_HOME, "memory"));
      memory = memEntries
        .filter((f) => f.endsWith(".md"))
        .map((name) => ({
          name,
          scope: "global" as const,
          status: "synced" as const,
        }));
    } catch {
      // directory doesn't exist yet
    }

    const manifest = await loadManifest();
    const migrated = manifest.entries.length > 0;

    const pluginMap = buildPluginMap(manifest);
    const plugins = Array.from(pluginMap.entries()).map(([name, data]) => ({
      name,
      skills: data.skills,
      agents: data.agents,
      commands: data.commands,
      hooks: data.hooks,
      libs: data.libs,
    }));

    res.json({ tools, skills, mcps, memory, migrated, plugins });
  }));

  // GET /api/state/status
  stateRouter.get("/status", asyncHandler(async (_req, res) => {
    const manifest = await loadManifest();
    const migrated = manifest.entries.length > 0;

    let configExists = false;
    try {
      const entries = await fs.readdir(MYCELIUM_HOME);
      configExists = entries.length > 0;
    } catch {
      // directory doesn't exist
    }

    let snapshotCount = 0;
    try {
      const snapshots = await fs.readdir(path.join(MYCELIUM_HOME, "snapshots"));
      snapshotCount = snapshots.length;
    } catch {
      // no snapshots dir
    }

    res.json({ migrated, configExists, snapshotCount });
  }));

  // POST /api/toggle
  toggleRouter.post("/", asyncHandler(async (req, res) => {
    const { type, name, toolId, enabled } = req.body as {
      type: string;
      name: string;
      toolId?: string;
      enabled: unknown;
    };

    if (!type || !name || typeof enabled !== "boolean") {
      res.status(400).json({ error: "Missing required fields: type, name, enabled (boolean)" });
      return;
    }

    if (!["mcp", "skill", "memory"].includes(type)) {
      res.status(400).json({ error: `Invalid type: ${type}. Must be mcp, skill, or memory` });
      return;
    }

    if (type !== "mcp") {
      res.json({ success: true, action: req.body, message: "Only MCP toggles are supported" });
      return;
    }

    const targetTool = toolId || "claude-code";
    const adapter = getAdapter(targetTool as ToolId);
    const disabledMcps = await loadDisabledMcps();

    if (enabled) {
      const mcpContent = await fs.readFile(path.join(MYCELIUM_HOME, "global", "mcps.yaml"), "utf-8");
      const parsed = parseYaml(mcpContent) as Record<string, Record<string, unknown>> | null;
      const mcpConfig = parsed?.[name];

      if (mcpConfig) {
        const config: McpServerConfig = {
          command: mcpConfig.command as string,
          args: mcpConfig.args as string[] | undefined,
          env: mcpConfig.env as Record<string, string> | undefined,
        };
        const result = await adapter.add(name, config);

        if (disabledMcps[name]) {
          disabledMcps[name] = disabledMcps[name].filter((t: string) => t !== targetTool);
          if (disabledMcps[name].length === 0) delete disabledMcps[name];
        }
        await saveDisabledMcps(disabledMcps);

        res.json({ success: result.success, method: result.method, message: result.message || result.error });
        return;
      }
      res.status(404).json({ error: `MCP ${name} not found in mcps.yaml` });
      return;
    } else {
      const result = await adapter.remove(name);

      if (!disabledMcps[name]) disabledMcps[name] = [];
      if (!disabledMcps[name].includes(targetTool as ToolId)) {
        disabledMcps[name].push(targetTool as ToolId);
      }
      await saveDisabledMcps(disabledMcps);

      res.json({ success: result.success, method: result.method, message: result.message || result.error });
    }
  }));

  app.use("/api/state", stateRouter);
  app.use("/api/toggle", toggleRouter);
}
