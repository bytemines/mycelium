import { useState } from "react";
import { cn } from "@/lib/utils";
import { ENTRY_TYPE_META } from "@/lib/entry-type-meta";
import { getTrustTier } from "@/lib/trust";
import { SourceIcon } from "./icons/ToolIcons";
import { auditMarketplaceEntry } from "@/lib/api";

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

const TYPE_ICONS: Record<string, string> = {
  skill: "\u2699",      // gear
  mcp: "\u26A1",        // lightning
  plugin: "\u2B22",     // hexagon
  agent: "\u25B6",      // play triangle
  template: "\u25A6",   // square with pattern
};

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
  const icon = TYPE_ICONS[item.type] || "\u25CF";
  const [auditResult, setAuditResult] = useState<{ safe: boolean; findings: Array<{ ruleId: string; severity: string; message: string; match: string }> } | null>(null);
  const [auditing, setAuditing] = useState(false);

  return (
    <div
      className={cn(
        "group rounded-xl border bg-card text-sm shadow-sm transition-all cursor-pointer",
        "hover:shadow-md hover:border-primary/40",
        meta.borderColor,
        expanded && "ring-2 ring-primary/30 shadow-md",
        item.installed && "border-green-500/40"
      )}
      onClick={() => onToggleExpand(itemKey)}
    >
      {/* Header */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-start justify-between gap-2">
          {/* Type icon + name */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-base",
              meta.bgColor, meta.color
            )}>
              {icon}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground truncate">{item.name}</span>
                {item.installed && (
                  <span className="shrink-0 rounded-full bg-green-500/15 px-1.5 py-0.5 text-[10px] font-medium text-green-400">
                    Installed
                  </span>
                )}
                {hasUpdate && (
                  <span className="shrink-0 rounded-full bg-yellow-500/15 px-1.5 py-0.5 text-[10px] font-medium text-yellow-400">
                    Update
                  </span>
                )}
                {(() => {
                  const trust = getTrustTier(item.source);
                  return (
                    <span className={cn("shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium", trust.bgColor, trust.color)}>
                      {trust.tier !== "community" ? "\u2713 " : ""}{trust.label}
                    </span>
                  );
                })()}
              </div>
              {item.author && (
                <span className="text-xs text-muted-foreground">{item.author}</span>
              )}
            </div>
          </div>

          {/* Type badge */}
          <span className={cn(
            "shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
            meta.bgColor, meta.color
          )}>
            {meta.label}
          </span>
        </div>
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

      {/* Stats row — always visible */}
      <div className="flex items-center gap-3 px-4 pb-3 text-xs text-muted-foreground">
        {item.stars != null && (
          <span className="flex items-center gap-1">
            <span className="text-yellow-400">&#9733;</span>
            {formatCount(item.stars)}
          </span>
        )}
        {item.downloads != null && (
          <span className="flex items-center gap-1">
            <span className="text-muted-foreground/60">&#8595;</span>
            {formatCount(item.downloads)}
          </span>
        )}
        {item.latestVersion && (
          <span className="font-mono">v{item.latestVersion}</span>
        )}
        <span className={cn("ml-auto flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px]", meta.bgColor, meta.color)}>
          <SourceIcon source={item.source} size={12} />
          {item.source}
          {item.url && (
            <a href={item.url} target="_blank" rel="noopener noreferrer"
              onClick={e => e.stopPropagation()} className="ml-1 hover:text-primary" title="View source">&#8599;</a>
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
          <div className="flex items-center justify-end gap-2 pt-1">
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
              className="rounded-md px-3 py-1.5 text-xs font-medium border border-border hover:bg-muted disabled:opacity-50 transition-colors"
            >
              {auditing ? "Scanning..." : "\u{1F6E1}\uFE0F Audit"}
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
                  : "bg-primary text-primary-foreground hover:bg-primary/90",
                "disabled:opacity-50"
              )}
            >
              {item.installed ? "Installed" : isInstalling ? "Installing..." : "Install"}
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

      {/* Collapsed footer with quick install */}
      {!expanded && (
        <div className="flex items-center justify-end px-4 pb-3">
          {hasUpdate && (
            <button
              onClick={(e) => { e.stopPropagation(); onUpdate(item); }}
              disabled={isUpdating}
              className="mr-2 rounded-md px-2.5 py-1 text-[11px] font-medium text-yellow-400 hover:bg-yellow-500/15 disabled:opacity-50 transition-colors"
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
