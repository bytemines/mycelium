import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Sparkles, Bot, Terminal, Webhook, Library } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";

interface PluginDetailPanelProps {
  plugin: {
    name: string;
    marketplace: string;
    version: string;
    description: string;
    author?: string;
    enabled: boolean;
    skills: string[];
    agents: string[];
    commands: string[];
    hooks?: string[];
    libs?: string[];
  } | null;
  onClose: () => void;
  onTogglePlugin: (name: string, enabled: boolean) => void;
  onToggleItem?: (pluginName: string, itemName: string, enabled: boolean) => void;
  onRemoveItem?: (type: "skill" | "mcp" | "plugin", name: string) => void;
}

// Section header with count badge and color
const SECTION_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  skill:   { label: "Skills",    color: "text-purple-400", icon: <Sparkles size={14} className="text-purple-400" /> },
  agent:   { label: "Agents",    color: "text-emerald-400", icon: <Bot size={14} className="text-emerald-400" /> },
  command: { label: "Commands",  color: "text-blue-400", icon: <Terminal size={14} className="text-blue-400" /> },
  hook:    { label: "Hooks",     color: "text-amber-400", icon: <Webhook size={14} className="text-amber-400" /> },
  lib:     { label: "Libraries", color: "text-pink-400", icon: <Library size={14} className="text-pink-400" /> },
};

