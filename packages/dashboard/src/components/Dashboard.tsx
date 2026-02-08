/**
 * Dashboard - Main Mycelium Control Center component
 * Implemented following TDD to pass Dashboard.test.tsx
 */

import { useState, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Graph } from "./Graph";
import { ReactFlowProvider } from "@xyflow/react";
import { MigrateWizard } from "./MigrateWizard";
import { MarketplaceBrowser } from "./MarketplaceBrowser";
import { PluginDetailPanel } from "./PluginDetailPanel";
import type { PluginInfo } from "@mycelium/core";
import { togglePlugin, togglePluginSkill, fetchDashboardState } from "@/lib/api";

type Status = "synced" | "pending" | "error" | "disabled";

interface StatsCardProps {
  title: string;
  count: number;
  status: Status;
}

function StatusIndicator({ status }: { status: Status }) {
  const colors: Record<Status, string> = {
    synced: "bg-status-synced",
    pending: "bg-status-pending",
    error: "bg-status-error",
    disabled: "bg-status-disabled",
  };

  return (
    <span
      data-testid="status-indicator"
      className={cn("inline-block w-3 h-3 rounded-full", colors[status])}
    />
  );
}

function StatsCard({ title, count, status }: StatsCardProps) {
  return (
    <div className="rounded-lg border bg-card p-4 text-card-foreground shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{title}</span>
        <StatusIndicator status={status} />
      </div>
      <div className="mt-2 text-2xl font-bold">{count}</div>
      <div className="text-xs text-muted-foreground">{status}</div>
    </div>
  );
}

interface ToggleState {
  skills: Record<string, boolean>;
  mcps: Record<string, boolean>;
}

function GraphContainer({ onPluginClick, onMcpClick, onSkillClick }: { onPluginClick?: (name: string) => void; onMcpClick?: (name: string) => void; onSkillClick?: (name: string) => void }) {
  const [toggleState, setToggleState] = useState<ToggleState>({
    skills: { tdd: true, debugging: true, "git-workflow": true },
    mcps: { "git-mcp": true, "filesystem-mcp": true, context7: true },
  });

  const handleToggle = useCallback(
    (toggle: { type: string; name: string; enabled: boolean }) => {
      setToggleState((prev) => {
        const key = toggle.type === "skill" ? "skills" : toggle.type === "mcp" ? "mcps" : null;
        if (!key) return prev;
        return { ...prev, [key]: { ...prev[key], [toggle.name]: toggle.enabled } };
      });
    },
    []
  );

  // Mock data simulating tool detection - Claude Code and Codex installed
  // TODO: Replace with actual data from CLI's detectInstalledTools()
  const mockData = {
    tools: [
      { id: "claude-code", name: "Claude Code", status: "synced" as Status, installed: true },
      { id: "codex", name: "Codex CLI", status: "synced" as Status, installed: true },
      { id: "gemini", name: "Gemini CLI", status: "disabled" as Status, installed: false },
      { id: "opencode", name: "OpenCode", status: "disabled" as Status, installed: false },
      { id: "openclaw", name: "OpenClaw", status: "disabled" as Status, installed: false },
      { id: "aider", name: "Aider", status: "disabled" as Status, installed: false },
    ],
    skills: [
      { name: "tdd", status: "synced" as Status, enabled: toggleState.skills.tdd, connectedTools: ["claude-code", "codex"] },
      { name: "debugging", status: "synced" as Status, enabled: toggleState.skills.debugging, connectedTools: ["claude-code", "codex"] },
      { name: "git-workflow", status: "pending" as Status, enabled: toggleState.skills["git-workflow"], connectedTools: ["claude-code"] },
    ],
    mcps: [
      { name: "git-mcp", status: "synced" as Status, enabled: toggleState.mcps["git-mcp"], connectedTools: ["claude-code", "codex"] },
      { name: "filesystem-mcp", status: "synced" as Status, enabled: toggleState.mcps["filesystem-mcp"], connectedTools: ["claude-code"] },
      { name: "context7", status: "synced" as Status, enabled: toggleState.mcps.context7, connectedTools: ["claude-code"] },
    ],
    memory: [
      { name: "MEMORY.md", scope: "shared" as const, status: "synced" as Status },
      { name: "coding.md", scope: "coding" as const, status: "synced" as Status },
    ],
    plugins: [
      { name: "superpowers", marketplace: "superpowers-marketplace", skillCount: 3, enabled: true, skills: ["tdd", "debugging", "git-workflow"] },
    ],
  };

  return (
    <div
      data-testid="graph-container"
      className="h-[600px] rounded-lg border bg-card/50"
    >
      <ReactFlowProvider>
        <Graph
          data={mockData}
          showUninstalledTools={false}
          onToggle={handleToggle}
          onPluginClick={onPluginClick}
          onMcpClick={onMcpClick}
          onSkillClick={onSkillClick}
        />
      </ReactFlowProvider>
    </div>
  );
}

