/**
 * Machine-level config overrides — per-hostname MCP path corrections.
 * Stored at ~/.mycelium/machines/{hostname}.yaml (gitignored).
 */
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { execFileSync } from "node:child_process";

import type { McpServerConfig, MachineOverrideEntry, MachineOverridesFile } from "@mycelium/core";
import { readFileIfExists, mkdirp, MYCELIUM_HOME } from "./fs-helpers.js";

// ============================================================================
// Paths
// ============================================================================

const MYCELIUM_DIR = MYCELIUM_HOME;

export function getMachineOverridesPath(): string {
  return path.join(MYCELIUM_DIR, "machines", `${os.hostname()}.yaml`);
}

// ============================================================================
// YAML serialization (hand-rolled, flat structure)
// ============================================================================

function serializeOverrides(overrides: MachineOverridesFile): string {
  let yaml = `hostname: ${overrides.hostname}\n`;
  yaml += `detectedAt: ${overrides.detectedAt}\n`;
  yaml += `updatedAt: ${overrides.updatedAt}\n`;
  yaml += `mcps:\n`;
  for (const [name, entry] of Object.entries(overrides.mcps)) {
    yaml += `  ${name}:\n`;
    yaml += `    command: ${entry.command}\n`;
    yaml += `    detectedAt: ${entry.detectedAt}\n`;
  }
  return yaml;
}

function parseOverrides(content: string): MachineOverridesFile {
  const result: MachineOverridesFile = {
    hostname: "",
    detectedAt: "",
    updatedAt: "",
    mcps: {},
  };

  let currentMcp = "";
  let inMcps = false;

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    if (trimmed.startsWith("hostname:")) {
      result.hostname = trimmed.slice("hostname:".length).trim();
      inMcps = false;
    } else if (trimmed.startsWith("detectedAt:") && !inMcps) {
      result.detectedAt = trimmed.slice("detectedAt:".length).trim();
    } else if (trimmed.startsWith("updatedAt:")) {
      result.updatedAt = trimmed.slice("updatedAt:".length).trim();
      inMcps = false;
    } else if (trimmed === "mcps:") {
      inMcps = true;
    } else if (inMcps) {
      // Indentation-based parsing: 2-space = mcp name, 4-space = property
      if (line.startsWith("    ") && currentMcp) {
        const kv = trimmed;
        if (kv.startsWith("command:")) {
          result.mcps[currentMcp].command = kv.slice("command:".length).trim();
        } else if (kv.startsWith("detectedAt:")) {
          result.mcps[currentMcp].detectedAt = kv.slice("detectedAt:".length).trim();
        }
      } else if (line.startsWith("  ") && !line.startsWith("    ")) {
        const name = trimmed.replace(/:$/, "").trim();
        currentMcp = name;
        result.mcps[name] = { command: "", detectedAt: "" };
      }
    }
  }

  return result;
}

// ============================================================================
// Load / Save
// ============================================================================

function emptyOverrides(): MachineOverridesFile {
  return {
    hostname: os.hostname(),
    detectedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    mcps: {},
  };
}

export async function loadMachineOverrides(): Promise<MachineOverridesFile> {
  const content = await readFileIfExists(getMachineOverridesPath());
  if (!content) return emptyOverrides();
  return parseOverrides(content);
}

export async function saveMachineOverrides(overrides: MachineOverridesFile): Promise<void> {
  const filePath = getMachineOverridesPath();
  await mkdirp(path.dirname(filePath));
  await fs.writeFile(filePath, serializeOverrides(overrides), "utf-8");
}

// ============================================================================
// Detection
// ============================================================================

export interface DetectedOverride {
  name: string;
  oldCommand: string;
  newCommand: string;
}

function whichCommand(cmd: string): string | null {
  try {
    return execFileSync("which", [cmd], { encoding: "utf-8" }).trim();
  } catch {
    return null;
  }
}

export function detectMcpOverrides(
  mcps: Record<string, McpServerConfig>,
): DetectedOverride[] {
  const overrides: DetectedOverride[] = [];
  const now = new Date().toISOString();

  for (const [name, config] of Object.entries(mcps)) {
    const cmd = config.command;
    if (!cmd) continue;

    // Check if command exists at configured path
    const basename = path.basename(cmd);
    const resolved = whichCommand(basename);

    if (resolved && resolved !== cmd) {
      overrides.push({ name, oldCommand: cmd, newCommand: resolved });
    }
  }

  return overrides;
}

// ============================================================================
// Apply
// ============================================================================

export function applyMachineOverrides(
  mcps: Record<string, McpServerConfig>,
  overrides: MachineOverridesFile,
): Record<string, McpServerConfig> {
  const result = { ...mcps };
  for (const [name, entry] of Object.entries(overrides.mcps)) {
    if (result[name]) {
      result[name] = { ...result[name], command: entry.command };
    }
  }
  return result;
}

// ============================================================================
// Rescan
// ============================================================================

export async function rescanOverrides(
  mcps: Record<string, McpServerConfig>,
): Promise<MachineOverridesFile> {
  const detected = detectMcpOverrides(mcps);
  const now = new Date().toISOString();

  const overrides: MachineOverridesFile = {
    hostname: os.hostname(),
    detectedAt: now,
    updatedAt: now,
    mcps: {},
  };

  for (const d of detected) {
    overrides.mcps[d.name] = { command: d.newCommand, detectedAt: now };
  }

  await saveMachineOverrides(overrides);
  return overrides;
}
