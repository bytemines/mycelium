import { useState, useEffect, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  fetchMarketplaceRegistry, addMarketplaceToRegistry, removeMarketplaceFromRegistry,
  searchMarketplace as apiSearch, installMarketplaceEntry, fetchPopularSkills,
  updateMarketplaceEntry,
} from "@/lib/api";
import type { MarketplaceConfig } from "@mycelish/core";
import { SkillCard } from "./SkillCard";
import type { MarketplaceItem } from "./SkillCard";
import * as Dialog from "@radix-ui/react-dialog";

const CATEGORIES = ["All", "Testing", "Git", "Debugging", "Frontend", "Backend", "DevOps", "AI", "Code Review", "Documentation"];

type SortOption = "popular" | "recent" | "stars" | "az";

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
  const [error, setError] = useState<string | null>(null);

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
    }).catch((err) => { console.warn("Failed to load marketplace registry:", err); });

    setLoading(true);
    fetchPopularSkills().then(results => {
      const flat = results.flatMap(r => r.entries.map(e => ({ ...e, type: e.type as "skill" | "mcp" })));
      setResults(flat);
    }).catch((err) => { console.warn("Failed to load popular skills:", err); }).finally(() => setLoading(false));
  }, []);

  const handleSearch = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);
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
    const key = `${item.source}-${item.name}`;
    setInstalling(key);
    setError(null);
    try {
      const result = await installMarketplaceEntry(item.name, item.source);
      if (result.success) {
        setResults(prev => prev.map(r => (r.name === item.name && r.source === item.source ? { ...r, installed: true } : r)));
      } else {
        setError(`Failed to install ${item.name}: ${result.error || "Unknown error"}`);
      }
    } catch (e) {
      setError(`Failed to install ${item.name}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setInstalling(null);
    }
  }

  async function handleUpdate(item: MarketplaceItem) {
    const key = `${item.source}-${item.name}`;
    setUpdating(key);
    setError(null);
    try {
      const result = await updateMarketplaceEntry(item.name, item.source);
      if (result.success) {
        setResults(prev => prev.map(r =>
          r.name === item.name && r.source === item.source
            ? { ...r, installedVersion: r.latestVersion }
            : r
        ));
      } else {
        setError(`Failed to update ${item.name}: ${result.error || "Unknown error"}`);
      }
    } catch (e) {
      setError(`Failed to update ${item.name}: ${e instanceof Error ? e.message : String(e)}`);
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
      <Dialog.Root open={!!confirmRemove} onOpenChange={(open) => { if (!open) setConfirmRemove(null); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-80 -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-card p-6 shadow-xl">
            <Dialog.Title className="text-lg font-medium">Remove Marketplace</Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-muted-foreground">Remove <strong>{confirmRemove}</strong>?</Dialog.Description>
            <div className="mt-4 flex justify-end gap-2">
              <Dialog.Close asChild>
                <button className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">Cancel</button>
              </Dialog.Close>
              <button onClick={() => { handleRemoveMarketplace(confirmRemove!); setConfirmRemove(null); }}
                className="rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground hover:bg-destructive/90">Remove</button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Add Marketplace Dialog */}
      <Dialog.Root open={showAddDialog} onOpenChange={setShowAddDialog}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-96 -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-card p-6 shadow-xl">
            <Dialog.Title className="mb-4 text-lg font-medium">Add Marketplace</Dialog.Title>
            <Dialog.Description className="sr-only">Enter the name and URL for a new marketplace source.</Dialog.Description>
            <div className="space-y-3">
              <input type="text" value={newMpName} onChange={e => setNewMpName(e.target.value)} placeholder="Marketplace name"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              <input type="text" value={newMpUrl} onChange={e => setNewMpUrl(e.target.value)} placeholder="URL (required)"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              <div className="flex justify-end gap-2">
                <Dialog.Close asChild>
                  <button className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">Cancel</button>
                </Dialog.Close>
                <button onClick={handleAddMarketplace} disabled={!newMpName.trim() || !newMpUrl.trim()}
                  className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">Add</button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

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

      {/* Error banner */}
      {error && (
        <div aria-live="polite" className="flex items-center justify-between rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-2 text-xs hover:underline">Dismiss</button>
        </div>
      )}

      {/* Section header */}
      {!searched && !loading && results.length > 0 && (
        <h2 className="text-sm font-medium text-muted-foreground">Popular Skills & MCPs</h2>
      )}

      {/* Loading */}
      {loading && (
        <div aria-live="polite" className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" role="status" aria-label="Loading" />
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
              onToggleExpand={setExpandedCard}
            />
          ))}
        </div>
      )}
    </div>
  );
}
