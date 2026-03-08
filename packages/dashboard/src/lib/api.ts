import type { ToggleAction, DashboardState, ToolScanResult, MigrationPlan, MigrationResult, MarketplaceEntry, MarketplaceConfig, PluginInfo, MarketplaceSource } from "@mycelish/core";

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API error ${res.status}: ${text || res.statusText}`);
  }
  return res.json();
}

export async function fetchDashboardState(): Promise<DashboardState> {
  return fetchJSON(`/api/state`);
}

export async function sendToggle(action: ToggleAction): Promise<void> {
  await fetchJSON(`/api/toggle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(action),
  });
}

export async function scanTools(): Promise<ToolScanResult[]> {
  return fetchJSON(`/api/migrate/scan`);
}

export async function applyMigration(plan: MigrationPlan): Promise<MigrationResult> {
  return fetchJSON(`/api/migrate/apply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(plan),
  });
}

export async function clearMigration(toolId?: string): Promise<{ cleared: string[]; errors: string[] }> {
  const url = toolId ? `/api/migrate/clear?tool=${toolId}` : `/api/migrate/clear`;
  return fetchJSON(url, { method: "POST" });
}

export async function searchMarketplace(query: string, source?: string): Promise<MarketplaceEntry[]> {
  const params = new URLSearchParams({ q: query });
  if (source) params.set("source", source);
  return fetchJSON(`/api/marketplace/search?${params}`);
}

export async function installMarketplaceEntry(name: string, source: string, type?: string, url?: string): Promise<{ success: boolean; error?: string }> {
  return fetchJSON(`/api/marketplace/install`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, source, type, url }),
  });
}

export async function fetchMarketplaceRegistry(): Promise<Record<string, MarketplaceConfig>> {
  return fetchJSON(`/api/marketplace/registry`);
}

export async function addMarketplaceToRegistry(name: string, config: MarketplaceConfig): Promise<void> {
  await fetchJSON(`/api/marketplace/registry`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, ...config }),
  });
}

export async function removeMarketplaceFromRegistry(name: string): Promise<void> {
  await fetchJSON(`/api/marketplace/registry/${encodeURIComponent(name)}`, { method: "DELETE" });
}

export async function fetchPlugins(marketplace?: string): Promise<PluginInfo[]> {
  const params = marketplace ? `?marketplace=${marketplace}` : "";
  return fetchJSON(`/api/plugins${params}`);
}

export async function togglePlugin(name: string, enabled: boolean): Promise<{ success: boolean }> {
  return fetchJSON(`/api/plugins/toggle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, enabled }),
  });
}

export async function togglePluginItem(
  pluginName: string, itemName: string, enabled: boolean,
  options?: { global?: boolean; tool?: string },
): Promise<{ success: boolean; error?: string }> {
  return fetchJSON(`/api/plugins/${encodeURIComponent(pluginName)}/items/${encodeURIComponent(itemName)}/toggle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled, ...options }),
  });
}

export async function refreshMarketplaceCache(): Promise<{ cleared: number; refreshed: string[]; errors: string[] }> {
  return fetchJSON(`/api/marketplace/refresh`, { method: "POST" });
}

export async function fetchPopularSkills(): Promise<MarketplaceEntry[]> {
  return fetchJSON(`/api/marketplace/popular`);
}

export async function removeSkill(name: string): Promise<{ success: boolean; error?: string }> {
  return fetchJSON(`/api/remove/${encodeURIComponent(name)}?type=skill`, { method: "DELETE" });
}

export async function purgeItem(name: string, type?: string): Promise<{ success: boolean; name: string; message?: string; error?: string }> {
  const params = new URLSearchParams({ purge: "true" });
  if (type) params.set("type", type);
  return fetchJSON(`/api/remove/${encodeURIComponent(name)}?${params}`, { method: "DELETE" });
}

export async function removeMcp(name: string): Promise<{ success: boolean; error?: string }> {
  return fetchJSON(`/api/remove/${encodeURIComponent(name)}?type=mcp`, { method: "DELETE" });
}

export async function removePlugin(name: string): Promise<{ removed: string[]; errors: string[] }> {
  return fetchJSON(`/api/remove/plugin/${encodeURIComponent(name)}`, { method: "DELETE" });
}

export async function auditMarketplaceEntry(name: string, source: string, type: string): Promise<{ safe: boolean; findings: Array<{ ruleId: string; category: string; severity: string; message: string; match: string }> }> {
  return fetchJSON(`/api/marketplace/audit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, source, type }),
  });
}

export async function fetchMyceliumVersion(): Promise<{ current: string; latest: string; hasUpdate: boolean }> {
  return fetchJSON(`/api/marketplace/self-update`);
}

export async function fetchItemContent(url: string, type = "skill", signal?: AbortSignal, name?: string): Promise<string | null> {
  // Try remote content first if URL is available
  if (url) {
    try {
      const params = new URLSearchParams({ url, type });
      const res = await fetch(`/api/marketplace/content?${params}`, { signal });
      if (res.ok) {
        const data = (await res.json()) as { content?: string };
        if (data.content) return data.content;
      }
    } catch { /* fall through to local */ }
  }
  // Fallback: try local content for installed items
  if (name) {
    try {
      const params = new URLSearchParams({ name, type });
      const res = await fetch(`/api/marketplace/local-content?${params}`, { signal });
      if (res.ok) {
        const data = (await res.json()) as { content?: string };
        if (data.content) return data.content;
      }
    } catch { /* no local content */ }
  }
  return null;
}

export async function fetchAvailableUpdates(): Promise<{ name: string; source: string; type: string; installedVersion: string; latestVersion: string }[]> {
  return fetchJSON(`/api/marketplace/updates`);
}

export async function updateMarketplaceEntry(name: string, source: MarketplaceSource, type?: string): Promise<{ success: boolean; path?: string; error?: string }> {
  return fetchJSON(`/api/marketplace/update`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, source, type }),
  });
}
