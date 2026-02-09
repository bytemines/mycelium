import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { Sparkles, Bot, Terminal, Webhook, Library } from "lucide-react";
import { StatusDot } from "./StatusDot";

export interface PluginNodeData {
  name: string;
  marketplace: string;
  componentCount: number;
  skillCount: number;
  agentCount: number;
  commandCount: number;
  hookCount: number;
  libCount: number;
  enabled: boolean;
  onToggle?: (name: string, enabled: boolean) => void;
  onClick?: (name: string) => void;
}

function PluginNodeInner({ data }: { data: PluginNodeData }) {
  const isEnabled = data.enabled !== false;

  return (
    <div
      className={cn(
        "px-3 py-2 rounded-md border shadow-md min-w-[110px] transition-colors hover:border-white/40 cursor-pointer",
        "border-teal-500/60",
        "bg-teal-500/10",
        !isEnabled && "opacity-50"
      )}
      onClick={() => data.onClick?.(data.name)}
    >
      <Handle type="target" position={Position.Top} className="!bg-muted !w-2 !h-2" />
      <div className="flex items-center gap-2">
        <StatusDot status={isEnabled ? "synced" : "disabled"} />
        <span className="text-sm font-medium truncate max-w-[100px]">{data.name}</span>
        <button
          role="switch"
          aria-checked={isEnabled}
          aria-label={`Toggle ${data.name}`}
          onClick={(e) => {
            e.stopPropagation();
            data.onToggle?.(data.name, !isEnabled);
          }}
          className={cn(
            "ml-auto relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
            isEnabled ? "bg-primary" : "bg-muted"
          )}
        >
          <span
            className={cn(
              "pointer-events-none inline-block h-3 w-3 rounded-full bg-white shadow-sm transition-transform",
              isEnabled ? "translate-x-3" : "translate-x-0"
            )}
          />
        </button>
      </div>
      <div className="flex items-center gap-2 mt-0.5">
        <span className="rounded-full bg-teal-500/20 px-1.5 py-0 text-[9px] text-teal-400">{data.marketplace}</span>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          {data.skillCount > 0 && <span className="flex items-center gap-0.5" title="Skills"><Sparkles size={10} className="text-purple-400" />{data.skillCount}</span>}
          {data.agentCount > 0 && <span className="flex items-center gap-0.5" title="Agents"><Bot size={10} className="text-emerald-400" />{data.agentCount}</span>}
          {data.commandCount > 0 && <span className="flex items-center gap-0.5" title="Commands"><Terminal size={10} className="text-blue-400" />{data.commandCount}</span>}
          {data.hookCount > 0 && <span className="flex items-center gap-0.5" title="Hooks"><Webhook size={10} className="text-amber-400" />{data.hookCount}</span>}
          {data.libCount > 0 && <span className="flex items-center gap-0.5" title="Libraries"><Library size={10} className="text-pink-400" />{data.libCount}</span>}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-muted !w-2 !h-2" />
    </div>
  );
}

export const PluginNode = memo(PluginNodeInner);
