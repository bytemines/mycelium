/**
 * Dashboard - Main Mycelium Control Center component
 * Implemented following TDD to pass Dashboard.test.tsx
 */

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Graph } from "./Graph";
import { ReactFlowProvider } from "@xyflow/react";

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

function GraphContainer() {
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
          onNodeClick={(node) => console.log("Clicked:", node)}
          onToggle={handleToggle}
        />
      </ReactFlowProvider>
    </div>
  );
}

export function Dashboard() {
  // Mock data - will be replaced with real data from CLI
  const stats = {
    skills: { count: 12, status: "synced" as Status },
    mcps: { count: 8, status: "synced" as Status },
    memory: { count: 3, status: "synced" as Status },
    machines: { count: 2, status: "synced" as Status },
  };

  return (
    <div className="min-h-screen bg-background p-6">
      {/* Header */}
      <header className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold tracking-tight">MYCELIUM</h1>
          <StatusIndicator status="synced" />
          <span className="text-sm text-muted-foreground">All Systems Go</span>
        </div>
        <button
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Sync
        </button>
      </header>

      {/* Graph Section */}
      <section className="mb-8">
        <GraphContainer />
      </section>

      {/* Stats Cards */}
      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard title="Skills" count={stats.skills.count} status={stats.skills.status} />
        <StatsCard title="MCPs" count={stats.mcps.count} status={stats.mcps.status} />
        <StatsCard title="Memory" count={stats.memory.count} status={stats.memory.status} />
        <StatsCard title="Machines" count={stats.machines.count} status={stats.machines.status} />
      </section>

      {/* Footer hint */}
      <footer className="mt-8 text-center text-sm text-muted-foreground">
        Click any node in the graph or card to manage
      </footer>
    </div>
  );
}