export function PluginDetailPanel({ plugin, onClose, onTogglePlugin, onToggleItem, onRemoveItem }: PluginDetailPanelProps) {
  const [toggleStates, setToggleStates] = useState<Record<string, boolean>>({});
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => {
    if (plugin) {
      const initial: Record<string, boolean> = {};
      const allItems = [
        ...plugin.skills,
        ...plugin.agents,
        ...plugin.commands,
        ...(plugin.hooks ?? []),
        ...(plugin.libs ?? []),
      ];
      for (const item of allItems) initial[item] = plugin.enabled;
      setToggleStates(initial);
    }
  }, [plugin]);

  if (!plugin) return null;

  const toggleAll = (enabled: boolean) => {
    const next: Record<string, boolean> = {};
    for (const key of Object.keys(toggleStates)) next[key] = enabled;
    setToggleStates(next);
    onTogglePlugin(plugin.name, enabled);
  };

  const sections: Array<{ type: string; items: string[] }> = [
    { type: "skill", items: plugin.skills },
    { type: "agent", items: plugin.agents },
    { type: "command", items: plugin.commands },
    { type: "hook", items: plugin.hooks ?? [] },
    { type: "lib", items: plugin.libs ?? [] },
  ].filter(s => s.items.length > 0);

  const totalComponents = sections.reduce((sum, s) => sum + s.items.length, 0);

  return (
    <Dialog.Root open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content className="fixed right-0 top-0 z-50 h-full w-96 overflow-y-auto border-l bg-card text-card-foreground shadow-xl">
          {/* Header */}
          <div className="flex items-start justify-between border-b p-4">
            <div>
              <Dialog.Title className="text-lg font-bold">{plugin.name}</Dialog.Title>
              <Dialog.Description asChild>
                <div className="mt-1 flex items-center gap-2">
                  {plugin.version && <span className="text-sm text-muted-foreground">v{plugin.version}</span>}
                  <span className="rounded-full bg-teal-500/10 px-2 py-0.5 text-xs text-teal-400 border border-teal-500/30">
                    {plugin.marketplace}
                  </span>
                </div>
              </Dialog.Description>
              {plugin.author && (
                <p className="mt-1 text-xs text-muted-foreground">by {plugin.author}</p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">{totalComponents} components</p>
            </div>
            <Dialog.Close asChild>
              <button
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Close"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </Dialog.Close>
          </div>

          {/* Description */}
          <div className="border-b p-4">
            <p className="text-sm text-muted-foreground">{plugin.description}</p>
          </div>

          {/* Enable/Disable All */}
          <div className="flex gap-2 border-b p-4">
            <button
              onClick={() => toggleAll(true)}
              className={cn(
                "flex-1 rounded-md px-3 py-1.5 text-sm font-medium",
                Object.values(toggleStates).every(Boolean)
                  ? "bg-primary text-primary-foreground"
                  : "border bg-background text-foreground hover:bg-muted"
              )}
            >
              Enable All
            </button>
            <button
              onClick={() => toggleAll(false)}
              className={cn(
                "flex-1 rounded-md px-3 py-1.5 text-sm font-medium",
                Object.values(toggleStates).every(v => !v)
                  ? "bg-destructive text-destructive-foreground"
                  : "border bg-background text-foreground hover:bg-muted"
              )}
            >
              Disable All
            </button>
          </div>

          {/* Component sections */}
          {sections.map(({ type, items }) => {
            const meta = SECTION_META[type] ?? { label: type, color: "text-muted-foreground", icon: "?" };
            return (
              <div key={type} className="border-b p-4">
                <h3 className="mb-2 flex items-center gap-2 text-sm font-medium">
                  {meta.icon}
                  <span className={cn("font-bold", meta.color)}>{meta.label}</span>
                  <span className="rounded-full bg-muted px-1.5 py-0 text-[10px] text-muted-foreground">{items.length}</span>
                </h3>
                <div className="space-y-2">
                  {items.map((item) => (
                    <div key={item} className="flex items-center justify-between rounded-md border px-3 py-2">
                      <span className="text-sm">{item}</span>
                      <button
                        onClick={() => {
                          const next = !toggleStates[item];
                          setToggleStates((prev) => ({ ...prev, [item]: next }));
                          onToggleItem?.(plugin.name, item, next);
                        }}
                        className={cn(
                          "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                          toggleStates[item] ? "bg-primary" : "bg-muted"
                        )}
                        role="switch"
                        aria-checked={toggleStates[item]}
                        aria-label={`Toggle ${item}`}
                      >
                        <span
                          className={cn(
                            "pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
                            toggleStates[item] ? "translate-x-4" : "translate-x-0"
                          )}
                        />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Delete */}
          {onRemoveItem && (
            <div className="p-4">
              <h3 className="mb-2 text-sm font-medium text-destructive">Danger Zone</h3>
              <button
                onClick={() => setConfirmRemove(true)}
                className="w-full rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/20"
              >
                Remove {plugin.marketplace === "system" ? "MCP" : plugin.marketplace === "standalone" ? "Skill" : "Plugin"}
              </button>
              <p className="mt-2 text-xs text-muted-foreground">
                This removes it from ~/.mycelium. Run <code className="bg-muted px-1 rounded">mycelium sync</code> to propagate to all tools.
              </p>
            </div>
          )}

          {/* Remove confirmation modal */}
          <Dialog.Root open={confirmRemove} onOpenChange={setConfirmRemove}>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/60" />
              <Dialog.Content className="fixed left-1/2 top-1/2 z-[70] w-80 -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-card p-6 shadow-2xl">
                <Dialog.Title className="text-lg font-bold text-destructive">Remove {plugin.name}?</Dialog.Title>
                <Dialog.Description className="mt-2 text-sm text-muted-foreground">
                  This will remove all components ({sections.reduce((sum, s) => sum + s.items.length, 0)} total) from ~/.mycelium.
                  Run <code className="bg-muted px-1 rounded text-xs">mycelium sync</code> after to propagate.
                </Dialog.Description>
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => {
                      const type = plugin.marketplace === "system" ? "mcp" as const
                        : plugin.marketplace === "standalone" ? "skill" as const
                        : "plugin" as const;
                      onRemoveItem?.(type, plugin.name);
                      setConfirmRemove(false);
                      onClose();
                    }}
                    className="flex-1 rounded-md bg-destructive px-3 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90"
                  >
                    Yes, remove
                  </button>
                  <Dialog.Close asChild>
                    <button className="flex-1 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">
                      Cancel
                    </button>
                  </Dialog.Close>
                </div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
