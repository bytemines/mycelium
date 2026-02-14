import { useState, useEffect, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  fetchMarketplaceRegistry, addMarketplaceToRegistry, removeMarketplaceFromRegistry,
  searchMarketplace as apiSearch, installMarketplaceEntry, fetchPopularSkills,
  updateMarketplaceEntry, purgeItem, refreshMarketplaceCache, fetchAvailableUpdates,
  fetchMyceliumVersion,
} from "@/lib/api";
import type { MarketplaceConfig } from "@mycelish/core";
import { SkillCard } from "./SkillCard";
import type { MarketplaceItem } from "./SkillCard";
import { SkillDetailPanel } from "./SkillDetailPanel";
import { ENTRY_TYPE_META } from "@/lib/entry-type-meta";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

type SortOption = "popular" | "recent" | "stars" | "az";

interface MarketplaceBrowserProps {
  onClose?: () => void;
}

export function MarketplaceBrowser({ onClose: _onClose }: MarketplaceBrowserProps) {
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("all");
  const [sortBy, setSortBy] = useState<SortOption>("popular");
  const [results, setResults] = useState<MarketplaceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [installing, setInstalling] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [_removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [typeFilter, setTypeFilter] = useState<"all" | "skill" | "mcp" | "agent" | "plugin">("all");
  const [selectedItem, setSelectedItem] = useState<MarketplaceItem | null>(null);

  // Registry state
  const [marketplaces, setMarketplaces] = useState<{value: string; label: string}[]>([{ value: "all", label: "All" }]);
  const [registry, setRegistry] = useState<Record<string, MarketplaceConfig>>({});
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newMpName, setNewMpName] = useState("");
  const [newMpUrl, setNewMpUrl] = useState("");
  const [confirmRemoveItem, setConfirmRemoveItem] = useState<MarketplaceItem | null>(null);
  const [availableUpdates, setAvailableUpdates] = useState<{ name: string; source: string }[]>([]);
  const [showUpdatesOnly, setShowUpdatesOnly] = useState(false);
  const [myceliumUpdate, setMyceliumUpdate] = useState<{ current: string; latest: string; hasUpdate: boolean } | null>(null);

  // Load registry + popular on mount
  useEffect(() => {
    fetchMarketplaceRegistry().then(reg => {
      setRegistry(reg);
      const dynamic = Object.keys(reg).map(k => ({ value: k, label: k }));
      setMarketplaces([{ value: "all", label: "All" }, ...dynamic]);
    }).catch((err) => { console.warn("Failed to load marketplace registry:", err); });
    fetchAvailableUpdates().then(setAvailableUpdates).catch((err) => { console.warn("Failed to check for updates:", err); });
    fetchMyceliumVersion().then(setMyceliumUpdate).catch((err) => { console.warn("Failed to check mycelium version:", err); });
  }, []);

  const handleSearch = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);
    if (!query.trim() && source === "all") {
      setLoading(true);
      setSearched(false);
      fetchPopularSkills().then(entries => {
        setResults(entries as MarketplaceItem[]);
      }).catch(() => setResults([])).finally(() => setLoading(false));
      return;
    }
    setLoading(true);
    setSearched(true);
    try {
      const searchResults = await apiSearch(query, source !== "all" ? source : undefined);
      setResults(searchResults as MarketplaceItem[]);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [query, source]);

  useEffect(() => {
    handleSearch();
  }, [handleSearch]);

  async function handleInstall(item: MarketplaceItem) {
    const key = `${item.source}-${item.name}`;
    setInstalling(key);
    setError(null);
    try {
      const result = await installMarketplaceEntry(item.name, item.source, item.type);
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

  function handleRemove(item: MarketplaceItem) {
    setConfirmRemoveItem(item);
  }

  async function confirmRemoveItemAction() {
    const item = confirmRemoveItem;
    if (!item) return;
    setConfirmRemoveItem(null);
    const key = `${item.source}-${item.name}`;
    setRemoving(key);
    setError(null);
    try {
      const result = await purgeItem(item.name, item.type);
      if (result.success) {
        setResults(prev => prev.map(r =>
          r.name === item.name && r.source === item.source ? { ...r, installed: false } : r
        ));
      } else {
        setError(`Failed to remove ${item.name}: ${result.error || "Unknown error"}`);
      }
    } catch (e) {
      setError(`Failed to remove ${item.name}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRemoving(null);
    }
  }

  async function handleAddMarketplace() {
    if (!newMpName.trim() || !newMpUrl.trim()) return;
    const config: MarketplaceConfig = { type: "remote", enabled: true, url: newMpUrl };
    await addMarketplaceToRegistry(newMpName, config);
    setRegistry(prev => ({ ...prev, [newMpName]: config }));
    setMarketplaces(prev => [...prev, { value: newMpName, label: newMpName }]);
    setNewMpName(""); setNewMpUrl(""); setShowAddDialog(false);
  }

  async function handleRemoveMarketplace(name: string) {
    if (!confirm(`Remove marketplace "${name}"?`)) return;
    try {
      await removeMarketplaceFromRegistry(name);
      setRegistry(prev => { const next = { ...prev }; delete next[name]; return next; });
      setMarketplaces(prev => prev.filter(m => m.value !== name));
      if (source === name) setSource("all");
    } catch (e) {
      setError(`Failed to remove ${name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const displayResults = useMemo(() => {
    let filtered = results;
    if (showUpdatesOnly) {
      const updateNames = new Set(availableUpdates.map(u => u.name));
      filtered = filtered.filter(item => updateNames.has(item.name));
    }
    if (source !== "all") {
      filtered = filtered.filter(item => item.source === source);
    }
    if (typeFilter !== "all") {
      filtered = filtered.filter(item => item.type === typeFilter);
    }
    const sorted = [...filtered];
    switch (sortBy) {
      case "popular": sorted.sort((a, b) => (b.downloads ?? 0) - (a.downloads ?? 0)); break;
      case "stars": sorted.sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0)); break;
      case "recent": sorted.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")); break;
      case "az": sorted.sort((a, b) => a.name.localeCompare(b.name)); break;
    }
    sorted.sort((a, b) => {
      if (a.installed && !b.installed) return -1;
      if (!a.installed && b.installed) return 1;
      return 0;
    });
    return sorted;
  }, [results, source, sortBy, typeFilter, showUpdatesOnly, availableUpdates]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Remove Item Confirmation */}
      <Dialog.Root open={!!confirmRemoveItem} onOpenChange={(open) => { if (!open) setConfirmRemoveItem(null); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-80 -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-card p-6 shadow-xl">
            <Dialog.Title className="text-lg font-medium">Remove {confirmRemoveItem?.name}</Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-muted-foreground">
              This will permanently delete the files and remove symlinks from all tools. This cannot be undone.
            </Dialog.Description>
            <div className="mt-4 flex justify-end gap-2">
              <Dialog.Close asChild>
                <button className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">Cancel</button>
              </Dialog.Close>
              <button onClick={confirmRemoveItemAction}
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

      {/* Detail Modal */}
      <SkillDetailPanel
        item={selectedItem}
        open={!!selectedItem}
        onOpenChange={(open) => { if (!open) setSelectedItem(null); }}
        onInstall={(item) => { handleInstall(item); setSelectedItem(null); }}
        onUpdate={(item) => { handleUpdate(item); setSelectedItem(null); }}
        onRemove={(item) => { handleRemove(item); setSelectedItem(null); }}
      />

      {/* Single-row search bar: [input] [source] [type] [sort] [+ Add] [refresh] */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <input type="text" value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Search skills, MCPs, plugins..."
          className="flex-1 rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button type="button" className="flex items-center gap-1.5 rounded-md border bg-background pl-3 pr-2.5 py-2 text-sm min-w-[100px] text-left truncate">
              <span className="flex-1 truncate">{marketplaces.find(m => m.value === source)?.label ?? "All"}</span>
              <svg className="h-4 w-4 shrink-0 text-muted-foreground" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 16 16"><path d="m4 6 4 4 4-4" /></svg>
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className="z-50 min-w-[180px] rounded-lg border bg-card p-1 shadow-xl" sideOffset={4}>
              <DropdownMenu.Item
                className={cn("flex cursor-pointer items-center rounded-md px-3 py-1.5 text-sm outline-none hover:bg-muted", source === "all" && "font-medium text-primary")}
                onSelect={() => setSource("all")}>
                All
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="my-1 h-px bg-border" />
              {marketplaces.filter(m => m.value !== "all").map(m => {
                const cfg = registry[m.value];
                const canRemove = cfg && !cfg.default && !cfg.discovered;
                return (
                  <DropdownMenu.Item key={m.value}
                    className={cn("flex cursor-pointer items-center justify-between gap-2 rounded-md px-3 py-1.5 text-sm outline-none hover:bg-muted", source === m.value && "font-medium text-primary")}
                    onSelect={() => setSource(m.value)}>
                    <span className="truncate">{m.label}</span>
                    <span className="flex shrink-0 items-center gap-1" onClick={e => e.stopPropagation()}>
                      {cfg?.url && (
                        <a href={cfg.url} target="_blank" rel="noopener noreferrer"
                          className="rounded p-0.5 text-muted-foreground hover:text-primary"
                          onClick={e => e.stopPropagation()} title="Open marketplace">&#8599;</a>
                      )}
                      {canRemove && (
                        <button
                          className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                          onClick={e => { e.stopPropagation(); handleRemoveMarketplace(m.value); }}
                          title="Remove marketplace">&times;</button>
                      )}
                    </span>
                  </DropdownMenu.Item>
                );
              })}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as typeof typeFilter)}
          className="appearance-none rounded-md border bg-background pl-3 pr-7 py-2 text-sm bg-[length:16px] bg-[right_6px_center] bg-no-repeat"
          style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%239ca3af' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m4 6 4 4 4-4'/%3E%3C/svg%3E\")" }}>
          <option value="all">All Types</option>
          {(["skill", "mcp", "agent", "plugin"] as const).map(t => {
            const meta = ENTRY_TYPE_META[t];
            return <option key={t} value={t}>{meta?.label ?? t}</option>;
          })}
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value as SortOption)}
          className="appearance-none rounded-md border bg-background pl-3 pr-7 py-2 text-sm bg-[length:16px] bg-[right_6px_center] bg-no-repeat"
          style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%239ca3af' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m4 6 4 4 4-4'/%3E%3C/svg%3E\")" }}>
          <option value="popular">Popular</option>
          <option value="stars">Stars</option>
          <option value="recent">Recent</option>
          <option value="az">A-Z</option>
        </select>
        <button type="button" onClick={() => setShowAddDialog(true)}
          className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">+ Add</button>
        <button type="button" onClick={async () => {
            setRefreshing(true); setError(null);
            try {
              const result = await refreshMarketplaceCache();
              if (result.errors.length > 0) setError(`Refreshed with errors: ${result.errors.join(", ")}`);
              await handleSearch();
            } catch (err) {
              setError(`Refresh failed: ${err instanceof Error ? err.message : String(err)}`);
            } finally { setRefreshing(false); }
          }} disabled={refreshing}
          className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
          title="Refresh marketplace cache from remote sources">
          {refreshing ? "..." : "\u21bb"}
        </button>
      </form>

      {/* Mycelium self-update banner */}
      {myceliumUpdate?.hasUpdate && (
        <div className="flex items-center justify-between rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm text-blue-400">
          <span>Mycelium <span className="font-mono">v{myceliumUpdate.current}</span> → <span className="font-mono">v{myceliumUpdate.latest}</span> available</span>
          <span className="text-xs text-blue-400/70">Run <code className="rounded bg-blue-500/20 px-1.5 py-0.5 font-mono">npm update -g @mycelish/cli</code> to update</span>
        </div>
      )}

      {/* Updates banner */}
      {availableUpdates.length > 0 && (
        <button
          onClick={() => setShowUpdatesOnly(!showUpdatesOnly)}
          className={cn(
            "flex w-full items-center justify-between rounded-lg border px-4 py-3 text-sm transition-colors cursor-pointer",
            showUpdatesOnly
              ? "border-yellow-500/50 bg-yellow-500/15 text-yellow-400"
              : "border-yellow-500/30 bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/15"
          )}
        >
          <span>{availableUpdates.length} update{availableUpdates.length > 1 ? "s" : ""} available: {availableUpdates.map(u => u.name).join(", ")}</span>
          <span className="text-xs">{showUpdatesOnly ? "Show all" : "Show updates"}</span>
        </button>
      )}

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
              onInstall={handleInstall}
              onUpdate={handleUpdate}
              onSelect={setSelectedItem}
            />
          ))}
        </div>
      )}
    </div>
  );
}
