import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { cn } from "@/lib/utils";
import type { Status } from "@/types";
import { StatusDot } from "./StatusDot";

export type ResourceType = "skill" | "mcp" | "memory" | "agent" | "command" | "rule";

export interface ResourceNodeData {
  name: string;
  type: ResourceType;
  status: Status;
  enabled?: boolean;
  onToggle?: (type: ResourceType, name: string, enabled: boolean) => void;
}

function ResourceNodeInner({ data, sourcePosition, targetPosition }: { data: ResourceNodeData; sourcePosition?: Position; targetPosition?: Position }) {
  const isEnabled = data.enabled !== false;
  const typeStyles: Record<string, { border: string; bg: string }> = {
    skill: { border: "border-blue-500/60", bg: "bg-[#0c1529]" },
    mcp: { border: "border-purple-500/60", bg: "bg-[#150c29]" },
    memory: { border: "border-amber-500/60", bg: "bg-[#1a1408]" },
    agent: { border: "border-amber-500/60", bg: "bg-[#1a1408]" },
    command: { border: "border-cyan-500/60", bg: "bg-[#0c1a29]" },
    rule: { border: "border-violet-500/60", bg: "bg-[#150c29]" },
  };

  const style = typeStyles[data.type] || typeStyles.skill;

  return (
    <div
      className={cn(
        "px-3 py-2 rounded-md border shadow-md min-w-[110px] transition-colors hover:border-white/40",
        style.border,
        style.bg,
        !isEnabled && "opacity-50"
      )}
    >
      <Handle type="target" position={targetPosition ?? Position.Top} className="!bg-muted !w-2 !h-2" />
      <div className="flex items-center gap-2">
        <StatusDot status={isEnabled ? data.status : "disabled"} />
        <span className="text-sm font-medium truncate max-w-[100px]">{data.name}</span>
        <button
          role="switch"
          aria-checked={isEnabled}
          aria-label={`Toggle ${data.name}`}
          onClick={(e) => {
            e.stopPropagation();
            data.onToggle?.(data.type, data.name, !isEnabled);
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
      <div className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-wider">
        {data.type}
      </div>
      <Handle type="source" position={sourcePosition ?? Position.Bottom} className="!bg-muted !w-2 !h-2" />
    </div>
  );
}

export const ResourceNode = memo(ResourceNodeInner);
