import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ENTRY_TYPE_META } from "@/lib/entry-type-meta";
import { getTrustTier } from "@/lib/trust";
import { Sparkles, Bot, Terminal, Puzzle, Plug, FileText, Check } from "lucide-react";

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

function getTypeIcon(type: string, size: number): ReactNode {
  switch (type) {
    case "skill": return <Sparkles size={size} />;
    case "mcp": return <Plug size={size} />;
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
  item, installing, updating, onInstall, onUpdate, onSelect,
}: {
  item: MarketplaceItem;
  installing: string | null;
  updating: string | null;
  onInstall: (item: MarketplaceItem) => void;
  onUpdate: (item: MarketplaceItem) => void;
  onSelect: (item: MarketplaceItem) => void;
}) {
  const itemKey = `${item.source}-${item.name}`;
  const isInstalling = installing === itemKey;
  const isUpdating = updating === itemKey;
  const hasUpdate = item.installed && item.latestVersion && item.installedVersion && item.latestVersion !== item.installedVersion;
  const meta = getTypeMeta(item.type);
  const trust = getTrustTier(item.source);
  const isPlugin = item.type === "plugin";

  return (
    <div
      className={cn(
        "group relative flex flex-col rounded-xl border border-border bg-card text-sm shadow-sm transition-all cursor-pointer",
        "hover:shadow-md hover:border-primary/40"
      )}
      onClick={() => onSelect(item)}
    >
      {/* Type badge — top-right, subtle */}
      <span className={cn(
        "absolute top-3 right-3 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider opacity-70",
        meta.bgColor, meta.color
      )}>
        {meta.label}
      </span>

      {/* Icon + Name + Author */}
      <div className="px-4 pt-4 pb-1">
        <div className="flex items-center gap-2.5 pr-16">
          <div className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
            meta.bgColor, meta.color
          )}>
            {getTypeIcon(item.type, 18)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-foreground break-words leading-tight">{item.name}</span>
              {/* Installed dot */}
              {item.installed && (
                <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-green-500" title={`Installed${item.installedVersion ? ` (v${item.installedVersion})` : ""}`} />
              )}
              {/* Trust checkmark for official/verified */}
              {trust.tier !== "community" && (
                <span title={`Verified: ${trust.tier} source`}>
                  <Check size={13} className="shrink-0 text-white opacity-60" strokeWidth={3} />
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {item.author && <span>{item.author}</span>}
              {item.stars != null && (
                <span className="flex items-center gap-0.5">
                  <span className="text-yellow-400">&#9733;</span>
                  {formatCount(item.stars)}
                </span>
              )}
              {item.downloads != null && item.downloads > 0 && (
                <span className="flex items-center gap-0.5" title="Weekly npm downloads">
                  <span className="text-green-400">&#8615;</span>
                  {formatCount(item.downloads)}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Description — 2 lines */}
      <div className="px-4 pb-3 flex-1">
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
          {item.description}
        </p>
      </div>

      {/* Bottom row: action buttons right-aligned */}
      <div className="mt-auto flex items-center justify-end gap-2 px-4 pb-3">
        {hasUpdate && (
          <button
            onClick={(e) => { e.stopPropagation(); onUpdate(item); }}
            disabled={isUpdating}
            title={`Update to latest version${item.latestVersion ? ` (v${item.latestVersion})` : ""}`}
            className="rounded-md px-2.5 py-1 text-[11px] font-medium bg-yellow-500/15 text-yellow-400 hover:bg-yellow-500/25 disabled:opacity-50 transition-colors"
          >
            {isUpdating ? "..." : "Update"}
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onInstall(item); }}
          disabled={item.installed || isInstalling}
          title={item.installed ? "Already installed" : `Install this ${item.type}`}
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
    </div>
  );
}
