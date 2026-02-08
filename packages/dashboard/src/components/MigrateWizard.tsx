import { useState, useCallback } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { Graph } from "./Graph";
import { PluginDetailPanel } from "./PluginDetailPanel";
import { scanTools, applyMigration } from "@/lib/api";
import { cn } from "@/lib/utils";

type WizardStep = "scan" | "review" | "apply" | "done";
type Status = "synced" | "pending" | "error" | "disabled";

interface ScanData {
  toolId: string;
  toolName: string;
  installed: boolean;
  skills: Array<{ name: string; source: string; marketplace?: string; pluginName?: string }>;
  mcps: Array<{ name: string; source: string; config: { command: string } }>;
  memory: Array<{ name: string; source: string }>;
}

interface ToggleState {
  skills: Record<string, boolean>;
  mcps: Record<string, boolean>;
  memory: Record<string, boolean>;
  tools: Record<string, boolean>; // destination tools
}

function buildGraphData(scans: ScanData[], toggleState: ToggleState) {
  // Tools as destinations — installed ones are pre-selected
  const toolSet = new Map<string, { id: string; name: string; installed: boolean }>();
  for (const scan of scans) {
    if (scan.installed) {
      toolSet.set(scan.toolId, { id: scan.toolId, name: scan.toolName, installed: true });
    }
  }

  const tools = Array.from(toolSet.values()).map(t => ({
    id: t.id,
    name: t.name,
    status: (toggleState.tools[t.id] !== false ? "synced" : "disabled") as Status,
    installed: true,
  }));

  // Group skills by plugin
  const pluginMap = new Map<string, { marketplace: string; skills: string[]; enabled: boolean }>();
  const standaloneSkills: Array<{ name: string; status: Status; enabled: boolean; connectedTools: string[] }> = [];

  for (const scan of scans) {
    for (const skill of scan.skills) {
      if (skill.marketplace && skill.pluginName) {
        const key = `${skill.marketplace}/${skill.pluginName}`;
        const existing = pluginMap.get(key);
        if (existing) {
          if (!existing.skills.includes(skill.name)) existing.skills.push(skill.name);
        } else {
          pluginMap.set(key, {
            marketplace: skill.marketplace,
            skills: [skill.name],
            enabled: toggleState.skills[skill.name] !== false,
          });
        }
      } else {
        standaloneSkills.push({
          name: skill.name,
          status: "pending",
          enabled: toggleState.skills[skill.name] !== false,
          connectedTools: [scan.toolId],
        });
      }
    }
  }

  const plugins = Array.from(pluginMap.entries()).map(([key, val]) => {
    const pluginName = key.split("/")[1] || key;
    return {
      name: pluginName,
      marketplace: val.marketplace,
      skillCount: val.skills.length,
      enabled: val.skills.some(s => toggleState.skills[s] !== false),
      skills: val.skills,
    };
  });

  // MCPs — deduplicated by name
  const mcpSeen = new Set<string>();
  const mcps: Array<{ name: string; status: Status; enabled: boolean; connectedTools: string[] }> = [];
  for (const scan of scans) {
    for (const mcp of scan.mcps) {
      if (!mcpSeen.has(mcp.name)) {
        mcpSeen.add(mcp.name);
        mcps.push({
          name: mcp.name,
          status: "pending",
          enabled: toggleState.mcps[mcp.name] !== false,
          connectedTools: [scan.toolId],
        });
      }
    }
  }

  // Memory
  const memSeen = new Set<string>();
  const memory: Array<{ name: string; scope: "shared"; status: Status }> = [];
  for (const scan of scans) {
    for (const mem of scan.memory) {
      if (!memSeen.has(mem.name)) {
        memSeen.add(mem.name);
        memory.push({ name: mem.name, scope: "shared", status: "pending" });
      }
    }
  }

  return { tools, skills: standaloneSkills, mcps, memory, plugins };
}

interface MigrateWizardProps {
  onClose?: () => void;
}

