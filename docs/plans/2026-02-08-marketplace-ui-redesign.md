# Marketplace UI Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the marketplace browser with SkillsMP-inspired code-preview cards, popular default view, category filters, star ratings, one-click install, author badges, installed indicators, skill preview expansion, sort options, version display, and skill update capability.

**Architecture:** Extend `MarketplaceEntry` type with `stars`, `category`, `installedVersion`, and `latestVersion` fields. Add `GET /api/marketplace/popular` and `POST /api/marketplace/update` endpoints. Add `updateSkill()` function to marketplace.ts that re-downloads a skill to get the latest version. Rewrite `MarketplaceBrowser.tsx` with new `SkillCard` component (terminal-style code preview), category chip bar, sort dropdown, inline skill preview panel, version badge, and update button. All existing marketplace/registry features (pills, add/remove, dialogs) are preserved.

**Tech Stack:** React, TypeScript, Tailwind CSS, existing Express API server

---

### Task 1: Extend MarketplaceEntry type with stars and category

**Files:**
- Modify: `packages/core/src/types.ts:353-362`

**Step 1: Update the MarketplaceEntry interface**

Add `stars`, `category`, and `updatedAt` optional fields:

```typescript
export interface MarketplaceEntry {
  name: string;
  description: string;
  source: MarketplaceSource;
  author?: string;
  version?: string;
  downloads?: number;
  stars?: number;
  category?: string;
  updatedAt?: string;
  installed?: boolean;
  type: "skill" | "mcp";
}
```

**Step 2: Verify build**

Run: `pnpm run build`
Expected: PASS — no consumers break since all new fields are optional.

**Step 3: Commit**

```bash
git add packages/core/src/types.ts
git commit -m "feat: add stars, category, updatedAt to MarketplaceEntry"
```

---

### Task 2: Add popular/trending API endpoint + enrich search results with stars

**Files:**
- Modify: `packages/cli/src/core/marketplace.ts`
- Modify: `packages/cli/src/server.ts`
- Modify: `packages/dashboard/src/lib/api.ts`

**Step 1: Add `getPopularSkills()` function in marketplace.ts**

After the existing `searchMarketplace` function, add:

```typescript
export async function getPopularSkills(): Promise<MarketplaceSearchResult[]> {
  // Fetch popular from each known source
  const results: MarketplaceSearchResult[] = [];

  // SkillsMP popular (search with empty/broad query sorted by downloads)
  try {
    const res = await fetch("https://skillsmp.com/api/v1/skills/search?q=&sort=downloads&limit=12");
    if (res.ok) {
      const data = (await res.json()) as { skills: { name: string; description: string; author: string; downloads: number; stars?: number; category?: string }[] };
      const entries: MarketplaceEntry[] = data.skills.map(s => ({
        name: s.name, description: s.description, author: s.author,
        downloads: s.downloads, stars: s.stars, category: s.category,
        source: "skillsmp", type: "skill" as const,
      }));
      results.push({ entries, total: entries.length, source: "skillsmp" });
    }
  } catch {}

  // Anthropic skills (list all from repo tree)
  try {
    const treeRes = await fetch("https://api.github.com/repos/anthropics/skills/git/trees/main",
      { headers: { Accept: "application/vnd.github.v3+json" } });
    if (treeRes.ok) {
      const tree = (await treeRes.json()) as { tree: { path: string; type: string }[] };
      const entries: MarketplaceEntry[] = tree.tree
        .filter(t => t.type === "tree" && !t.path.startsWith("."))
        .slice(0, 12)
        .map(t => ({
          name: t.path,
          description: `Official Anthropic skill: ${t.path}`,
          author: "anthropics",
          source: "anthropic-skills" as const,
          type: "skill" as const,
        }));
      results.push({ entries, total: entries.length, source: "anthropic-skills" });
    }
  } catch {}

  // Claude plugins (local installed)
  try {
    const plugins = await listInstalledPlugins();
    if (plugins.length > 0) {
      results.push({ entries: plugins.slice(0, 6), total: plugins.length, source: "claude-plugins" });
    }
  } catch {}

  return results;
}
```

**Step 2: Add the API endpoint in server.ts**

After the existing `GET /api/marketplace/search` route, add:

```typescript
// GET /api/marketplace/popular
app.get("/api/marketplace/popular", async (_req, res) => {
  try {
    const results = await getPopularSkills();
    res.json(results);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});
```

Update the import line to include `getPopularSkills`:

```typescript
import { searchMarketplace, installFromMarketplace, getPopularSkills } from "./core/marketplace.js";
```

**Step 3: Add API client function in api.ts**

```typescript
export async function fetchPopularSkills(): Promise<MarketplaceSearchResult[]> {
  const res = await fetch(`${API_BASE}/api/marketplace/popular`);
  return res.json();
}
```

**Step 4: Verify build**

