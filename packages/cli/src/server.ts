import express from "express";
import cors from "cors";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

import { scanAllTools, loadManifest } from "./core/migrator.js";
import { executeMigration, clearMigration } from "./core/migrator.js";
import { searchMarketplace, installFromMarketplace, getPopularSkills, updateSkill } from "./core/marketplace.js";
import {
  loadMarketplaceRegistry,
  addMarketplace,
  removeMarketplace,
  listPlugins,
  togglePlugin,
  toggleSkillInPlugin,
} from "./core/marketplace-registry.js";
import { detectInstalledTools } from "./core/tool-detector.js";
import { getAdapter } from "./core/tool-adapter.js";

import type { MigrationPlan, MarketplaceConfig, MarketplaceSource, MarketplaceEntry, ToolId, McpServerConfig } from "@mycelium/core";
import type { Express } from "express";

const MYCELIUM_HOME = path.join(os.homedir(), ".mycelium");
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

export function createServer(port = 3378): Express {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // GET /api/state
  app.get("/api/state", async (_req, res) => {
    try {
      // 1. Detect installed tools
      const detectedTools = await detectInstalledTools();
      const tools = detectedTools.map((t) => ({
        id: t.id,
        name: t.name,
        status: t.status,
        installed: t.installed,
      }));

      // 2. Read skills from ~/.mycelium/global/skills/
      const skillsDir = path.join(MYCELIUM_HOME, "global", "skills");
      let skills: Array<{ name: string; status: "synced"; enabled: boolean; connectedTools: ToolId[] }> = [];
      try {
        const entries = await fs.readdir(skillsDir);
        skills = entries.map((name) => ({
          name,
          status: "synced" as const,
          enabled: true,
          connectedTools: ["claude-code" as ToolId],
        }));
      } catch {
        // directory doesn't exist yet
      }

      // 3. Read MCPs from ~/.mycelium/global/mcps.yaml
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
              connectedTools: ["claude-code" as ToolId],
            };
          });
        }
      } catch {
        // file doesn't exist yet
      }

      // 4. Read memory files from ~/.mycelium/memory/
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

      // 5. Load manifest for provenance
      const manifest = await loadManifest();
      const migrated = manifest.entries.length > 0;

      // 6. Group components by pluginName from manifest
      const pluginMap = new Map<string, { skills: string[]; agents: string[]; commands: string[]; hooks: string[]; libs: string[] }>();
      for (const entry of manifest.entries) {
        if (entry.pluginName) {
          const existing = pluginMap.get(entry.pluginName) || { skills: [], agents: [], commands: [], hooks: [], libs: [] };
          switch (entry.type) {
            case "skill": existing.skills.push(entry.name); break;
            case "agent": existing.agents.push(entry.name); break;
            case "command": existing.commands.push(entry.name); break;
            case "hook": existing.hooks.push(entry.name); break;
            case "lib": existing.libs.push(entry.name); break;
          }
          pluginMap.set(entry.pluginName, existing);
        }
      }
      const plugins = Array.from(pluginMap.entries()).map(([name, data]) => ({
        name,
        skills: data.skills,
        agents: data.agents,
        commands: data.commands,
        hooks: data.hooks,
        libs: data.libs,
      }));

      res.json({ tools, skills, mcps, memory, migrated, plugins });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // GET /api/state/status
  app.get("/api/state/status", async (_req, res) => {
    try {
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
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // POST /api/toggle — enable/disable an MCP for a specific tool
  app.post("/api/toggle", async (req, res) => {
    try {
      const { type, name, toolId, enabled } = req.body as {
        type: "mcp" | "skill" | "memory";
        name: string;
        toolId?: ToolId;
        enabled: boolean;
      };

      if (type !== "mcp") {
        return res.json({ success: true, action: req.body, message: "Only MCP toggles are supported" });
      }

      const targetTool = toolId || "claude-code";
      const adapter = getAdapter(targetTool as ToolId);

      // Track disabled state
      const disabledMcps = await loadDisabledMcps();

      if (enabled) {
        // Re-enable: read MCP config from mcps.yaml and add it back
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

          // Remove from disabled list
          if (disabledMcps[name]) {
            disabledMcps[name] = disabledMcps[name].filter((t: string) => t !== targetTool);
            if (disabledMcps[name].length === 0) delete disabledMcps[name];
          }
          await saveDisabledMcps(disabledMcps);

          return res.json({ success: result.success, method: result.method, message: result.message || result.error });
        }
        return res.status(404).json({ error: `MCP ${name} not found in mcps.yaml` });
      } else {
        // Disable: remove from tool
        const result = await adapter.remove(name);

        // Add to disabled list
        if (!disabledMcps[name]) disabledMcps[name] = [];
        if (!disabledMcps[name].includes(targetTool as ToolId)) {
          disabledMcps[name].push(targetTool as ToolId);
        }
        await saveDisabledMcps(disabledMcps);

        return res.json({ success: result.success, method: result.method, message: result.message || result.error });
      }
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // GET /api/migrate/scan
  app.get("/api/migrate/scan", async (_req, res) => {
    try {
      const results = await scanAllTools();
      res.json(results);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // POST /api/migrate/apply
  app.post("/api/migrate/apply", async (req, res) => {
    try {
      const plan = req.body as MigrationPlan;
      const result = await executeMigration(plan);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // POST /api/migrate/clear
  app.post("/api/migrate/clear", async (req, res) => {
    try {
      const toolId = req.query.tool as string | undefined;
      const result = await clearMigration(toolId ? { toolId: toolId as any } : undefined);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // GET /api/marketplace/search
  app.get("/api/marketplace/search", async (req, res) => {
    try {
      const query = (req.query.q as string) || "";
      const source = req.query.source as string | undefined;
      const results = await searchMarketplace(query, source as MarketplaceSource | undefined);
      res.json(results);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // POST /api/marketplace/install
  app.post("/api/marketplace/install", async (req, res) => {
    try {
      const { name, source, description, type } = req.body || {};
      if (!name || !source) {
        res.status(400).json({ success: false, error: "Missing required fields: name, source" });
        return;
      }
      const entry: MarketplaceEntry = { name, source, description: description || "", type: type || "skill" };
      const result = await installFromMarketplace(entry);
      res.json(result);
    } catch (e) {
      res.json({ success: false, error: (e as Error).message });
    }
  });

  // GET /api/marketplace/registry
  app.get("/api/marketplace/registry", async (_req, res) => {
    try {
      const registry = await loadMarketplaceRegistry();
      res.json(registry);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // POST /api/marketplace/registry
  app.post("/api/marketplace/registry", async (req, res) => {
    try {
      const { name, ...config } = req.body as { name: string } & MarketplaceConfig;
      await addMarketplace(name, config);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // DELETE /api/marketplace/registry/:name
  app.delete("/api/marketplace/registry/:name", async (req, res) => {
    try {
      await removeMarketplace(req.params.name);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // GET /api/marketplace/popular
  app.get("/api/marketplace/popular", async (_req, res) => {
    try {
      const results = await getPopularSkills();
      res.json(results);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // POST /api/marketplace/update
  app.post("/api/marketplace/update", async (req, res) => {
    try {
      const { name, source } = req.body || {};
      if (!name || !source) {
        res.status(400).json({ success: false, error: "Missing required fields: name, source" });
        return;
      }
      const result = await updateSkill(name, source);
      res.json(result);
    } catch (e) {
      res.json({ success: false, error: (e as Error).message });
    }
  });

  // GET /api/plugins
  app.get("/api/plugins", async (_req, res) => {
    try {
      // Build plugin list from manifest — classify all component types
      const manifest = await loadManifest();
      const pluginMap = new Map<string, {
        marketplace: string;
        skills: string[];
        agents: string[];
        commands: string[];
        hooks: string[];
        libs: string[];
      }>();
      for (const entry of manifest.entries) {
        if (entry.pluginName) {
          const existing = pluginMap.get(entry.pluginName) || {
            marketplace: entry.marketplace || "",
            skills: [],
            agents: [],
            commands: [],
            hooks: [],
            libs: [],
          };
          switch (entry.type) {
            case "skill": existing.skills.push(entry.name); break;
            case "agent": existing.agents.push(entry.name); break;
            case "command": existing.commands.push(entry.name); break;
            case "hook": existing.hooks.push(entry.name); break;
            case "lib": existing.libs.push(entry.name); break;
          }
          if (entry.marketplace) existing.marketplace = entry.marketplace;
          pluginMap.set(entry.pluginName, existing);
        }
      }
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
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // POST /api/plugins/toggle
  app.post("/api/plugins/toggle", async (req, res) => {
    try {
      const { name, enabled } = req.body as { name: string; enabled: boolean };
      await togglePlugin(name, enabled);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // POST /api/plugins/toggle-skill
  app.post("/api/plugins/toggle-skill", async (req, res) => {
    try {
      const { pluginName, skillName, enabled } = req.body as {
        pluginName: string;
        skillName: string;
        enabled: boolean;
      };
      await toggleSkillInPlugin(pluginName, skillName, enabled);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // POST /api/sync — trigger sync from dashboard
  app.post("/api/sync", async (_req, res) => {
    try {
      const { execSync } = await import("node:child_process");
      execSync("npx mycelium sync", { stdio: "pipe", timeout: 30000 });
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ success: false, error: (e as Error).message });
    }
  });

  // DELETE /api/remove/skill/:name
  app.delete("/api/remove/skill/:name", async (req, res) => {
    try {
      const { removeSkill } = await import("./commands/remove.js");
      const result = await removeSkill(req.params.name);
      res.json(result);
    } catch (e) {
      res.status(500).json({ removed: false, error: (e as Error).message });
    }
  });

  // DELETE /api/remove/mcp/:name
  app.delete("/api/remove/mcp/:name", async (req, res) => {
    try {
      const { removeMcp } = await import("./commands/remove.js");
      const result = await removeMcp(req.params.name);
      res.json(result);
    } catch (e) {
      res.status(500).json({ removed: false, error: (e as Error).message });
    }
  });

  // DELETE /api/remove/hook/:name
  app.delete("/api/remove/hook/:name", async (req, res) => {
    try {
      const { removeHook } = await import("./commands/remove.js");
      const result = await removeHook(req.params.name);
      res.json(result);
    } catch (e) {
      res.status(500).json({ removed: false, error: (e as Error).message });
    }
  });

  // DELETE /api/remove/plugin/:name
  app.delete("/api/remove/plugin/:name", async (req, res) => {
    try {
      const { removePlugin } = await import("./commands/remove.js");
      const result = await removePlugin(req.params.name);
      res.json(result);
    } catch (e) {
      res.status(500).json({ removed: [], errors: [(e as Error).message] });
    }
  });

  return app;
}

export function startServer(port = 3378) {
  const app = createServer(port);

  // Serve dashboard static files
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const dashboardDist = path.resolve(__dirname, "..", "..", "dashboard", "dist");

  // Static assets first
  app.use(express.static(dashboardDist));

  // SPA fallback — non-API routes get index.html
  app.use((req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    const indexPath = path.join(dashboardDist, "index.html");
    res.sendFile(indexPath, (err) => {
      if (err) res.status(404).send("Dashboard not built. Run: pnpm -C packages/dashboard build");
    });
  });

  const server = app.listen(port, () => {
    console.log(`Mycelium dashboard running on http://localhost:${port}`);
  });
  return server;
}
