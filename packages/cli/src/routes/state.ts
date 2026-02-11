import { Router } from "express";
import fs from "fs/promises";
import path from "path";
import { parse as parseYaml } from "yaml";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgPath = path.resolve(__dirname, "..", "..", "package.json");
const CLI_VERSION: string = (JSON.parse(readFileSync(pkgPath, "utf-8")) as { version: string }).version;

import { loadManifest } from "../core/migrator/index.js";
import { detectInstalledTools } from "../core/tool-detector.js";
import { enableSkillOrMcp } from "../commands/enable.js";
import { disableSkillOrMcp } from "../commands/disable.js";
import { MYCELIUM_HOME } from "../core/fs-helpers.js";
import { getDisabledItems, ALL_ITEM_TYPES } from "../core/manifest-state.js";
import { verifyItemState } from "../core/state-verifier.js";
import { getLivePluginState } from "../core/plugin-state.js";
import { asyncHandler } from "./async-handler.js";

import type { ToolId } from "@mycelish/core";
import type { Express } from "express";

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

    // Load disabled items from manifest.yaml (single source of truth)
    const disabledItems = await getDisabledItems(process.cwd());

    const skillsDir = path.join(MYCELIUM_HOME, "global", "skills");
    let skills: Array<{ name: string; status: "synced" | "disabled"; enabled: boolean; connectedTools: ToolId[] }> = [];
    try {
      const entries = await fs.readdir(skillsDir);
      skills = entries
        .filter((name) => !disabledItems.has(name))
        .map((name) => ({
          name,
          status: "synced" as const,
          enabled: true,
          connectedTools: installedToolIds,
        }));
    } catch {
      // directory doesn't exist yet
    }

    let mcps: Array<{ name: string; status: "synced" | "disabled"; enabled: boolean; connectedTools: ToolId[] }> = [];
    try {
      const mcpContent = await fs.readFile(path.join(MYCELIUM_HOME, "global", "mcps.yaml"), "utf-8");
      const parsed = parseYaml(mcpContent) as Record<string, unknown> | null;
      if (parsed && typeof parsed === "object") {
        mcps = Object.keys(parsed).map((name) => {
          const enabled = !disabledItems.has(name);
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
        .map((f) => ({
          name: f.replace(/\.md$/, "").replace(/^(?:claude-code|codex|gemini|opencode|openclaw|aider)-/, ""),
          scope: "global" as const,
          status: "synced" as const,
        }));
    } catch {
      // directory doesn't exist yet
    }

    const manifest = await loadManifest();
    const migrated = manifest.entries.length > 0;

    const plugins = await getLivePluginState(process.cwd());

    res.json({ tools, skills, mcps, memory, migrated, plugins, version: CLI_VERSION });
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

  // POST /api/toggle — uses enable/disable commands (writes to manifest.yaml)
  toggleRouter.post("/", asyncHandler(async (req, res) => {
    const { type, name, enabled } = req.body as {
      type: string;
      name: string;
      toolId?: string;
      enabled: unknown;
    };

    if (!type || !name || typeof enabled !== "boolean") {
      res.status(400).json({ error: "Missing required fields: type, name, enabled (boolean)" });
      return;
    }

    if (!ALL_ITEM_TYPES.includes(type as any)) {
      res.status(400).json({ error: `Invalid type: ${type}. Must be one of: ${ALL_ITEM_TYPES.join(", ")}` });
      return;
    }

    const options = { name, global: true };
    const result = enabled
      ? await enableSkillOrMcp(options)
      : await disableSkillOrMcp(options);

    if (result.success) {
      res.json({ success: true, type: result.type, level: result.level });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  }));

  // GET /api/state/:name — verify item state in manifest AND actual tool configs
  stateRouter.get("/:name", asyncHandler(async (req, res) => {
    const name = req.params.name as string;
    const tool = (req.query.tool as string) || undefined;
    const type = (req.query.type as string) || undefined;
    const result = await verifyItemState(name, {
      projectRoot: process.cwd(),
      tool: tool as import("@mycelish/core").ToolId | undefined,
      type: type as import("../core/manifest-state.js").ItemType | undefined,
    });
    res.json(result);
  }));

  app.use("/api/state", stateRouter);
  app.use("/api/toggle", toggleRouter);
}