export function Dashboard() {
  const [activeTab, setActiveTab] = useState<"graph" | "migrate" | "marketplace">("graph");
  const [selectedPlugin, setSelectedPlugin] = useState<PluginInfo | null>(null);
  const [apiStatus, setApiStatus] = useState<"checking" | "connected" | "disconnected">("checking");

  useEffect(() => {
    fetchDashboardState()
      .then(() => setApiStatus("connected"))
      .catch(() => setApiStatus("disconnected"));
  }, []);

  const handlePluginClick = useCallback((pluginName: string) => {
    // Mock plugin detail - in production this would fetch from API
    setSelectedPlugin({
      name: pluginName,
      marketplace: "superpowers-marketplace",
      version: "1.0.0",
      description: "A collection of powerful development skills",
      author: "mycelium-community",
      enabled: true,
      skills: ["tdd", "debugging", "git-workflow"],
      agents: [],
      commands: [],
      installPath: "~/.mycelium/plugins/superpowers",
    });
  }, []);

  const handleTogglePlugin = useCallback(async (name: string, enabled: boolean) => {
    await togglePlugin(name, enabled).catch(() => {});
    setSelectedPlugin(prev => prev ? { ...prev, enabled } : null);
  }, []);

  const handleTogglePluginSkill = useCallback(async (pluginName: string, skillName: string, enabled: boolean) => {
    await togglePluginSkill(pluginName, skillName, enabled).catch(() => {});
  }, []);

  const handleMcpClick = useCallback((mcpName: string) => {
    setSelectedPlugin({
      name: mcpName,
      marketplace: "system",
      version: "",
      description: `MCP server: ${mcpName}`,
      author: undefined,
      enabled: true,
      skills: [],
      agents: [],
      commands: [],
      installPath: "",
    });
  }, []);

  const handleSkillClick = useCallback((skillName: string) => {
    setSelectedPlugin({
      name: skillName,
      marketplace: "standalone",
      version: "",
      description: `Standalone skill: ${skillName}`,
      author: undefined,
      enabled: true,
      skills: [skillName],
      agents: [],
      commands: [],
      installPath: "",
    });
  }, []);

  const [stats, setStats] = useState({
    skills: { count: 0, status: "pending" as Status },
    mcps: { count: 0, status: "pending" as Status },
    memory: { count: 0, status: "pending" as Status },
    machines: { count: 0, status: "pending" as Status },
  });

  useEffect(() => {
    if (apiStatus !== "connected") return;
    fetchDashboardState().then((state) => {
      setStats({
        skills: { count: state.skills?.length ?? 0, status: state.skills?.length ? "synced" : "pending" },
        mcps: { count: state.mcps?.length ?? 0, status: state.mcps?.length ? "synced" : "pending" },
        memory: { count: state.memory?.length ?? 0, status: state.memory?.length ? "synced" : "pending" },
        machines: { count: 1, status: "synced" },
      });
    }).catch(() => {
      setStats({
        skills: { count: 0, status: "error" },
        mcps: { count: 0, status: "error" },
        memory: { count: 0, status: "error" },
        machines: { count: 0, status: "error" },
      });
    });
  }, [apiStatus]);

  return (
    <div className="min-h-screen bg-background p-6">
      {/* Header */}
      <header className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold tracking-tight">MYCELIUM</h1>
          <StatusIndicator status={apiStatus === "connected" ? "synced" : apiStatus === "checking" ? "pending" : "error"} />
          <span className="text-sm text-muted-foreground">
            {apiStatus === "connected" ? "Connected" : apiStatus === "checking" ? "Connecting..." : "API Offline \u2014 run mycelium serve"}
          </span>
        </div>
        <button
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Sync
        </button>
      </header>

      {/* Tab Bar */}
      <nav className="mb-6 flex gap-1 rounded-lg border bg-muted p-1">
        {(["graph", "migrate", "marketplace"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "rounded-md px-4 py-2 text-sm font-medium transition-colors",
              activeTab === tab
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </nav>

      {/* Tab Content */}
      {activeTab === "graph" && (
        <>
          <section className="mb-8">
            <GraphContainer onPluginClick={handlePluginClick} onMcpClick={handleMcpClick} onSkillClick={handleSkillClick} />
          </section>
          <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatsCard title="Skills" count={stats.skills.count} status={stats.skills.status} />
            <StatsCard title="MCPs" count={stats.mcps.count} status={stats.mcps.status} />
            <StatsCard title="Memory" count={stats.memory.count} status={stats.memory.status} />
            <StatsCard title="Machines" count={stats.machines.count} status={stats.machines.status} />
          </section>
        </>
      )}

      {activeTab === "migrate" && <MigrateWizard />}

      {activeTab === "marketplace" && <MarketplaceBrowser />}

      <PluginDetailPanel
        plugin={selectedPlugin}
        onClose={() => setSelectedPlugin(null)}
        onTogglePlugin={handleTogglePlugin}
        onToggleSkill={handleTogglePluginSkill}
      />

      {/* Footer hint */}
      <footer className="mt-8 text-center text-sm text-muted-foreground">
        {activeTab === "graph" && "Click any node to view details and manage toggles"}
        {activeTab === "migrate" && "Scan tools to discover skills, MCPs, and memory"}
        {activeTab === "marketplace" && "Search and install skills from marketplace registries"}
      </footer>
    </div>
  );
}