export function MigrateWizard({ onClose }: MigrateWizardProps) {
  const [step, setStep] = useState<WizardStep>("scan");
  const [scanning, setScanning] = useState(false);
  const [scans, setScans] = useState<ScanData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [appliedCount, setAppliedCount] = useState(0);
  const [toggleState, setToggleState] = useState<ToggleState>({ skills: {}, mcps: {}, memory: {}, tools: {} });

  // Sidebar state
  const [selectedPlugin, setSelectedPlugin] = useState<{
    name: string; marketplace: string; version: string; description: string;
    enabled: boolean; skills: string[]; agents: string[]; commands: string[];
  } | null>(null);

  async function handleScan() {
    setScanning(true);
    setError(null);
    try {
      const data = await scanTools();
      setScans(data as unknown as ScanData[]);

      // Initialize all toggles to true
      const skills: Record<string, boolean> = {};
      const mcps: Record<string, boolean> = {};
      const memory: Record<string, boolean> = {};
      const tools: Record<string, boolean> = {};
      for (const scan of data as unknown as ScanData[]) {
        if (scan.installed) tools[scan.toolId] = true;
        for (const s of scan.skills) skills[s.name] = true;
        for (const m of scan.mcps) mcps[m.name] = true;
        for (const mem of scan.memory) memory[mem.name] = true;
      }
      setToggleState({ skills, mcps, memory, tools });
      setStep("review");
    } catch (e: any) {
      setError(e.message ?? "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  async function handleApply() {
    setError(null);
    setStep("apply");
    try {
      const graphData = buildGraphData(scans, toggleState);
      // Build migration plan from enabled items
      const enabledSkills = Object.entries(toggleState.skills).filter(([, v]) => v).map(([name]) => name);
      const enabledMcps = Object.entries(toggleState.mcps).filter(([, v]) => v).map(([name]) => name);
      const enabledMemory = Object.entries(toggleState.memory).filter(([, v]) => v).map(([name]) => name);

      const plan = {
        skills: graphData.plugins.flatMap(p => p.skills.filter(s => enabledSkills.includes(s)).map(s => ({ name: s, source: "scan" }))),
        mcps: graphData.mcps.filter(m => enabledMcps.includes(m.name)).map(m => ({ name: m.name, source: "scan", config: { command: "", args: [] } })),
        memory: graphData.memory.filter(m => enabledMemory.includes(m.name)).map(m => ({ name: m.name, source: "scan", content: "" })),
        conflicts: [],
      };

      const result = await applyMigration(plan as any);
      setAppliedCount((result as any).skillsImported + (result as any).mcpsImported + (result as any).memoryImported);
      setStep("done");
    } catch (e: any) {
      setError(e.message ?? "Migration failed");
      setStep("review");
    }
  }

  const handleToggle = useCallback((toggle: { type: string; name: string; enabled: boolean }) => {
    setToggleState(prev => {
      const key = toggle.type === "skill" ? "skills" : toggle.type === "mcp" ? "mcps" : toggle.type === "memory" ? "memory" : null;
      if (!key) return prev;
      return { ...prev, [key]: { ...prev[key], [toggle.name]: toggle.enabled } };
    });
  }, []);

  const handlePluginClick = useCallback((pluginName: string) => {
    const graphData = buildGraphData(scans, toggleState);
    const plugin = graphData.plugins.find(p => p.name === pluginName);
    if (plugin) {
      setSelectedPlugin({
        name: plugin.name,
        marketplace: plugin.marketplace,
        version: "scanned",
        description: `${plugin.skillCount} skills from ${plugin.marketplace}`,
        enabled: plugin.enabled,
        skills: plugin.skills,
        agents: [],
        commands: [],
      });
    }
  }, [scans, toggleState]);

  const handleTogglePlugin = useCallback((name: string, enabled: boolean) => {
    // Toggle all skills in this plugin
    const graphData = buildGraphData(scans, toggleState);
    const plugin = graphData.plugins.find(p => p.name === name);
    if (plugin) {
      setToggleState(prev => {
        const skills = { ...prev.skills };
        for (const s of plugin.skills) skills[s] = enabled;
        return { ...prev, skills };
      });
    }
    setSelectedPlugin(prev => prev ? { ...prev, enabled } : null);
  }, [scans, toggleState]);

  const handleToggleSkill = useCallback((_pluginName: string, skillName: string, enabled: boolean) => {
    setToggleState(prev => ({
      ...prev,
      skills: { ...prev.skills, [skillName]: enabled },
    }));
  }, []);

  const handleAddTool = useCallback(() => {
    // TODO: Show tool picker dialog
    console.log("Add tool destination");
  }, []);

  const graphData = scans.length > 0 ? buildGraphData(scans, toggleState) : undefined;

  const selectedCount = Object.values(toggleState.skills).filter(Boolean).length
    + Object.values(toggleState.mcps).filter(Boolean).length
    + Object.values(toggleState.memory).filter(Boolean).length;

  const stepLabels: Record<WizardStep, string> = { scan: "Scan", review: "Review", apply: "Apply", done: "Done" };
  const steps: WizardStep[] = ["scan", "review", "apply", "done"];

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center justify-center gap-2">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium",
                s === step ? "bg-primary text-primary-foreground" : steps.indexOf(step) > i ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
              )}
            >
              {i + 1}
            </div>
            <span className="text-sm">{stepLabels[s]}</span>
            {i < steps.length - 1 && <div className="h-px w-8 bg-border" />}
          </div>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-500">{error}</div>
      )}

      {/* Step 1: Scan */}
      {step === "scan" && (
        <div className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
          <h2 className="text-lg font-semibold">Scan for Tools</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Detect installed AI tools and their configurations to migrate into Mycelium.
          </p>
          <button
            onClick={handleScan}
            disabled={scanning}
            className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {scanning ? "Scanning..." : "Start Scan"}
          </button>
        </div>
      )}

      {/* Step 2: Review — Visual Graph */}
      {step === "review" && graphData && (
        <div className="space-y-4">
          {/* Summary bar */}
          <div className="flex items-center justify-between rounded-lg border bg-card p-4 text-card-foreground shadow-sm">
            <div className="flex gap-6 text-sm">
              <span><strong>{graphData.plugins.length}</strong> plugins</span>
              <span><strong>{Object.values(toggleState.skills).filter(Boolean).length}</strong> skills</span>
              <span><strong>{Object.values(toggleState.mcps).filter(Boolean).length}</strong> MCPs</span>
              <span><strong>{Object.values(toggleState.memory).filter(Boolean).length}</strong> memory</span>
              <span className="text-muted-foreground">→ <strong>{graphData.tools.length}</strong> destinations</span>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setStep("scan")} className="rounded-md border px-4 py-2 text-sm hover:bg-muted">
                Rescan
              </button>
              <button
                onClick={handleApply}
                disabled={selectedCount === 0}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                Apply ({selectedCount} items)
              </button>
            </div>
          </div>

          {/* Graph */}
          <div className="h-[500px] rounded-lg border bg-card/50">
            <ReactFlowProvider>
              <Graph
                mode="migrate"
                data={graphData}
                showUninstalledTools={false}
                onToggle={handleToggle}
                onPluginClick={handlePluginClick}
                onAddTool={handleAddTool}
              />
            </ReactFlowProvider>
          </div>

          <p className="text-center text-sm text-muted-foreground">
            Click plugin nodes to select individual skills. Toggle nodes to include/exclude from migration.
          </p>
        </div>
      )}

      {/* Step 3: Apply */}
      {step === "apply" && (
        <div className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
          <h2 className="text-lg font-semibold">Applying Migration</h2>
          <div className="mt-4 flex items-center gap-3">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span className="text-sm text-muted-foreground">Migrating configurations...</span>
          </div>
        </div>
      )}

      {/* Step 4: Done */}
      {step === "done" && (
        <div className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
          <h2 className="text-lg font-semibold">Migration Complete</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Successfully migrated {appliedCount} items into Mycelium.
          </p>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => { setStep("scan"); setScans([]); }}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Scan Again
            </button>
            {onClose && (
              <button onClick={onClose} className="rounded-md border px-4 py-2 text-sm hover:bg-muted">
                Close
              </button>
            )}
          </div>
        </div>
      )}

      {/* Plugin Detail Sidebar */}
      <PluginDetailPanel
        plugin={selectedPlugin}
        onClose={() => setSelectedPlugin(null)}
        onTogglePlugin={handleTogglePlugin}
        onToggleSkill={handleToggleSkill}
      />
    </div>
  );
}
