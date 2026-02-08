import { useState, useEffect, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  fetchMarketplaceRegistry, addMarketplaceToRegistry, removeMarketplaceFromRegistry,
  searchMarketplace as apiSearch, installMarketplaceEntry, fetchPopularSkills,
  updateMarketplaceEntry,
} from "@/lib/api";
import type { MarketplaceConfig } from "@mycelium/core";

interface MarketplaceItem {
  name: string;
  description: string;
  source: string;
  author?: string;
  downloads?: number;
  stars?: number;
  category?: string;
  updatedAt?: string;
  installedVersion?: string;
  latestVersion?: string;
  installed?: boolean;
  type: "skill" | "mcp";
}

const CATEGORIES = ["All", "Testing", "Git", "Debugging", "Frontend", "Backend", "DevOps", "AI", "Code Review", "Documentation"];

type SortOption = "popular" | "recent" | "stars" | "az";

// --- SkillCard: terminal-style code-preview card ---
function SkillCard({
  item, installing, updating, expanded, onInstall, onUpdate, onToggleExpand,
}: {
  item: MarketplaceItem;
  installing: string | null;
  updating: string | null;
  expanded: boolean;
  onInstall: (item: MarketplaceItem) => void;
  onUpdate: (item: MarketplaceItem) => void;
  onToggleExpand: (name: string) => void;
}) {
  const isInstalling = installing === item.name;
  const isUpdating = updating === item.name;
  const hasUpdate = item.installed && item.latestVersion && item.installedVersion && item.latestVersion !== item.installedVersion;
  const fileExt = item.type === "mcp" ? ".yaml" : ".md";

  return (
    <div
      className={cn(
        "rounded-lg border bg-[#1a1a2e] text-sm shadow-md transition-all cursor-pointer hover:border-primary/50 hover:shadow-lg",
        expanded && "ring-1 ring-primary/30",
        item.installed && "ring-1 ring-green-500/30"
      )}
      onClick={() => onToggleExpand(item.name)}
    >
      {/* Header — traffic lights + filename + stars */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
            <span className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
          </div>
          <span className="text-xs text-gray-400 font-mono">{item.name}{fileExt}</span>
          {item.installed && (
            <span className="text-[10px] text-green-400 font-medium">INSTALLED</span>
          )}
          {hasUpdate && (
            <span className="text-[10px] text-yellow-400 font-medium">UPDATE</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {item.installedVersion && (
            <span className="text-[10px] text-gray-500 font-mono">v{item.installedVersion}</span>
          )}
          {item.stars != null && (
            <span className="text-xs text-yellow-400 font-medium">
              * {item.stars >= 1000 ? `${(item.stars / 1000).toFixed(1)}k` : item.stars}
            </span>
          )}
          {item.downloads != null && !item.stars && (
            <span className="text-xs text-gray-500">
              {item.downloads >= 1000 ? `${(item.downloads / 1000).toFixed(1)}k` : item.downloads} dl
            </span>
          )}
        </div>
      </div>

      {/* Body — code preview */}
      <div className="px-3 py-3 font-mono space-y-1">
        <div className="flex items-center gap-1">
          <span className="text-gray-500 text-xs w-4 text-right shrink-0">1</span>
          <span className="text-purple-400 font-semibold">export</span>
          <span className="text-white font-bold">{item.name}</span>
        </div>
        {item.author && (
          <div className="flex items-center gap-1">
            <span className="text-gray-500 text-xs w-4 text-right shrink-0">2</span>
            <span className="ml-4 text-gray-400">from</span>
            <span className="text-green-400">&quot;{item.author}/{item.source}&quot;</span>
          </div>
        )}
        <div className="flex gap-1">
          <span className="text-gray-500 text-xs w-4 text-right shrink-0">{item.author ? "3" : "2"}</span>
          <span className={cn("text-gray-400 leading-relaxed", !expanded && "line-clamp-2")}>
            {item.description}
          </span>
        </div>
      </div>

      {/* Expanded preview */}
      {expanded && (
        <div className="border-t border-white/5 px-3 py-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            {item.category && (
              <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] text-primary font-medium">
                {item.category}
              </span>
            )}
            <span className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-medium",
              item.type === "mcp" ? "bg-blue-500/20 text-blue-400" : "bg-purple-500/20 text-purple-400"
            )}>
              {item.type === "mcp" ? "MCP Server" : "Skill"}
            </span>
          </div>
          {/* Version info */}
          {(item.installedVersion || item.latestVersion) && (
            <div className="flex items-center gap-3 text-xs text-gray-500">
              {item.installedVersion && <span>Installed: v{item.installedVersion}</span>}
              {item.latestVersion && <span>Latest: v{item.latestVersion}</span>}
            </div>
          )}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 text-xs text-gray-500">
              {item.downloads != null && (
                <span>{item.downloads.toLocaleString()} downloads</span>
              )}
              {item.stars != null && (
                <span>{item.stars.toLocaleString()} stars</span>
              )}
              {item.updatedAt && <span>{item.updatedAt}</span>}
            </div>
            <div className="flex items-center gap-2">
              {hasUpdate && (
                <button
                  onClick={(e) => { e.stopPropagation(); onUpdate(item); }}
                  disabled={isUpdating}
                  className="rounded-md px-3 py-1.5 text-xs font-medium bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 disabled:opacity-50"
                >
                  {isUpdating ? "Updating..." : "Update"}
                </button>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); onInstall(item); }}
                disabled={item.installed || isInstalling}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  item.installed
                    ? "border border-green-500/30 text-green-400 bg-green-500/10"
                    : "bg-primary text-primary-foreground hover:bg-primary/90",
                  "disabled:opacity-50"
                )}
              >
                {item.installed ? "Installed" : isInstalling ? "Installing..." : "Install"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer — source badge + date + quick install */}
      {!expanded && (
        <div className="flex items-center justify-between px-3 py-2 border-t border-white/5">
          <div className="flex items-center gap-2">
            {item.updatedAt && <span className="text-[10px] text-gray-600">{item.updatedAt}</span>}
            <span className={cn(
              "rounded-full px-2 py-0.5 text-[10px]",
              item.type === "mcp" ? "bg-blue-500/10 text-blue-400" : "bg-white/5 text-gray-500"
            )}>
              {item.source}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {hasUpdate && (
              <button
                onClick={(e) => { e.stopPropagation(); onUpdate(item); }}
                disabled={isUpdating}
                className="rounded-md px-2 py-1 text-[10px] font-medium text-yellow-400 hover:bg-yellow-500/20 disabled:opacity-50"
              >
                {isUpdating ? "..." : "Update"}
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onInstall(item); }}
              disabled={item.installed || isInstalling}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                item.installed
                  ? "text-green-400 text-[10px]"
                  : "bg-primary/80 text-primary-foreground hover:bg-primary",
                "disabled:opacity-50"
              )}
            >
              {item.installed ? "Installed" : isInstalling ? "..." : "Install"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Main MarketplaceBrowser ---
interface MarketplaceBrowserProps {
  onClose?: () => void;
}

export function MarketplaceBrowser({ onClose: _onClose }: MarketplaceBrowserProps) {
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("all");
  const [category, setCategory] = useState("All");
  const [sortBy, setSortBy] = useState<SortOption>("popular");
  const [results, setResults] = useState<MarketplaceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [installing, setInstalling] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);

  // Registry / marketplace pills state
  const [marketplaces, setMarketplaces] = useState<{value: string; label: string}[]>([{ value: "all", label: "All" }]);
  const [registry, setRegistry] = useState<Record<string, MarketplaceConfig>>({});
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newMpName, setNewMpName] = useState("");
  const [newMpUrl, setNewMpUrl] = useState("");
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  // Load registry + popular on mount
  useEffect(() => {
    fetchMarketplaceRegistry().then(reg => {
      setRegistry(reg);
      const dynamic = Object.keys(reg).map(k => ({ value: k, label: k }));
      setMarketplaces([{ value: "all", label: "All" }, ...dynamic]);
    }).catch(() => {});

    setLoading(true);
    fetchPopularSkills().then(results => {
      const flat = results.flatMap(r => r.entries.map(e => ({ ...e, type: e.type as "skill" | "mcp" })));
      setResults(flat);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleSearch = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!query.trim()) {
      setLoading(true);
      setSearched(false);
      fetchPopularSkills().then(results => {
        const flat = results.flatMap(r => r.entries.map(e => ({ ...e, type: e.type as "skill" | "mcp" })));
        setResults(flat);
      }).catch(() => setResults([])).finally(() => setLoading(false));
      return;
    }
    setLoading(true);
    setSearched(true);
    try {
      const searchResults = await apiSearch(query, source !== "all" ? source : undefined);
      const flat = searchResults.flatMap(r => r.entries.map(e => ({ ...e, type: e.type as "skill" | "mcp" })));
      setResults(flat);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [query, source]);

  async function handleInstall(item: MarketplaceItem) {
    setInstalling(item.name);
    try {
      const result = await installMarketplaceEntry(item.name, item.source);
      if (result.success) {
        setResults(prev => prev.map(r => (r.name === item.name && r.source === item.source ? { ...r, installed: true } : r)));
      }
    } finally {
      setInstalling(null);
    }
  }

  async function handleUpdate(item: MarketplaceItem) {
    setUpdating(item.name);
    try {
      const result = await updateMarketplaceEntry(item.name, item.source);
      if (result.success) {
        setResults(prev => prev.map(r =>
          r.name === item.name && r.source === item.source
            ? { ...r, installedVersion: r.latestVersion }
            : r
        ));
      }
    } finally {
      setUpdating(null);
    }
  }

  async function handleRemoveMarketplace(name: string) {
    await removeMarketplaceFromRegistry(name);
    setRegistry(prev => { const next = { ...prev }; delete next[name]; return next; });
    setMarketplaces(prev => prev.filter(m => m.value !== name));
    if (source === name) setSource("all");
  }

  async function handleAddMarketplace() {
    if (!newMpName.trim() || !newMpUrl.trim()) return;
    const config: MarketplaceConfig = { type: "remote", enabled: true, url: newMpUrl };
    await addMarketplaceToRegistry(newMpName, config);
    setRegistry(prev => ({ ...prev, [newMpName]: config }));
    setMarketplaces(prev => [...prev, { value: newMpName, label: newMpName }]);
    setNewMpName(""); setNewMpUrl(""); setShowAddDialog(false);
  }

  const displayResults = useMemo(() => {
    let filtered = results;
    if (category !== "All") {
      const cat = category.toLowerCase();
      filtered = filtered.filter(item =>
        item.category?.toLowerCase() === cat ||
        item.name.toLowerCase().includes(cat) ||
        item.description.toLowerCase().includes(cat)
      );
    }
    const sorted = [...filtered];
    switch (sortBy) {
      case "popular": sorted.sort((a, b) => (b.downloads ?? 0) - (a.downloads ?? 0)); break;
      case "stars": sorted.sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0)); break;
      case "recent": sorted.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")); break;
      case "az": sorted.sort((a, b) => a.name.localeCompare(b.name)); break;
    }
    return sorted;
  }, [results, category, sortBy]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Configured Marketplaces */}
      {Object.keys(registry).length > 0 && (
        <div className="rounded-lg border bg-card p-4 text-card-foreground shadow-sm">
          <h3 className="mb-3 text-sm font-medium">Configured Marketplaces</h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(registry).map(([name, config]) => (
              <button key={name}
                onClick={() => { setSource(name); if (query.trim()) handleSearch(); }}
                className={cn(
                  "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm cursor-pointer transition-all hover:border-primary",
                  source === name ? "border-primary bg-primary/10 ring-1 ring-primary/30" :
                  config.enabled ? "border-primary/40 bg-primary/5" : "border-muted bg-muted/50 opacity-60"
                )}
              >
                <span className={cn("inline-block w-2 h-2 rounded-full", config.enabled ? "bg-green-500" : "bg-gray-500")} />
                <span className="font-medium">{name}</span>
                <span className="text-xs text-muted-foreground">{config.type}</span>
                {config.discovered && <span className="text-[10px] text-muted-foreground">(auto)</span>}
                {config.url && (
                  <a href={config.url} target="_blank" rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()} className="ml-1 text-xs text-muted-foreground hover:text-primary" title={config.url}>&#8599;</a>
                )}
                {!config.default && config.type === "remote" && !config.discovered && (
                  <span onClick={e => { e.stopPropagation(); setConfirmRemove(name); }}
                    className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-xs text-muted-foreground hover:bg-destructive/20 hover:text-destructive cursor-pointer" title="Remove">x</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Remove Confirmation */}
      {confirmRemove && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setConfirmRemove(null)} />
          <div className="fixed left-1/2 top-1/2 z-50 w-80 -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-card p-6 shadow-xl">
            <h3 className="text-lg font-medium">Remove Marketplace</h3>
            <p className="mt-2 text-sm text-muted-foreground">Remove <strong>{confirmRemove}</strong>?</p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setConfirmRemove(null)} className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">Cancel</button>
              <button onClick={() => { handleRemoveMarketplace(confirmRemove); setConfirmRemove(null); }}
                className="rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground hover:bg-destructive/90">Remove</button>
            </div>
          </div>
        </>
      )}

      {/* Add Marketplace Dialog */}
      {showAddDialog && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setShowAddDialog(false)} />
          <div className="fixed left-1/2 top-1/2 z-50 w-96 -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-card p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-medium">Add Marketplace</h3>
            <div className="space-y-3">
              <input type="text" value={newMpName} onChange={e => setNewMpName(e.target.value)} placeholder="Marketplace name"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              <input type="text" value={newMpUrl} onChange={e => setNewMpUrl(e.target.value)} placeholder="URL (required)"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowAddDialog(false)} className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">Cancel</button>
                <button onClick={handleAddMarketplace} disabled={!newMpName.trim() || !newMpUrl.trim()}
                  className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">Add</button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Search bar + Sort + Add Marketplace */}
      <div className="space-y-3">
        <form onSubmit={handleSearch} className="flex gap-2">
          <input type="text" value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search skills and MCPs..."
            className="flex-1 rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
          <select value={source} onChange={e => setSource(e.target.value)}
            className="rounded-md border bg-background px-3 py-2 text-sm">
            {marketplaces.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <select value={sortBy} onChange={e => setSortBy(e.target.value as SortOption)}
            className="rounded-md border bg-background px-3 py-2 text-sm">
            <option value="popular">Popular</option>
            <option value="stars">Stars</option>
            <option value="recent">Recent</option>
            <option value="az">A-Z</option>
          </select>
          <button type="submit" disabled={loading}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {loading ? "..." : "Search"}
          </button>
          <button type="button" onClick={() => setShowAddDialog(true)}
            className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">+ Add</button>
        </form>

        {/* Category chips */}
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map(cat => (
            <button key={cat} onClick={() => setCategory(cat)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                category === cat ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
              )}>
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Section header */}
      {!searched && !loading && results.length > 0 && (
        <h2 className="text-sm font-medium text-muted-foreground">Popular Skills & MCPs</h2>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}

      {/* Empty state */}
      {!loading && searched && displayResults.length === 0 && (
        <div className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground shadow-sm">
          No results found{query && <> for &quot;{query}&quot;</>}.
        </div>
      )}

      {/* Results grid */}
      {!loading && displayResults.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {displayResults.map(item => (
            <SkillCard
              key={`${item.source}-${item.name}`}
              item={item}
              installing={installing}
              updating={updating}
              expanded={expandedCard === `${item.source}-${item.name}`}
              onInstall={handleInstall}
              onUpdate={handleUpdate}
              onToggleExpand={(name) => setExpandedCard(prev =>
                prev === `${item.source}-${name}` ? null : `${item.source}-${name}`
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
