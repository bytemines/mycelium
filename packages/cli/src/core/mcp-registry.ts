/**
 * MCP Registry Integration
 * Search and install from the official MCP registry (v0.1 API)
 */
import type { McpServerConfig } from "@mycelish/core";

const REGISTRY_URL = "https://registry.modelcontextprotocol.io";

export interface RegistryEntry {
  name: string;
  command: string;
  args?: string[];
  description?: string;
  env?: Record<string, string>;
  version?: string;
}

export function parseRegistryEntry(entry: RegistryEntry): McpServerConfig {
  return {
    command: entry.command,
    args: entry.args,
    env: entry.env,
    enabled: true,
  };
}

interface McpRegistryServerResponse {
  servers: Array<{
    server: {
      name: string;
      description?: string;
      version?: string;
      packages?: Array<{
        registryType: string;
        name?: string;
        command?: string;
        args?: string[];
        env?: Array<{ name: string; description?: string; required?: boolean }>;
      }>;
    };
  }>;
}

export async function searchRegistry(query: string): Promise<RegistryEntry[]> {
  const url = query
    ? `${REGISTRY_URL}/v0.1/servers?q=${encodeURIComponent(query)}&limit=20`
    : `${REGISTRY_URL}/v0.1/servers?limit=20`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Registry search failed: ${res.statusText}`);
  const data = (await res.json()) as McpRegistryServerResponse;
  return (data.servers || []).map(s => {
    const srv = s.server;
    const pkg = srv.packages?.[0];
    return {
      name: srv.name,
      description: srv.description,
      version: srv.version,
      command: pkg?.command || "npx",
      args: pkg?.args || [srv.name],
    };
  });
}

export async function getRegistryEntry(name: string): Promise<RegistryEntry | null> {
  try {
    const res = await fetch(`${REGISTRY_URL}/v0.1/servers?q=${encodeURIComponent(name)}&limit=5`);
    if (!res.ok) return null;
    const data = (await res.json()) as McpRegistryServerResponse;
    const match = data.servers?.find(s => s.server.name === name);
    if (!match) return null;
    const pkg = match.server.packages?.[0];
    return {
      name: match.server.name,
      description: match.server.description,
      version: match.server.version,
      command: pkg?.command || "npx",
      args: pkg?.args || [match.server.name],
    };
  } catch {
    return null;
  }
}
