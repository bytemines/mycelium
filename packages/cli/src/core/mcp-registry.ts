/**
 * MCP Registry Integration
 * Search and install from the official MCP registry
 */
import type { McpServerConfig } from "@mycelium/core";

const REGISTRY_URL = "https://registry.modelcontextprotocol.io";

export interface RegistryEntry {
  name: string;
  command: string;
  args?: string[];
  description?: string;
  env?: Record<string, string>;
}

export function parseRegistryEntry(entry: RegistryEntry): McpServerConfig {
  return {
    command: entry.command,
    args: entry.args,
    env: entry.env,
    enabled: true,
  };
}

export async function searchRegistry(query: string): Promise<RegistryEntry[]> {
  const res = await fetch(`${REGISTRY_URL}/api/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error(`Registry search failed: ${res.statusText}`);
  return res.json() as Promise<RegistryEntry[]>;
}

export async function getRegistryEntry(name: string): Promise<RegistryEntry | null> {
  try {
    const res = await fetch(`${REGISTRY_URL}/api/servers/${encodeURIComponent(name)}`);
    if (!res.ok) return null;
    return res.json() as Promise<RegistryEntry | null>;
  } catch {
    return null;
  }
}
