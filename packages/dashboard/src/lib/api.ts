import type { ToggleAction, DashboardState, ToolScanResult, MigrationPlan, MigrationResult, MarketplaceEntry, MarketplaceConfig, PluginInfo, MarketplaceSource } from "@mycelish/core";

export async function fetchDashboardState(): Promise<DashboardState> {
  const res = await fetch(`/api/state`);
  return res.json();
}

export async function sendToggle(action: ToggleAction): Promise<void> {
  await fetch(`/api/toggle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(action),
  });
}

export async function scanTools(): Promise<ToolScanResult[]> {
  const res = await fetch(`/api/migrate/scan`);
  return res.json();
}

export async function applyMigration(plan: MigrationPlan): Promise<MigrationResult> {
  const res = await fetch(`/api/migrate/apply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(plan),
  });
  return res.json();
}

export async function clearMigration(toolId?: string): Promise<{ cleared: string[]; errors: string[] }> {
  const url = toolId ? `/api/migrate/clear?tool=${toolId}` : `/api/migrate/clear`;
  const res = await fetch(url, { method: "POST" });
  return res.json();
}

export async function searchMarketplace(query: string, source?: string): Promise<MarketplaceEntry[]> {
  const params = new URLSearchParams({ q: query });
  if (source) params.set("source", source);
  const res = await fetch(`/api/marketplace/search?${params}`);
  return res.json();
}

export async function installMarketplaceEntry(name: string, source: string, type?: string): Promise<{ success: boolean; error?: string }> {
  const res = await fetch(`/api/marketplace/install`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, source, type }),
  });
  return res.json();
}

export async function fetchMarketplaceRegistry(): Promise<Record<string, MarketplaceConfig>> {
  const res = await fetch(`/api/marketplace/registry`);
  return res.json();
}

export async function addMarketplaceToRegistry(name: string, config: MarketplaceConfig): Promise<void> {
  await fetch(`/api/marketplace/registry`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, ...config }),
  });
}

export async function removeMarketplaceFromRegistry(name: string): Promise<void> {
  await fetch(`/api/marketplace/registry/${encodeURIComponent(name)}`, { method: "DELETE" });
}

export async function fetchPlugins(marketplace?: string): Promise<PluginInfo[]> {
  const params = marketplace ? `?marketplace=${marketplace}` : "";
  const res = await fetch(`/api/plugins${params}`);
  return res.json();
}

export async function togglePlugin(name: string, enabled: boolean): Promise<{ success: boolean }> {
  const res = await fetch(`/api/plugins/toggle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, enabled }),
  });
  return res.json();
}

export async function togglePluginItem(
  pluginName: string, itemName: string, enabled: boolean,
  options?: { global?: boolean; tool?: string },
): Promise<{ success: boolean; error?: string }> {
  const res = await fetch(`/api/plugins/${encodeURIComponent(pluginName)}/items/${encodeURIComponent(itemName)}/toggle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled, ...options }),
  });
  return res.json();
}

export async function refreshMarketplaceCache(): Promise<{ cleared: number; refreshed: string[]; errors: string[] }> {
  const res = await fetch(`/api/marketplace/refresh`, { method: "POST" });
  return res.json();
}

export async function fetchPopularSkills(): Promise<MarketplaceEntry[]> {
  const res = await fetch(`/api/marketplace/popular`);
  return res.json();
}

export async function removeSkill(name: string): Promise<{ success: boolean; error?: string }> {
  const res = await fetch(`/api/remove/${encodeURIComponent(name)}?type=skill`, { method: "DELETE" });
  return res.json();
}

export async function purgeItem(name: string, type?: string): Promise<{ success: boolean; name: string; message?: string; error?: string }> {
  const params = new URLSearchParams({ purge: "true" });
  if (type) params.set("type", type);
  const res = await fetch(`/api/remove/${encodeURIComponent(name)}?${params}`, { method: "DELETE" });
  return res.json();
}

export async function removeMcp(name: string): Promise<{ success: boolean; error?: string }> {
  const res = await fetch(`/api/remove/${encodeURIComponent(name)}?type=mcp`, { method: "DELETE" });
  return res.json();
}

export async function removePlugin(name: string): Promise<{ removed: string[]; errors: string[] }> {
  const res = await fetch(`/api/remove/plugin/${encodeURIComponent(name)}`, { method: "DELETE" });
  return res.json();
}

export async function auditMarketplaceEntry(name: string, source: string, type: string): Promise<{ safe: boolean; findings: Array<{ ruleId: string; category: string; severity: string; message: string; match: string }> }> {
  const res = await fetch(`/api/marketplace/audit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, source, type }),
  });
  return res.json();
}

export async function fetchMyceliumVersion(): Promise<{ current: string; latest: string; hasUpdate: boolean }> {
  const res = await fetch(`/api/marketplace/self-update`);
  return res.json();
}

export async function fetchItemContent(url: string, type = "skill", signal?: AbortSignal): Promise<string | null> {
  try {
    const params = new URLSearchParams({ url, type });
    const res = await fetch(`/api/marketplace/content?${params}`, { signal });
    if (!res.ok) return null;
    const data = (await res.json()) as { content?: string };
    return data.content ?? null;
  } catch {
    return null;
  }
}

export async function fetchAvailableUpdates(): Promise<{ name: string; source: string; type: string; installedVersion: string; latestVersion: string }[]> {
  const res = await fetch(`/api/marketplace/updates`);
  return res.json();
}

export async function updateMarketplaceEntry(name: string, source: MarketplaceSource): Promise<{ success: boolean; path?: string; error?: string }> {
  const res = await fetch(`/api/marketplace/update`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, source }),
  });
  return res.json();
}
