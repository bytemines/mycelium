import { cn } from "@/lib/utils";
import { ENTRY_TYPE_META } from "@mycelium/core";

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
}

const DEFAULT_TYPE_META = { label: "Item", color: "text-gray-400", bgColor: "bg-gray-500/10", borderColor: "border-gray-500/30", fileExt: ".md" };

function getTypeMeta(type: string) {
  return ENTRY_TYPE_META[type] || DEFAULT_TYPE_META;
}

export function SkillCard({
  item, installing, updating, expanded, onInstall, onUpdate, onToggleExpand,
}: {
  item: MarketplaceItem;
  installing: string | null;
  updating: string | null;
  expanded: boolean;
  onInstall: (item: MarketplaceItem) => void;
  onUpdate: (item: MarketplaceItem) => void;
  onToggleExpand: (key: string) => void;
}) {
  const itemKey = `${item.source}-${item.name}`;
  const isInstalling = installing === itemKey;
  const isUpdating = updating === itemKey;
  const hasUpdate = item.installed && item.latestVersion && item.installedVersion && item.latestVersion !== item.installedVersion;
  const meta = getTypeMeta(item.type);

  return (
    <div
      className={cn(
        "rounded-lg border bg-[#1a1a2e] text-sm shadow-md transition-all cursor-pointer hover:shadow-lg",
        meta.borderColor,
        expanded && "ring-1 ring-primary/30",
        item.installed && "ring-1 ring-green-500/30",
        !expanded && !item.installed && `hover:${meta.borderColor}`
      )}
      onClick={() => onToggleExpand(itemKey)}
    >
      {/* Header — type accent bar + traffic lights + filename */}
      <div className={cn("flex items-center justify-between px-3 py-2 border-b border-white/5")}>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
            <span className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
          </div>
          <span className="text-xs text-gray-400 font-mono">{item.name}{meta.fileExt}</span>
          {/* Type badge */}
          <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide", meta.bgColor, meta.color)}>
            {meta.label}
          </span>
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

      {/* Left accent stripe */}
      <div className="flex">
        <div className={cn("w-1 shrink-0 rounded-bl-lg", meta.bgColor)} />
        <div className="flex-1">
          {/* Body — code preview */}
          <div className="px-3 py-3 font-mono space-y-1">
            <div className="flex items-center gap-1">
              <span className="text-gray-500 text-xs w-4 text-right shrink-0">1</span>
              <span className={cn("font-semibold", meta.color)}>export</span>
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
                <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", meta.bgColor, meta.color)}>
                  {meta.label}
                </span>
              </div>
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
                <span className={cn("rounded-full px-2 py-0.5 text-[10px]", meta.bgColor, meta.color)}>
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
      </div>
    </div>
  );
}
