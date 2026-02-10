/**
 * Dashboard - Main Mycelium Control Center component
 * Uses Zustand store for centralized state management
 */

import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { Graph } from "./Graph";
import { ReactFlowProvider } from "@xyflow/react";
import { MigrateWizard } from "./MigrateWizard";
import { MarketplaceBrowser } from "./MarketplaceBrowser";
import { PluginDetailPanel } from "./PluginDetailPanel";
import { useDashboardStore } from "@/stores/dashboard-store";
import { getDebugMockData } from "@/lib/mock-graph-data";

import type { Status } from "@/types";

function StatusIndicator({ status }: { status: Status }) {
  const colors: Record<Status, string> = {
    synced: "bg-status-synced",
    pending: "bg-status-pending",
    error: "bg-status-error",
    disabled: "bg-status-disabled",
    not_installed: "bg-gray-700",
  };

  return (
    <span
      data-testid="status-indicator"
      className={cn("inline-block w-3 h-3 rounded-full", colors[status])}
    />
  );
}


function GraphContainer() {
  const {
    graphData, loading, error, apiStatus,
    fetchState, toggleResource, setActiveTab,
    openPluginPanel, openMcpPanel, openSkillPanel,
  } = useDashboardStore();

  useEffect(() => {
    fetchState();
  }, [apiStatus, fetchState]);

  if (loading) {
    return (
      <div data-testid="graph-container" className="h-full rounded-lg border bg-card/50 flex items-center justify-center">
        <div aria-live="polite" className="text-center text-muted-foreground">
          <div className="mb-2 text-lg">Loading...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div data-testid="graph-container" className="h-full rounded-lg border bg-card/50 flex items-center justify-center">
        <div aria-live="polite" className="text-center text-muted-foreground">
          <div className="mb-2 text-lg">Cannot connect to API</div>
          <div className="text-sm">Start the server with <code className="bg-muted px-1 rounded">mycelium serve</code></div>
        </div>
      </div>
    );
  }

  if (graphData && !graphData.migrated && graphData.skills.length === 0 && graphData.mcps.length === 0) {
    return (
      <div data-testid="graph-container" className="h-full rounded-lg border bg-card/50 flex items-center justify-center">
        <div className="text-center">
          <div className="mb-2 text-lg text-foreground">No configuration detected</div>
          <div className="mb-4 text-sm text-muted-foreground">
            Run <code className="bg-muted px-1 rounded">mycelium migrate --apply</code> to import your tool configs, then <code className="bg-muted px-1 rounded">mycelium serve</code> to view them here.
          </div>
          <button
            onClick={() => setActiveTab("migrate")}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Scan Tools
          </button>
        </div>
      </div>
    );
  }

  const debugData = getDebugMockData();
  const data = debugData ?? graphData ?? { tools: [], skills: [], mcps: [], memory: [], plugins: [] };

  return (
    <div data-testid="graph-container" className="h-full rounded-lg border bg-card/50">
      <ReactFlowProvider>
        <Graph
          data={data}
          showUninstalledTools={false}
          onToggle={toggleResource}
          onPluginClick={openPluginPanel}
          onMcpClick={openMcpPanel}
          onSkillClick={openSkillPanel}
        />
      </ReactFlowProvider>
    </div>
  );
}

export function Dashboard() {
  const {
    activeTab, setActiveTab,
    selectedPlugin, setSelectedPlugin,
    apiStatus, checkApiStatus,
    hasPendingChanges, syncBanner, triggerSync,
    togglePlugin, togglePluginItem, removeItem,
  } = useDashboardStore();

useEffect(() => {
    checkApiStatus();
  }, [checkApiStatus]);

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Navbar with tabs */}
      <header className="relative flex items-center border-b px-4 py-2">
        {/* Left: branding */}
        <div className="flex items-center gap-2">
          <h1 className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <span>🍄</span>
            <span>MYCELIUM</span>
            <span className="ml-1 rounded-full bg-purple-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-purple-400 border border-purple-500/30">Beta</span>
          </h1>
          <StatusIndicator status={apiStatus === "connected" ? "synced" : apiStatus === "checking" ? "pending" : "error"} />
        </div>

        {/* Center: tabs */}
        <nav role="tablist" className="absolute left-1/2 -translate-x-1/2 flex gap-1 rounded-lg bg-muted p-0.5">
          {(["graph", "migrate", "marketplace"] as const).map((tab) => (
            <button
              key={tab}
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "rounded-md px-3 py-1 text-sm font-medium transition-colors",
                activeTab === tab
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </nav>

        {/* Right: actions */}
        <div className="ml-auto flex items-center gap-3">
          {apiStatus !== "connected" && (
            <span className="text-xs text-muted-foreground">
              {apiStatus === "checking" ? "Connecting..." : "API Offline"}
            </span>
          )}
          <button
            onClick={triggerSync}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              hasPendingChanges
                ? "bg-yellow-500 text-black hover:bg-yellow-400 animate-pulse"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            )}
          >
            {hasPendingChanges ? "Sync (pending)" : "Sync"}
          </button>
        </div>
      </header>

      {/* Sync Banner */}
      {syncBanner && (
        <div aria-live="polite" className={cn(
          "px-4 py-1.5 text-sm font-medium",
          syncBanner.type === "success" && "bg-green-500/10 text-green-400",
          syncBanner.type === "pending" && "bg-yellow-500/10 text-yellow-400",
          syncBanner.type === "error" && "bg-red-500/10 text-red-400",
        )}>
          {syncBanner.message}
        </div>
      )}

      {/* Full-height content */}
      <div className="flex-1 overflow-hidden p-2">
        {activeTab === "graph" && (
          <section className="h-full">
            <GraphContainer />
          </section>
        )}

        {activeTab === "migrate" && (
          <div className="h-full overflow-y-auto p-4">
            <MigrateWizard />
          </div>
        )}

        {activeTab === "marketplace" && (
          <div className="h-full overflow-y-auto p-4">
            <MarketplaceBrowser />
          </div>
        )}
      </div>

      <PluginDetailPanel
        plugin={selectedPlugin}
        onClose={() => setSelectedPlugin(null)}
        onTogglePlugin={togglePlugin}
        onToggleItem={togglePluginItem}
        onRemoveItem={removeItem}
      />
    </div>
  );
}
