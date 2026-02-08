import { cn } from "@/lib/utils";

type Status = "synced" | "pending" | "error" | "disabled" | "not_installed";

export function StatusDot({ status }: { status: Status }) {
  const colors: Record<Status, string> = {
    synced: "bg-green-500 shadow-green-500/50",
    pending: "bg-yellow-500 shadow-yellow-500/50",
    error: "bg-red-500 shadow-red-500/50",
    disabled: "bg-gray-500",
    not_installed: "bg-gray-700 border border-gray-500",
  };

  return (
    <span
      data-testid={`node-status-${status}`}
      className={cn("inline-block w-2.5 h-2.5 rounded-full shadow-sm", colors[status])}
    />
  );
}
