import type { ToggleAction, DashboardState, ToolScanResult, MigrationPlan, MigrationResult, MarketplaceSearchResult, MarketplaceConfig, PluginInfo } from "@mycelium/core";

const API_BASE = "http://localhost:3378";

export async function fetchDashboardState(): Promise<DashboardState> {
  const res = await fetch(`${API_BASE}/api/state`);
  return res.json();
}

export async function sendToggle(action: ToggleAction): Promise<void> {
  await fetch(`${API_BASE}/api/toggle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(action),
  });
}

export async function scanTools(): Promise<ToolScanResult[]> {
  const res = await fetch(`${API_BASE}/api/migrate/scan`);
  return res.json();
}

export async function applyMigration(plan: MigrationPlan): Promise<MigrationResult> {
  const res = await fetch(`${API_BASE}/api/migrate/apply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(plan),
  });
  return res.json();
}

export async function clearMigration(toolId?: string): Promise<{ cleared: string[]; errors: string[] }> {
  const url = toolId ? `${API_BASE}/api/migrate/clear?tool=${toolId}` : `${API_BASE}/api/migrate/clear`;
  const res = await fetch(url, { method: "POST" });
  return res.json();
}

export async function searchMarketplace(query: string, source?: string): Promise<MarketplaceSearchResult[]> {
  const params = new URLSearchParams({ q: query });
  if (source) params.set("source", source);
  const res = await fetch(`${API_BASE}/api/marketplace/search?${params}`);
  return res.json();
}

export async function installMarketplaceEntry(name: string, source: string): Promise<{ success: boolean; error?: string }> {
  const res = await fetch(`${API_BASE}/api/marketplace/install`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, source }),
  });
  return res.json();
}

export async function fetchMarketplaceRegistry(): Promise<Record<string, MarketplaceConfig>> {
  const res = await fetch(`${API_BASE}/api/marketplace/registry`);
  return res.json();
}

export async function addMarketplaceToRegistry(name: string, config: MarketplaceConfig): Promise<void> {
  await fetch(`${API_BASE}/api/marketplace/registry`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, ...config }),
  });
}

export async function removeMarketplaceFromRegistry(name: string): Promise<void> {
  await fetch(`${API_BASE}/api/marketplace/registry/${encodeURIComponent(name)}`, { method: "DELETE" });
}

export async function fetchPlugins(marketplace?: string): Promise<PluginInfo[]> {
  const params = marketplace ? `?marketplace=${marketplace}` : "";
  const res = await fetch(`${API_BASE}/api/plugins${params}`);
  return res.json();
}

export async function togglePlugin(name: string, enabled: boolean): Promise<void> {
  await fetch(`${API_BASE}/api/plugins/toggle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, enabled }),
  });
}

export async function togglePluginSkill(pluginName: string, skillName: string, enabled: boolean): Promise<void> {
  await fetch(`${API_BASE}/api/plugins/toggle-skill`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pluginName, skillName, enabled }),
  });
}
