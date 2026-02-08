import { useState, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import { fetchMarketplaceRegistry, addMarketplaceToRegistry, removeMarketplaceFromRegistry, searchMarketplace as apiSearch, installMarketplaceEntry } from "@/lib/api";
import type { MarketplaceConfig } from "@mycelium/core";

interface MarketplaceItem {
  name: string;
  description: string;
  source: string;
  author?: string;
  downloads?: number;
  installed?: boolean;
  type: "skill" | "mcp";
}

interface MarketplaceBrowserProps {
  onClose?: () => void;
}

export function MarketplaceBrowser({ onClose: _onClose }: MarketplaceBrowserProps) {
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("all");
  const [results, setResults] = useState<MarketplaceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [installing, setInstalling] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [marketplaces, setMarketplaces] = useState<{value: string; label: string}[]>([
    { value: "all", label: "All" },
  ]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newMpName, setNewMpName] = useState("");
  const [newMpUrl, setNewMpUrl] = useState("");
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [registry, setRegistry] = useState<Record<string, MarketplaceConfig>>({});

  useEffect(() => {
    fetchMarketplaceRegistry().then(reg => {
      setRegistry(reg);
      const dynamic = Object.keys(reg).map(k => ({ value: k, label: k }));
      setMarketplaces([{ value: "all", label: "All" }, ...dynamic]);
    }).catch(() => {});
  }, []);

  async function handleSearch(e?: React.FormEvent) {
    e?.preventDefault();
    if (!query.trim()) return;
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
  }

  async function handleInstall(item: MarketplaceItem) {
    setInstalling(item.name);
    try {
      const result = await installMarketplaceEntry(item.name, item.source);
      if (result.success) {
        setResults((prev) => prev.map((r) => (r.name === item.name && r.source === item.source ? { ...r, installed: true } : r)));
      }
    } finally {
      setInstalling(null);
    }
  }

  async function handleRemoveMarketplace(name: string) {
    await removeMarketplaceFromRegistry(name);
    setRegistry(prev => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
    setMarketplaces(prev => prev.filter(m => m.value !== name));
    if (source === name) setSource("all");
  }

  async function handleAddMarketplace() {
    if (!newMpName.trim()) return;
    if (!newMpUrl.trim()) return;
    const config: MarketplaceConfig = { type: "remote", enabled: true, url: newMpUrl };
    await addMarketplaceToRegistry(newMpName, config);
    setRegistry(prev => ({ ...prev, [newMpName]: config }));
    setMarketplaces(prev => [...prev, { value: newMpName, label: newMpName }]);
    setNewMpName("");
    setNewMpUrl("");
    setShowAddDialog(false);
  }

  const groupedResults = useMemo(() => {
    const groups: Record<string, MarketplaceItem[]> = {};
    for (const item of results) {
      const key = item.source || "unknown";
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    }
    return groups;
  }, [results]);

  const hasGroups = Object.keys(groupedResults).length > 1;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Configured Marketplaces */}
      {Object.keys(registry).length > 0 && (
        <div className="rounded-lg border bg-card p-4 text-card-foreground shadow-sm">
          <h3 className="mb-3 text-sm font-medium">Configured Marketplaces</h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(registry).map(([name, config]) => (
              <button
                key={name}
                onClick={() => {
                  setSource(name);
                  if (query.trim()) handleSearch();
                }}
                className={cn(
                  "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm cursor-pointer transition-all hover:border-primary",
                  source === name ? "border-primary bg-primary/10 ring-1 ring-primary/30" :
                  config.enabled ? "border-primary/40 bg-primary/5" : "border-muted bg-muted/50 opacity-60"
                )}
              >
                <span className={cn(
                  "inline-block w-2 h-2 rounded-full",
                  config.enabled ? "bg-green-500" : "bg-gray-500"
                )} />
                <span className="font-medium">{name}</span>
                <span className="text-xs text-muted-foreground">{config.type}</span>
                {config.discovered && <span className="text-[10px] text-muted-foreground">(auto)</span>}
                {config.url && (
                  <a
                    href={config.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="ml-1 text-xs text-muted-foreground hover:text-primary"
                    title={config.url}
                  >
                    &#8599;
                  </a>
                )}
                {!config.default && config.type === "remote" && !config.discovered && (
                  <span
                    onClick={(e) => { e.stopPropagation(); setConfirmRemove(name); }}
                    className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-xs text-muted-foreground hover:bg-destructive/20 hover:text-destructive cursor-pointer"
                    title="Remove marketplace"
                  >
                    x
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Remove Confirmation Dialog */}
      {confirmRemove && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setConfirmRemove(null)} />
          <div className="fixed left-1/2 top-1/2 z-50 w-80 -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-card p-6 shadow-xl">
            <h3 className="text-lg font-medium">Remove Marketplace</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Are you sure you want to remove <strong>{confirmRemove}</strong>? This will remove it from your configured sources.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setConfirmRemove(null)}
                className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={() => { handleRemoveMarketplace(confirmRemove); setConfirmRemove(null); }}
                className="rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground hover:bg-destructive/90"
              >
                Remove
              </button>
            </div>
          </div>
        </>
      )}

      {/* Search bar */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search skills and MCPs..."
          className="flex-1 rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <select
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className="rounded-md border bg-background px-3 py-2 text-sm"
        >
          {marketplaces.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? "Searching..." : "Search"}
        </button>
        <button
          type="button"
          onClick={() => setShowAddDialog(true)}
          className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          + Add Marketplace
        </button>
      </form>

      {/* Add Marketplace Dialog */}
      {showAddDialog && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setShowAddDialog(false)} />
          <div className="fixed left-1/2 top-1/2 z-50 w-96 -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-card p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-medium">Add Marketplace</h3>
            <div className="space-y-3">
              <input
                type="text"
                value={newMpName}
                onChange={(e) => setNewMpName(e.target.value)}
                placeholder="Marketplace name"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <input
                type="text"
                value={newMpUrl}
                onChange={(e) => setNewMpUrl(e.target.value)}
                placeholder="URL (required)"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowAddDialog(false)}
                  className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddMarketplace}
                  disabled={!newMpName.trim() || !newMpUrl.trim()}
                  className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Results */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}

      {!loading && searched && results.length === 0 && (
        <div className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground shadow-sm">
          No results found for &quot;{query}&quot;.
        </div>
      )}

      {!loading && results.length > 0 && hasGroups && (
        <div>
          {Object.entries(groupedResults).map(([marketplace, items]) => (
            <div key={marketplace}>
              <h3 className="text-sm font-medium text-muted-foreground mb-2 mt-4">{marketplace}</h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((item) => (
                  <ResultCard key={`${item.source}-${item.name}`} item={item} installing={installing} onInstall={handleInstall} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && results.length > 0 && !hasGroups && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((item) => (
            <ResultCard key={`${item.source}-${item.name}`} item={item} installing={installing} onInstall={handleInstall} />
          ))}
        </div>
      )}
    </div>
  );
}

function ResultCard({ item, installing, onInstall }: { item: { name: string; description: string; source: string; author?: string; downloads?: number; installed?: boolean; type: string }; installing: string | null; onInstall: (item: any) => void }) {
  return (
    <div className="rounded-lg border bg-card p-4 text-card-foreground shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-medium">{item.name}</h3>
          {item.author && <p className="text-xs text-muted-foreground">by {item.author}</p>}
        </div>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{item.source}</span>
      </div>
      <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{item.description}</p>
      <div className="mt-3 flex items-center justify-between">
        {item.downloads != null && (
          <span className="text-xs text-muted-foreground">{item.downloads.toLocaleString()} downloads</span>
        )}
        <button
          onClick={() => onInstall(item)}
          disabled={item.installed || installing === item.name}
          className={`ml-auto rounded-md px-3 py-1 text-sm font-medium ${
            item.installed
              ? "border bg-muted text-muted-foreground"
              : "bg-primary text-primary-foreground hover:bg-primary/90"
          } disabled:opacity-50`}
        >
          {item.installed ? "Installed" : installing === item.name ? "Installing..." : "Install"}
        </button>
      </div>
    </div>
  );
}
