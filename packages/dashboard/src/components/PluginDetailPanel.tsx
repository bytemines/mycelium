import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

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
  } | null;
  onClose: () => void;
  onTogglePlugin: (name: string, enabled: boolean) => void;
  onToggleSkill: (pluginName: string, skillName: string, enabled: boolean) => void;
}

export function PluginDetailPanel({ plugin, onClose, onTogglePlugin, onToggleSkill }: PluginDetailPanelProps) {
  const [skillStates, setSkillStates] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (plugin) {
      const initial: Record<string, boolean> = {};
      for (const s of plugin.skills) initial[s] = plugin.enabled;
      setSkillStates(initial);
    }
  }, [plugin]);

  if (!plugin) return null;

  const toggleSkill = (skill: string) => {
    const next = !skillStates[skill];
    setSkillStates(prev => ({ ...prev, [skill]: next }));
    onToggleSkill(plugin.name, skill, next);
  };

  const toggleAll = (enabled: boolean) => {
    const next: Record<string, boolean> = {};
    for (const s of plugin.skills) next[s] = enabled;
    setSkillStates(next);
    onTogglePlugin(plugin.name, enabled);
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 z-50 h-full w-96 overflow-y-auto border-l bg-card text-card-foreground shadow-xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b p-4">
          <div>
            <h2 className="text-lg font-bold">{plugin.name}</h2>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-sm text-muted-foreground">v{plugin.version}</span>
              <span className="rounded-full bg-teal-500/10 px-2 py-0.5 text-xs text-teal-400 border border-teal-500/30">
                {plugin.marketplace}
              </span>
            </div>
            {plugin.author && (
              <p className="mt-1 text-xs text-muted-foreground">by {plugin.author}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
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
              Object.values(skillStates).every(Boolean)
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
              Object.values(skillStates).every(v => !v)
                ? "bg-destructive text-destructive-foreground"
                : "border bg-background text-foreground hover:bg-muted"
            )}
          >
            Disable All
          </button>
        </div>

        {/* Skills */}
        {plugin.skills.length > 0 && (
          <div className="border-b p-4">
            <h3 className="mb-2 text-sm font-medium">Skills</h3>
            <div className="space-y-2">
              {plugin.skills.map((skill) => (
                <div key={skill} className="flex items-center justify-between rounded-md border px-3 py-2">
                  <span className="text-sm">{skill}</span>
                  <button
                    role="switch"
                    aria-checked={skillStates[skill] ?? true}
                    aria-label={`Toggle ${skill}`}
                    onClick={() => toggleSkill(skill)}
                    className={cn(
                      "relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                      skillStates[skill] ? "bg-primary" : "bg-muted"
                    )}
                  >
                    <span
                      className={cn(
                        "pointer-events-none inline-block h-3 w-3 rounded-full bg-white shadow-sm transition-transform",
                        skillStates[skill] ? "translate-x-3" : "translate-x-0"
                      )}
                    />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Agents */}
        {plugin.agents.length > 0 && (
          <div className="border-b p-4">
            <h3 className="mb-2 text-sm font-medium">Agents</h3>
            <div className="space-y-1">
              {plugin.agents.map((agent) => (
                <div key={agent} className="rounded-md border px-3 py-2 text-sm text-muted-foreground">
                  {agent}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Commands */}
        {plugin.commands.length > 0 && (
          <div className="p-4">
            <h3 className="mb-2 text-sm font-medium">Commands</h3>
            <div className="space-y-1">
              {plugin.commands.map((cmd) => (
                <div key={cmd} className="rounded-md border px-3 py-2 text-sm font-mono text-muted-foreground">
                  {cmd}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
