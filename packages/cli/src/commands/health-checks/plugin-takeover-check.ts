/**
 * Health check for taken-over plugins.
 * Verifies 8 invariants:
 * 1. Every symlink in ~/.claude/{skills,agents,commands}/ has valid target
 * 2. Every disabled item with pluginOrigin has NO symlink
 * 3. Every enabled item with pluginOrigin HAS symlink pointing to plugin cache
 * 4. Taken-over plugins have enabledPlugins[id] === false in settings.json
 * 5. Released plugins have enabledPlugins[id] === true
 * 6. Live cache components match takenOverPlugins entries
 * 7. No phantom entries (skill name matches pluginId pattern)
 * 8. No orphaned symlinks (symlinks pointing to non-existent targets)
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { expandPath } from "@mycelish/core";
import { loadStateManifest, ITEM_SECTIONS, type ItemConfig } from "../../core/manifest-state.js";
import { readFileIfExists } from "../../core/fs-helpers.js";
import { scanPluginComponents } from "../../core/plugin-scanner.js";
import { PLUGIN_COMPONENT_DIRS, getSymlinkPath } from "../../core/plugin-takeover.js";
import { getTracer } from "../../core/global-tracer.js";
import type { DiagnosticResult } from "./types.js";

const CLAUDE_HOME = path.join(os.homedir(), ".claude");
const SETTINGS_PATH = path.join(CLAUDE_HOME, "settings.json");
const PLUGIN_CACHE_DIR = path.join(CLAUDE_HOME, "plugins", "cache");

export async function checkTakenOverPlugins(): Promise<DiagnosticResult[]> {
  const results: DiagnosticResult[] = [];
  const manifest = await loadStateManifest(expandPath("~/.mycelium"));
  if (!manifest) {
    return results;
  }

  // Load Claude Code settings to verify plugin states
  let enabledPlugins: Record<string, boolean> = {};
  try {
    const raw = await readFileIfExists(SETTINGS_PATH);
    if (raw) {
      const settings = JSON.parse(raw);
      enabledPlugins = settings.enabledPlugins ?? {};
    }
  } catch {
    // settings unreadable
  }

  // Check 4: Taken-over plugins disabled + Check 6: Cache components match
  if (manifest.takenOverPlugins && Object.keys(manifest.takenOverPlugins).length > 0) {
    for (const [pluginId, info] of Object.entries(manifest.takenOverPlugins)) {
      // Check cache dir exists
      const cacheExists = await fs.access(info.cachePath).then(() => true, () => false);
      if (!cacheExists) {
        results.push({
          name: `plugin-takeover:${pluginId}`,
          status: "warn",
          message: `Taken-over plugin cache missing: ${info.cachePath}`,
          fix: `Run 'mycelium plugin release ${pluginId}' to release the plugin`,
        });
        continue;
      }

      // Check 4: Plugin is still disabled in settings
      if (enabledPlugins[pluginId] === true) {
        results.push({
          name: `plugin-takeover:${pluginId}`,
          status: "warn",
          message: `Plugin ${pluginId} was re-enabled in Claude Code settings but is still marked as taken over`,
          fix: `Run 'mycelium plugin release ${pluginId}' or disable it again in Claude Code`,
        });
        continue;
      }

      // Check 6: Live cache components match takenOverPlugins entries
      try {
        const components = await scanPluginComponents(info.cachePath);
        const liveComponentNames = components.map(c => c.name);
        const registeredComponents = info.allComponents ?? info.allSkills;

        const missing = registeredComponents.filter(name => !liveComponentNames.includes(name));
        const extra = liveComponentNames.filter(name => !registeredComponents.includes(name));

        if (missing.length > 0 || extra.length > 0) {
          const issues = [];
          if (missing.length > 0) issues.push(`missing: ${missing.join(", ")}`);
          if (extra.length > 0) issues.push(`extra: ${extra.join(", ")}`);

          results.push({
            name: `plugin-takeover:${pluginId}:cache-mismatch`,
            status: "warn",
            message: `Plugin ${pluginId} cache components don't match manifest (${issues.join("; ")})`,
            fix: `Run 'mycelium plugin release ${pluginId}' and re-take it over`,
          });
        }
      } catch (err) {
        results.push({
          name: `plugin-takeover:${pluginId}:scan-error`,
          status: "warn",
          message: `Failed to scan plugin cache: ${(err as Error).message}`,
        });
      }

      results.push({
        name: `plugin-takeover:${pluginId}`,
        status: "pass",
        message: `Plugin ${pluginId} taken over: ${info.allSkills?.length ?? info.allComponents?.length ?? 0} components managed`,
      });
    }
  }

  // Collect all items with pluginOrigin for checks 2 & 3
  const itemsWithPluginOrigin: Array<{
    name: string;
    type: "skill" | "agent" | "command";
    state: string;
    pluginOrigin: { pluginId: string; cachePath: string };
  }> = [];

  for (const { key, type } of ITEM_SECTIONS) {
    if (type !== "skill" && type !== "agent" && type !== "command") continue;

    const section = manifest[key];
    if (!section || typeof section !== "object" || Array.isArray(section)) continue;

    for (const [itemName, config] of Object.entries(section as Record<string, ItemConfig>)) {
      if (config.pluginOrigin) {
        itemsWithPluginOrigin.push({
          name: itemName,
          type: type as "skill" | "agent" | "command",
          state: config.state ?? "enabled",
          pluginOrigin: config.pluginOrigin,
        });
      }
    }
  }

  // Check 2: Disabled items with pluginOrigin should have NO symlink
  const disabledWithOrigin = itemsWithPluginOrigin.filter(
    item => item.state === "disabled" || item.state === "deleted"
  );
  for (const item of disabledWithOrigin) {
    const symlinkPath = getSymlinkPath(item.type, item.name);

    try {
      await fs.lstat(symlinkPath);
      // Symlink exists but item is disabled
      results.push({
        name: `plugin-origin:${item.name}:disabled-has-symlink`,
        status: "fail",
        message: `Disabled ${item.type} "${item.name}" still has symlink at ${symlinkPath}`,
        fix: `Run 'mycelium sync' to clean up orphaned symlinks`,
      });
    } catch {
      // Symlink doesn't exist - this is correct
    }
  }

  // Check 3: Enabled items with pluginOrigin should HAVE symlink
  const enabledWithOrigin = itemsWithPluginOrigin.filter(
    item => item.state === "enabled"
  );
  for (const item of enabledWithOrigin) {
    const symlinkPath = getSymlinkPath(item.type, item.name);

    try {
      const stats = await fs.lstat(symlinkPath);
      if (!stats.isSymbolicLink()) {
        results.push({
          name: `plugin-origin:${item.name}:not-symlink`,
          status: "warn",
          message: `Enabled ${item.type} "${item.name}" exists but is not a symlink`,
          fix: `Run 'mycelium sync' to fix`,
        });
        continue;
      }

      // Verify it points to the plugin cache
      const target = await fs.readlink(symlinkPath);
      const expectedCachePrefix = item.pluginOrigin.cachePath;
      if (!target.startsWith(expectedCachePrefix)) {
        results.push({
          name: `plugin-origin:${item.name}:wrong-target`,
          status: "warn",
          message: `Enabled ${item.type} "${item.name}" symlink points to wrong location: ${target}`,
          fix: `Run 'mycelium sync' to fix`,
        });
      }
    } catch {
      // Symlink doesn't exist but item is enabled
      results.push({
        name: `plugin-origin:${item.name}:missing-symlink`,
        status: "fail",
        message: `Enabled ${item.type} "${item.name}" missing symlink at ${symlinkPath}`,
        fix: `Run 'mycelium sync' to create symlink`,
      });
    }
  }

  // Check 1 & 8: Every symlink has valid target (combined check)
  for (const [type, { dir }] of Object.entries(PLUGIN_COMPONENT_DIRS)) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isSymbolicLink()) continue;

        const symlinkPath = path.join(dir, entry.name);
        try {
          // lstat checks the symlink itself
          await fs.lstat(symlinkPath);
          // stat follows the symlink to check the target
          await fs.stat(symlinkPath);
          // Both succeed - valid symlink
        } catch (err) {
          // Check 8: Orphaned symlink (target doesn't exist)
          try {
            const target = await fs.readlink(symlinkPath);
            results.push({
              name: `symlink:${type}:${entry.name}:orphaned`,
              status: "warn",
              message: `Orphaned ${type} symlink "${entry.name}" points to non-existent target: ${target}`,
              fix: `Run 'mycelium sync' to clean up`,
            });
          } catch {
            // Can't even read the symlink
            results.push({
              name: `symlink:${type}:${entry.name}:invalid`,
              status: "fail",
              message: `Invalid ${type} symlink "${entry.name}" - cannot read link`,
              fix: `Manually remove ${symlinkPath}`,
            });
          }
        }
      }
    } catch {
      // Directory doesn't exist - not an error for health check
    }
  }

  // Check 5: Released plugins should have enabledPlugins[id] === true
  // We check this by finding plugins that are NOT in takenOverPlugins but have items with pluginOrigin
  const takenOverIds = new Set(Object.keys(manifest.takenOverPlugins ?? {}));
  const releasedPluginIds = new Set<string>();

  for (const item of itemsWithPluginOrigin) {
    const pluginId = item.pluginOrigin.pluginId;
    if (!takenOverIds.has(pluginId)) {
      releasedPluginIds.add(pluginId);
    }
  }

  for (const pluginId of releasedPluginIds) {
    if (enabledPlugins[pluginId] === false) {
      results.push({
        name: `plugin-release:${pluginId}:still-disabled`,
        status: "warn",
        message: `Plugin ${pluginId} was released but is still disabled in Claude Code settings`,
        fix: `Enable ${pluginId} in Claude Code or run 'mycelium plugin takeover ${pluginId}' again`,
      });
    }
  }

  // Check 7: No phantom entries (skill name matches pluginId pattern)
  for (const { key, type } of ITEM_SECTIONS) {
    if (type !== "skill") continue; // Only check skills section for phantom entries

    const section = manifest[key];
    if (!section || typeof section !== "object" || Array.isArray(section)) continue;

    for (const itemName of Object.keys(section as Record<string, ItemConfig>)) {
      // Check if name matches pattern "name@marketplace"
      if (itemName.includes("@") && itemName.split("@").length === 2) {
        const [plugin, marketplace] = itemName.split("@");
        if (plugin && marketplace) {
          results.push({
            name: `phantom:${itemName}`,
            status: "fail",
            message: `Phantom entry detected: skill name "${itemName}" matches plugin ID pattern`,
            fix: `Remove "${itemName}" from manifest.yaml - plugin names should not be registered as skills`,
          });
        }
      }
    }
  }

  // Log health check results to trace DB
  if (results.length > 0) {
    const log = getTracer().createTrace("doctor");
    const fails = results.filter(r => r.status === "fail").length;
    const warns = results.filter(r => r.status === "warn").length;
    const passes = results.filter(r => r.status === "pass").length;
    const level = fails > 0 ? "error" : warns > 0 ? "warn" : "info";
    log[level]({ scope: "plugin", op: "health-check", msg: `Plugin takeover health: ${passes} pass, ${warns} warn, ${fails} fail` });
    for (const r of results.filter(r => r.status === "fail" || r.status === "warn")) {
      log[r.status === "fail" ? "error" : "warn"]({ scope: "plugin", op: "health-check", msg: r.message, item: r.name });
    }
  }

  return results;
}
