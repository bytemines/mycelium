import { memo } from "react";
import { Handle, Position } from "@xyflow/react";

function AddToolNodeInner({ data, sourcePosition, targetPosition }: { data: { onClick?: () => void }; sourcePosition?: Position; targetPosition?: Position }) {
  return (
    <div
      className="px-4 py-3 rounded-lg border-2 border-dashed border-muted-foreground/40 bg-card/50 shadow-md min-w-[130px] cursor-pointer hover:border-primary/60 hover:bg-card transition-colors"
      onClick={() => data.onClick?.()}
    >
      <Handle type="target" position={targetPosition ?? Position.Top} className="!bg-muted !w-3 !h-3" />
      <div className="flex items-center gap-2 justify-center">
        <span className="text-lg text-muted-foreground">+</span>
        <span className="font-medium text-sm text-muted-foreground">Add Tool</span>
      </div>
      <Handle type="source" position={sourcePosition ?? Position.Bottom} className="!bg-muted !w-3 !h-3" />
    </div>
  );
}

export const AddToolNode = memo(AddToolNodeInner);
