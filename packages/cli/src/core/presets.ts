/**
 * Presets Module
 *
 * One-click config switching with named presets.
 * Presets store which skills, MCPs, and memory scopes should be active.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { stringify, parse } from "yaml";
import { expandPath } from "@mycelium/core";

export interface Preset {
  name: string;
  skills: string[];
  mcps: string[];
  memory: { scopes: string[] };
}

export interface PresetConfig {
  skills: string[];
  mcps: string[];
  memory: { scopes: string[] };
}

export interface ApplyActions {
  enableSkills: string[];
  disableSkills: string[];
  enableMcps: string[];
  disableMcps: string[];
}

/**
 * Create a preset from the given config.
 */
export function createPreset(name: string, config: PresetConfig): Preset {
  return {
    name,
    skills: [...config.skills],
    mcps: [...config.mcps],
    memory: { scopes: [...config.memory.scopes] },
  };
}

/**
 * Compute which items to enable/disable when applying a preset.
 */
export function applyPreset(
  preset: Preset,
  available: { allSkills: string[]; allMcps: string[] }
): ApplyActions {
  const presetSkills = new Set(preset.skills);
  const presetMcps = new Set(preset.mcps);

  return {
    enableSkills: available.allSkills.filter((s) => presetSkills.has(s)),
    disableSkills: available.allSkills.filter((s) => !presetSkills.has(s)),
    enableMcps: available.allMcps.filter((m) => presetMcps.has(m)),
    disableMcps: available.allMcps.filter((m) => !presetMcps.has(m)),
  };
}

/**
 * Export a preset as YAML string for sharing.
 */
export function exportPreset(preset: Preset): string {
  return stringify(preset);
}

/**
 * Get the presets directory path.
 */
function getPresetsDir(): string {
  return expandPath("~/.mycelium/presets");
}

/**
 * Save a preset to disk.
 */
export async function savePreset(preset: Preset): Promise<void> {
  const dir = getPresetsDir();
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${preset.name}.yaml`);
  await fs.writeFile(filePath, exportPreset(preset), "utf-8");
}

/**
 * Load a preset from disk.
 */
export async function loadPreset(name: string): Promise<Preset | null> {
  const filePath = path.join(getPresetsDir(), `${name}.yaml`);
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return parse(content) as Preset;
  } catch {
    return null;
  }
}

/**
 * List all saved presets.
 */
export async function listPresets(): Promise<string[]> {
  const dir = getPresetsDir();
  try {
    const files = await fs.readdir(dir);
    return files
      .filter((f) => f.endsWith(".yaml"))
      .map((f) => f.replace(/\.yaml$/, ""));
  } catch {
    return [];
  }
}
