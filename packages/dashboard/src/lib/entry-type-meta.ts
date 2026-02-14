/**
 * UI display metadata for marketplace entry types.
 * Moved from @mycelish/core since it contains Tailwind CSS classes (UI concern).
 */
export const ENTRY_TYPE_META: Record<string, { label: string; color: string; bgColor: string; borderColor: string; fileExt: string }> = {
  skill:    { label: "Skill",    color: "text-purple-400", bgColor: "bg-purple-500/10", borderColor: "border-purple-500/30", fileExt: ".md" },
  mcp:      { label: "MCP",      color: "text-blue-400",   bgColor: "bg-blue-500/10",   borderColor: "border-blue-500/30",   fileExt: ".yaml" },
  plugin:   { label: "Plugin",   color: "text-amber-400",  bgColor: "bg-amber-500/10",  borderColor: "border-amber-500/30",  fileExt: ".json" },
  agent:    { label: "Agent",    color: "text-emerald-400",bgColor: "bg-emerald-500/10",borderColor: "border-emerald-500/30",fileExt: ".md" },
  command:  { label: "Command",  color: "text-blue-400",   bgColor: "bg-blue-500/10",   borderColor: "border-blue-500/30",   fileExt: ".md" },
  template: { label: "Template", color: "text-pink-400",   bgColor: "bg-pink-500/10",   borderColor: "border-pink-500/30",   fileExt: ".yaml" },
};
