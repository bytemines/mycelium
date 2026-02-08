import { Handle, Position } from "@xyflow/react";

export function AddToolNode({ data }: { data: { onClick?: () => void } }) {
  return (
    <div
      className="px-4 py-3 rounded-lg border-2 border-dashed border-muted-foreground/40 bg-card/50 shadow-md min-w-[130px] cursor-pointer hover:border-primary/60 hover:bg-card transition-all"
      onClick={() => data.onClick?.()}
    >
      <Handle type="target" position={Position.Top} className="!bg-muted !w-3 !h-3" />
      <div className="flex items-center gap-2 justify-center">
        <span className="text-lg text-muted-foreground">+</span>
        <span className="font-medium text-sm text-muted-foreground">Add Tool</span>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-muted !w-3 !h-3" />
    </div>
  );
}