Run: `pnpm run build`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/cli/src/core/marketplace.ts packages/cli/src/server.ts packages/dashboard/src/lib/api.ts
git commit -m "feat: add popular skills endpoint for marketplace default view"
```

---

### Task 3: Rewrite MarketplaceBrowser with SkillCard component and all 8 features

**Files:**
- Modify: `packages/dashboard/src/components/MarketplaceBrowser.tsx`

This is the main UI rewrite. The new component includes:

1. **Popular default view** — loads on mount, no search needed
2. **Category chips** — filter bar with predefined categories
3. **Star rating + downloads** — shown on each card
4. **One-click install** — button directly on card
5. **Author + source badge** — `from "author"` with marketplace badge
6. **Installed badge** — green checkmark when already installed
7. **Skill preview expansion** — click card to expand inline preview
8. **Sort options** — Popular / Recent / Stars / A-Z

**Step 1: Replace the entire MarketplaceBrowser.tsx**

The new file structure:

```
MarketplaceBrowser
├── Configured Marketplaces (pills) — preserved from current
├── Remove/Add dialogs — preserved from current
├── Search bar + Sort dropdown + Category chips
├── Results grid with SkillCard components
│   ├── SkillCard (terminal-style code preview)
│   │   ├── Header: traffic lights + filename + stars
│   │   ├── Body: `export <name>`, `from "author"`, description
│   │   ├── Footer: date + source badge + install button
│   │   └── Expanded: full description + install
│   └── Installed badge overlay
└── Empty state / Loading state
```

The full component code for `MarketplaceBrowser.tsx`:

```tsx
import { useState, useEffect, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  fetchMarketplaceRegistry, addMarketplaceToRegistry, removeMarketplaceFromRegistry,
  searchMarketplace as apiSearch, installMarketplaceEntry, fetchPopularSkills,
} from "@/lib/api";
import type { MarketplaceConfig, MarketplaceSearchResult } from "@mycelium/core";

interface MarketplaceItem {
  name: string;
  description: string;
  source: string;
  author?: string;
  downloads?: number;
  stars?: number;
  category?: string;
  updatedAt?: string;
  installed?: boolean;
  type: "skill" | "mcp";
}

const CATEGORIES = ["All", "Testing", "Git", "Debugging", "Frontend", "Backend", "DevOps", "AI", "Code Review", "Documentation"];

type SortOption = "popular" | "recent" | "stars" | "az";

// --- SkillCard: terminal-style code-preview card ---
function SkillCard({
  item, installing, expanded, onInstall, onToggleExpand,
}: {
  item: MarketplaceItem;
  installing: string | null;
  expanded: boolean;
  onInstall: (item: MarketplaceItem) => void;
  onToggleExpand: (name: string) => void;
}) {
  const isInstalling = installing === item.name;
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
          <span className="text-xs text-gray-400 font-mono">{item.name}.md</span>
          {item.installed && (
            <span className="text-[10px] text-green-400 font-medium">INSTALLED</span>
          )}
        </div>
        <div className="flex items-center gap-2">
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
        {/* Line 1: export name */}
        <div className="flex items-center gap-1">
          <span className="text-gray-500 text-xs w-4 text-right shrink-0">1</span>
          <span className="text-purple-400 font-semibold">export</span>
          <span className="text-white font-bold">{item.name}</span>
        </div>
        {/* Line 2: from author */}
        {item.author && (
          <div className="flex items-center gap-1">
            <span className="text-gray-500 text-xs w-4 text-right shrink-0">2</span>
            <span className="ml-4 text-gray-400">from</span>
            <span className="text-green-400">&quot;{item.author}/{item.source}&quot;</span>
          </div>
        )}
        {/* Line 3+: description */}
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
          {item.category && (
            <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] text-primary font-medium">
              {item.category}
            </span>
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
      )}

      {/* Footer — source badge + date + quick install */}
      {!expanded && (
        <div className="flex items-center justify-between px-3 py-2 border-t border-white/5">
          <div className="flex items-center gap-2">
            {item.updatedAt && <span className="text-[10px] text-gray-600">{item.updatedAt}</span>}
            <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-gray-500">{item.source}</span>
          </div>
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
  const [expandedCard, setExpandedCard] = useState<string | null>(null);

  // Registry / marketplace pills state (preserved)
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

    // Load popular by default
    setLoading(true);
    fetchPopularSkills().then(results => {
      const flat = results.flatMap(r => r.entries.map(e => ({ ...e, type: e.type as "skill" | "mcp" })));
      setResults(flat);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  // Search handler
  const handleSearch = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!query.trim()) {
      // Reset to popular
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

  // Install handler
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

  // Marketplace management (preserved)
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

  // Filter by category + sort
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
    // Sort
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
      {/* Configured Marketplaces — preserved */}
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

      {/* Remove Confirmation — preserved */}
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

      {/* Add Marketplace Dialog — preserved */}
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
        <h2 className="text-sm font-medium text-muted-foreground">Popular Skills</h2>
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

      {/* Results grid — SkillCard */}
      {!loading && displayResults.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {displayResults.map(item => (
            <SkillCard
              key={`${item.source}-${item.name}`}
              item={item}
              installing={installing}
              expanded={expandedCard === `${item.source}-${item.name}`}
              onInstall={handleInstall}
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
```

**Step 2: Verify build**

Run: `pnpm run build`
Expected: PASS

**Step 3: Verify tests**

Run: `pnpm test`
Expected: All 415+ tests pass

**Step 4: Commit**

```bash
git add packages/dashboard/src/components/MarketplaceBrowser.tsx
git commit -m "feat: redesign marketplace with SkillCard code-preview cards and 8 new features"
```

---

### Task 4: Verify everything and final commit

**Step 1: Full build**

Run: `pnpm run build`

**Step 2: Full test suite**

Run: `pnpm test`

**Step 3: Push**

```bash
git push
```

---

## Features Summary

| # | Feature | Implementation |
|---|---|---|
| 1 | Popular default view | `fetchPopularSkills()` on mount — no blank state |
| 2 | Category chips | `CATEGORIES` array + client-side filter on name/description |
| 3 | Star rating + downloads | Shown in SkillCard header (yellow star + count) |
| 4 | One-click install | Install button on card footer, no expansion needed |
| 5 | Author + source badge | `from "author/source"` in code preview + source pill in footer |
| 6 | Installed badge | Green "INSTALLED" label in card header + green ring |
| 7 | Skill preview expansion | Click card to expand — shows full description, all stats, bigger install button |
| 8 | Sort options | Dropdown: Popular / Stars / Recent / A-Z with client-side sorting |
