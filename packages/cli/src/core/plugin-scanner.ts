/**
 * Plugin Scanner — scans plugin cache dirs for all component types.
 *
 * Convention-based with manifest enrichment (Approach D):
 *   1. Read plugin.json for metadata (name, version, description)
 *   2. Scan well-known dirs: skills/, agents/, commands/, hooks/, lib/
 *   3. Return unified PluginComponent[] for each plugin
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";

import type { PluginComponent, PluginComponentType, PluginManifest } from "@mycelium/core";
import { readFileIfExists } from "./fs-helpers.js";

// ============================================================================
// Well-known component directories and their scan rules
// ============================================================================

interface ComponentRule {
  dir: string;
  type: PluginComponentType;
  /** File pattern to match inside the dir */
  pattern: RegExp;
  /** How to extract the component name from the matched file path */
  nameFrom: "parent-dir" | "filename";
}

const COMPONENT_RULES: ComponentRule[] = [
  { dir: "skills",   type: "skill",   pattern: /SKILL\.md$/,    nameFrom: "parent-dir" },
  { dir: "agents",   type: "agent",   pattern: /\.md$/,         nameFrom: "filename" },
  { dir: "commands", type: "command", pattern: /\.md$/,         nameFrom: "filename" },
  { dir: "hooks",    type: "hook",    pattern: /\.(sh|cmd|js|json)$/, nameFrom: "filename" },
  { dir: "lib",      type: "lib",     pattern: /\.(js|ts)$/,    nameFrom: "filename" },
];

// ============================================================================
// Scan helpers
// ============================================================================

async function scanDir(dir: string, pattern: RegExp): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const sub = await scanDir(full, pattern);
        results.push(...sub);
      } else if (pattern.test(entry.name)) {
        results.push(full);
      }
    }
  } catch {
    // dir doesn't exist
  }
  return results;
}

function nameFromPath(filePath: string, mode: "parent-dir" | "filename"): string {
  if (mode === "parent-dir") {
    return path.basename(path.dirname(filePath));
  }
  return path.basename(filePath, path.extname(filePath));
}

async function readDescription(filePath: string): Promise<string | undefined> {
  if (!filePath.endsWith(".md")) return undefined;
  const content = await readFileIfExists(filePath);
  if (!content) return undefined;
  // Try frontmatter description
  const fmMatch = content.match(/^---\s*\n[\s\S]*?description:\s*"?([^"\n]+)"?\s*\n[\s\S]*?---/);
  if (fmMatch) return fmMatch[1].trim();
  // Fall back to first non-empty, non-heading line
  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && !trimmed.startsWith("---")) {
      return trimmed.slice(0, 120);
    }
  }
  return undefined;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Read plugin.json from a plugin root to get metadata.
 * Looks in `.claude-plugin/plugin.json` (Claude Code convention) and root `plugin.json`.
 */
export async function readPluginManifest(pluginRoot: string): Promise<PluginManifest | null> {
  for (const candidate of [
    path.join(pluginRoot, ".claude-plugin", "plugin.json"),
    path.join(pluginRoot, "plugin.json"),
  ]) {
    const raw = await readFileIfExists(candidate);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        return {
          name: parsed.name ?? path.basename(pluginRoot),
          version: parsed.version ?? "",
          description: parsed.description,
          author: parsed.author?.name ?? parsed.author,
          components: [], // filled by scanPluginComponents
        };
      } catch {
        // invalid JSON
      }
    }
  }
  return null;
}

/**
 * Scan a plugin directory for all component types.
 * Works with convention dirs (skills/, agents/, commands/, hooks/, lib/).
 */
export async function scanPluginComponents(
  pluginRoot: string,
  pluginName?: string,
  marketplace?: string,
): Promise<PluginComponent[]> {
  const components: PluginComponent[] = [];
  const name = pluginName ?? path.basename(pluginRoot);

  for (const rule of COMPONENT_RULES) {
    const dir = path.join(pluginRoot, rule.dir);
    const files = await scanDir(dir, rule.pattern);
    for (const filePath of files) {
      const componentName = nameFromPath(filePath, rule.nameFrom);
      const description = await readDescription(filePath);
      components.push({
        name: componentName,
        type: rule.type,
        path: filePath,
        description,
        pluginName: name,
        marketplace,
      });
    }
  }

  return components;
}

/**
 * Scan the entire Claude Code plugin cache and return all components
 * from all installed plugins.
 *
 * Cache structure: ~/.claude/plugins/cache/{marketplace}/{plugin}/{version}/
 */
export async function scanPluginCache(cacheDir: string): Promise<PluginComponent[]> {
  const allComponents: PluginComponent[] = [];

  try {
    const marketplaces = await fs.readdir(cacheDir, { withFileTypes: true });
    for (const mp of marketplaces) {
      if (!mp.isDirectory()) continue;
      const mpDir = path.join(cacheDir, mp.name);

      try {
        const plugins = await fs.readdir(mpDir, { withFileTypes: true });
        for (const plugin of plugins) {
          if (!plugin.isDirectory()) continue;
          const pluginDir = path.join(mpDir, plugin.name);

          // Find latest version dir
          try {
            const versions = await fs.readdir(pluginDir, { withFileTypes: true });
            const versionDirs = versions.filter((v) => v.isDirectory()).map((v) => v.name).sort();
            const latestVersion = versionDirs[versionDirs.length - 1];
            if (!latestVersion) continue;

            const versionRoot = path.join(pluginDir, latestVersion);
            const components = await scanPluginComponents(versionRoot, plugin.name, mp.name);
            allComponents.push(...components);
          } catch {
            // can't read versions
          }
        }
      } catch {
        // can't read plugins
      }
    }
  } catch {
    // cache dir doesn't exist
  }

  return allComponents;
}

/** Get well-known component rules (for testing/introspection) */
export function getComponentRules(): readonly ComponentRule[] {
  return COMPONENT_RULES;
}
