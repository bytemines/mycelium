import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { cn } from "@/lib/utils";
import type { Status } from "@/types";
import { TOOL_ICONS } from "../icons/ToolIcons";
import { StatusDot } from "./StatusDot";

export interface ToolNodeData {
  name: string;
  status: Status;
  installed: boolean;
}

function ToolNodeInner({ data }: { data: ToolNodeData }) {
  const isInstalled = data.installed !== false;

  return (
    <div
      className={cn(
        "px-4 py-3 rounded-lg border-2 bg-card shadow-lg min-w-[130px] transition-all",
        isInstalled
          ? "border-primary/60 hover:border-primary hover:shadow-primary/20"
          : "border-gray-600 opacity-50"
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-primary !w-3 !h-3" />
      <div className="flex items-center gap-2">
        {TOOL_ICONS[data.name] ?? null}
        <StatusDot status={isInstalled ? data.status : "not_installed"} />
        <span className={cn("font-medium text-sm", !isInstalled && "text-gray-500")}>
          {data.name}
        </span>
      </div>
      {!isInstalled && (
        <div className="text-[10px] text-gray-500 mt-1">Not installed</div>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-primary !w-3 !h-3" />
    </div>
  );
}

export const ToolNode = memo(ToolNodeInner);
