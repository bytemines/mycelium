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
import { getDisabledItems, getDeletedItems, ALL_ITEM_TYPES, loadStateManifest, ITEM_SECTIONS } from "../core/manifest-state.js";
import { verifyItemState } from "../core/state-verifier.js";
import { getLivePluginState } from "../core/plugin-state.js";
import { asyncHandler } from "./async-handler.js";

import type { ItemConfig } from "../core/manifest-state.js";
import type { ToolId, Capability } from "@mycelish/core";
import { TOOL_REGISTRY } from "@mycelish/core";
import type { Express } from "express";

/** Get installed tools that have a specific capability. */
function toolsWithCap(installedToolIds: ToolId[], cap: Capability): ToolId[] {
  return installedToolIds.filter(id => {
    const desc = TOOL_REGISTRY[id];
    return desc?.capabilities.includes(cap);
  });
}

/** Compute which installed tools an item targets based on capability + tools/excludeTools config. */
function computeConnectedTools(cfg: ItemConfig | undefined, installedToolIds: ToolId[], capability: Capability): ToolId[] {
  // First filter by capability
  const capableTools = toolsWithCap(installedToolIds, capability);
  if (!cfg) return capableTools;
  if (cfg.tools?.length) return capableTools.filter(id => cfg.tools!.includes(id));
  if (cfg.excludeTools?.length) return capableTools.filter(id => !cfg.excludeTools!.includes(id));
  return capableTools;
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

    // Load disabled and deleted items from manifest.yaml (single source of truth)
    const disabledItems = await getDisabledItems(process.cwd());
    const deletedItems = await getDeletedItems(process.cwd());

    const stateManifest = await loadStateManifest(MYCELIUM_HOME);

    const skillsDir = path.join(MYCELIUM_HOME, "global", "skills");
    let skills: Array<{ name: string; status: "synced" | "disabled"; enabled: boolean; connectedTools: ToolId[] }> = [];
    try {
      const entries = await fs.readdir(skillsDir);
      skills = entries
        .filter((name) => !deletedItems.has(name))
        .filter((name) => {
          // Exclude plugin-origin skills (shown under their plugin node)
          const cfg = stateManifest?.skills?.[name] as ItemConfig | undefined;
          if (cfg?.pluginOrigin) return false;
          return true;
        })
        .filter((name) => {
          // Exclude items registered as non-skill types in manifest
          if (!stateManifest) return true;
          for (const { key, type } of ITEM_SECTIONS) {
            if (type === "skill") continue;
            const section = stateManifest[key] as Record<string, ItemConfig> | undefined;
            if (section?.[name]) return false;
          }
          return true;
        })
        .map((name) => {
          const cfg = stateManifest?.skills?.[name] as ItemConfig | undefined;
          const connTools = computeConnectedTools(cfg, installedToolIds, "skills");
          return {
            name,
            status: disabledItems.has(name) ? "disabled" as const : "synced" as const,
            enabled: !disabledItems.has(name),
            connectedTools: connTools,
          };
        });
    } catch {
      // directory doesn't exist yet
    }

    let mcps: Array<{ name: string; status: "synced" | "disabled"; enabled: boolean; connectedTools: ToolId[] }> = [];
    try {
      const mcpContent = await fs.readFile(path.join(MYCELIUM_HOME, "global", "mcps.yaml"), "utf-8");
      const parsed = parseYaml(mcpContent, { uniqueKeys: false }) as Record<string, unknown> | null;
      if (parsed && typeof parsed === "object") {
        mcps = Object.keys(parsed)
          .filter((name) => !deletedItems.has(name))
          .map((name) => {
            const enabled = !disabledItems.has(name);
            const mcpCfg = stateManifest?.mcps?.[name] as ItemConfig | undefined;
            const tools = computeConnectedTools(mcpCfg, installedToolIds, "mcp");
            return {
              name,
              status: enabled ? "synced" as const : "disabled" as const,
              enabled,
              connectedTools: tools,
            };
          });
      }
    } catch {
      // file doesn't exist yet
    }

    // Load file-based items (agents, commands, rules) from filesystem
    async function loadFileItems(dirName: string, manifestKey: string, capability: Capability) {
      try {
        const dir = path.join(MYCELIUM_HOME, "global", dirName);
        const entries = await fs.readdir(dir);
        const section = (stateManifest as Record<string, unknown> | null)?.[manifestKey] as Record<string, ItemConfig> | undefined;
        return entries
          .filter((f) => f.endsWith(".md"))
          .map((f) => f.replace(/\.md$/, ""))
          .filter((name) => !deletedItems.has(name))
          .filter((name) => !section?.[name]?.pluginOrigin)
          .map((name) => ({
            name,
            status: disabledItems.has(name) ? "disabled" as const : "synced" as const,
            enabled: !disabledItems.has(name),
            connectedTools: computeConnectedTools(section?.[name], installedToolIds, capability),
          }));
      } catch {
        return [];
      }
    }

    const [agents, commands, rules] = await Promise.all([
      loadFileItems("agents", "agents", "agents"),
      loadFileItems("commands", "commands", "commands"),
      loadFileItems("rules", "rules", "rules"),
    ]);

    let memory: Array<{ name: string; scope: "global"; status: "synced" }> = [];
    try {
      const memEntries = await fs.readdir(path.join(MYCELIUM_HOME, "memory"));
      memory = memEntries
        .filter((f) => f.endsWith(".md"))
        .map((f) => ({
          name: f.replace(/\.md$/, "").replace(/^(?:claude-code|codex|gemini|opencode|openclaw)-/, ""),
          scope: "global" as const,
          status: "synced" as const,
        }));
    } catch {
      // directory doesn't exist yet
    }

    const manifest = await loadManifest();
    const migrated = manifest.entries.length > 0;

    const plugins = await getLivePluginState(process.cwd());

    // Filter out standalone items that belong to a plugin (avoid duplicates in graph)
    const pluginOwnedItems = new Set<string>();
    for (const p of plugins) {
      for (const s of p.skills ?? []) pluginOwnedItems.add(s);
      for (const a of p.agents ?? []) pluginOwnedItems.add(a);
      for (const c of p.commands ?? []) pluginOwnedItems.add(c);
    }
    const filteredSkills = skills.filter(s => !pluginOwnedItems.has(s.name));
    const filteredAgents = agents.filter(a => !pluginOwnedItems.has(a.name));
    const filteredCommands = commands.filter(c => !pluginOwnedItems.has(c.name));

    res.json({ tools, skills: filteredSkills, mcps, agents: filteredAgents, commands: filteredCommands, rules, memory, migrated, plugins, version: CLI_VERSION });
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
