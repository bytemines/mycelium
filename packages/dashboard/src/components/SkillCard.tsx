import { useState, useRef, useEffect } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ENTRY_TYPE_META } from "@/lib/entry-type-meta";
import { getTrustTier } from "@/lib/trust";
import { SourceIcon } from "./icons/ToolIcons";
import { auditMarketplaceEntry, fetchItemContent } from "@/lib/api";
import { Sparkles, Bot, Terminal, Puzzle, Server, FileText, ShieldCheck } from "lucide-react";

export interface MarketplaceItem {
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
  type: string;
  url?: string;
}

const DEFAULT_TYPE_META = { label: "Item", color: "text-gray-400", bgColor: "bg-gray-500/10", borderColor: "border-gray-500/30", fileExt: ".md" };

/** Lucide icons matching the graph nodes (PluginNode uses Sparkles/Bot/Terminal) */
function getTypeIcon(type: string, size: number): ReactNode {
  switch (type) {
    case "skill": return <Sparkles size={size} />;
    case "mcp": return <Server size={size} />;
    case "plugin": return <Puzzle size={size} />;
    case "agent": return <Bot size={size} />;
    case "command": return <Terminal size={size} />;
    default: return <FileText size={size} />;
  }
}

function getTypeMeta(type: string) {
  return ENTRY_TYPE_META[type] || DEFAULT_TYPE_META;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function SkillCard({
  item, installing, updating, removing, expanded, onInstall, onUpdate, onRemove, onToggleExpand,
}: {
  item: MarketplaceItem;
  installing: string | null;
  updating: string | null;
  removing?: string | null;
  expanded: boolean;
  onInstall: (item: MarketplaceItem) => void;
  onUpdate: (item: MarketplaceItem) => void;
  onRemove?: (item: MarketplaceItem) => void;
  onToggleExpand: (key: string) => void;
}) {
  const itemKey = `${item.source}-${item.name}`;
  const isInstalling = installing === itemKey;
  const isUpdating = updating === itemKey;
  const isRemoving = removing === itemKey;
  const hasUpdate = item.installed && item.latestVersion && item.installedVersion && item.latestVersion !== item.installedVersion;
  const meta = getTypeMeta(item.type);
  const trust = getTrustTier(item.source);
  const isPlugin = item.type === "plugin";
  const [auditResult, setAuditResult] = useState<{ safe: boolean; findings: Array<{ ruleId: string; severity: string; message: string; match: string }> } | null>(null);
  const [auditing, setAuditing] = useState(false);
  const [contentPreview, setContentPreview] = useState<string | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  async function handleExpand() {
    onToggleExpand(itemKey);
    // Fetch content on first expand
    if (!expanded && item.url && contentPreview === null) {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoadingContent(true);
      try {
        const content = await fetchItemContent(item.url, item.type, controller.signal);
        if (!controller.signal.aborted) {
          setContentPreview(content ?? "");
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoadingContent(false);
        }
      }
    }
  }

  return (
    <div
      className={cn(
        "group relative flex flex-col rounded-xl border bg-card text-sm shadow-sm transition-all cursor-pointer",
        "hover:shadow-md hover:border-primary/40",
        meta.borderColor,
        expanded && "ring-2 ring-primary/30 shadow-md",
        item.installed && "border-green-500/40"
      )}
      onClick={handleExpand}
    >
      {/* Type badge — top-right */}
      <span className={cn(
        "absolute top-3 right-3 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
        meta.bgColor, meta.color
      )}>
        {meta.label}
      </span>

      {/* Icon + Name (full width) */}
      <div className="px-4 pt-4 pb-1">
        <div className="flex items-center gap-2.5 pr-16">
          <div className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
            meta.bgColor, meta.color
          )}>
            {getTypeIcon(item.type, 18)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-foreground break-words leading-tight">{item.name}</div>
            {item.author && (
              <span className="text-xs text-muted-foreground">{item.author}</span>
            )}
          </div>
        </div>
      </div>

      {/* Badges row — separate line, wrapping */}
      <div className="flex flex-wrap items-center gap-1.5 px-4 pb-2">
        {item.installed && (
          <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] font-medium text-green-400">
            Installed
          </span>
        )}
        {hasUpdate && (
          <span className="rounded-full bg-yellow-500/15 px-2 py-0.5 text-[10px] font-medium text-yellow-400">
            Update
          </span>
        )}
        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", trust.bgColor, trust.color)}>
          {trust.tier !== "community" ? "\u2713 " : ""}{trust.label}
        </span>
      </div>

      {/* Description */}
      <div className="px-4 pb-3">
        <p className={cn(
          "text-xs text-muted-foreground leading-relaxed",
          !expanded && "line-clamp-2"
        )}>
          {item.description}
        </p>
      </div>

      {/* Bottom row: version | stats | source */}
      <div className="flex items-center gap-3 px-4 pb-3 text-xs text-muted-foreground">
        {item.latestVersion && (
          <span className="font-mono text-[11px]">v{item.latestVersion}</span>
        )}
        {item.stars != null && (
          <span className="flex items-center gap-0.5">
            <span className="text-yellow-400">&#9733;</span>
            {formatCount(item.stars)}
          </span>
        )}
        {item.downloads != null && (
          <span className="flex items-center gap-0.5">
            <span className="text-muted-foreground/60">&#8595;</span>
            {formatCount(item.downloads)}
          </span>
        )}
        <span className={cn("ml-auto flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px]", meta.bgColor, meta.color)}>
          <SourceIcon source={item.source} size={12} />
          {item.source}
          {item.url && (
            <a href={item.url} target="_blank" rel="noopener noreferrer"
              onClick={e => e.stopPropagation()} className="ml-0.5 hover:text-primary" title="View source">&#8599;</a>
          )}
        </span>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-border/50 px-4 py-3 space-y-3">
          {item.category && (
            <div className="flex flex-wrap gap-1.5">
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] text-primary font-medium">
                {item.category}
              </span>
            </div>
          )}
          {(item.installedVersion || item.latestVersion) && (
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              {item.installedVersion && <span>Installed: <span className="font-mono">v{item.installedVersion}</span></span>}
              {item.latestVersion && <span>Latest: <span className="font-mono">v{item.latestVersion}</span></span>}
            </div>
          )}
          {item.updatedAt && (
            <div className="text-xs text-muted-foreground">Updated: {item.updatedAt}</div>
          )}

          {/* Content preview */}
          {loadingContent && (
            <div className="text-xs text-muted-foreground">Loading definition...</div>
          )}
          {contentPreview && (
            <div className="rounded-md border border-border/50 bg-muted/30 p-3">
              <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Definition</div>
              <pre className="max-h-48 overflow-auto text-[11px] text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed">
                {contentPreview.slice(0, 2000)}{contentPreview.length > 2000 ? "\n..." : ""}
              </pre>
            </div>
          )}

          {/* Action buttons — centered */}
          <div className="flex items-center justify-center gap-2 pt-1">
            <button
              onClick={async (e) => {
                e.stopPropagation();
                setAuditing(true);
                try {
                  const result = await auditMarketplaceEntry(item.name, item.source, item.type);
                  setAuditResult(result);
                } catch { setAuditResult(null); }
                finally { setAuditing(false); }
              }}
              disabled={auditing}
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium border border-border hover:bg-muted disabled:opacity-50 transition-colors"
            >
              <ShieldCheck size={14} />
              {auditing ? "Scanning..." : "Audit"}
            </button>
            {item.installed && onRemove && (
              <button
                onClick={(e) => { e.stopPropagation(); onRemove(item); }}
                disabled={isRemoving}
                className="rounded-md px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/15 disabled:opacity-50 transition-colors"
              >
                {isRemoving ? "Removing..." : "Remove"}
              </button>
            )}
            {hasUpdate && (
              <button
                onClick={(e) => { e.stopPropagation(); onUpdate(item); }}
                disabled={isUpdating}
                className="rounded-md px-3 py-1.5 text-xs font-medium bg-yellow-500/15 text-yellow-400 hover:bg-yellow-500/25 disabled:opacity-50 transition-colors"
              >
                {isUpdating ? "Updating..." : "Update"}
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onInstall(item); }}
              disabled={item.installed || isInstalling}
              className={cn(
                "rounded-md px-4 py-1.5 text-xs font-medium transition-colors",
                item.installed
                  ? "border border-green-500/30 text-green-400 bg-green-500/10"
                  : isPlugin
                    ? "bg-amber-500/80 text-white hover:bg-amber-500"
                    : "bg-primary text-primary-foreground hover:bg-primary/90",
                "disabled:opacity-50"
              )}
            >
              {item.installed ? "Installed" : isInstalling ? "Installing..." : isPlugin ? "Install Plugin" : "Install"}
            </button>
          </div>
          {auditResult && (
            <div className="space-y-1.5 pt-2 border-t border-border/50">
              {auditResult.safe ? (
                <span className="text-xs text-green-400 font-medium">{"\u2713"} No security issues found</span>
              ) : (
                <>
                  <span className="text-xs font-medium text-muted-foreground">{auditResult.findings.length} finding(s):</span>
                  {auditResult.findings.slice(0, 5).map((f, i) => (
                    <div key={i} className={cn("rounded px-2 py-1 text-[11px]",
                      f.severity === "critical" ? "bg-red-500/15 text-red-400" :
                      f.severity === "high" ? "bg-orange-500/15 text-orange-400" :
                      f.severity === "medium" ? "bg-yellow-500/15 text-yellow-400" :
                      "bg-blue-500/15 text-blue-400"
                    )}>
                      <span className="font-medium">[{f.severity}]</span> {f.message}
                    </div>
                  ))}
                  {auditResult.findings.length > 5 && (
                    <span className="text-[11px] text-muted-foreground">...and {auditResult.findings.length - 5} more</span>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Collapsed footer with quick install — centered */}
      {!expanded && (
        <div className="mt-auto flex items-center justify-center gap-2 px-4 pb-3">
          {hasUpdate && (
            <button
              onClick={(e) => { e.stopPropagation(); onUpdate(item); }}
              disabled={isUpdating}
              className="rounded-md px-2.5 py-1 text-[11px] font-medium text-yellow-400 hover:bg-yellow-500/15 disabled:opacity-50 transition-colors"
            >
              {isUpdating ? "..." : "Update"}
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onInstall(item); }}
            disabled={item.installed || isInstalling}
            className={cn(
              "rounded-md px-3 py-1 text-[11px] font-medium transition-colors",
              item.installed
                ? "text-green-400 bg-green-500/10"
                : isPlugin
                  ? "bg-amber-500/80 text-white hover:bg-amber-500"
                  : "bg-primary/80 text-primary-foreground hover:bg-primary",
              "disabled:opacity-50"
            )}
          >
            {item.installed ? "Installed" : isInstalling ? "..." : isPlugin ? "Install Plugin" : "Install"}
          </button>
        </div>
      )}
    </div>
  );
}
