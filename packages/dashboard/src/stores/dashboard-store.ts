import { create } from "zustand";
import { fetchDashboardState, sendToggle, fetchPlugins, togglePlugin as apiTogglePlugin, togglePluginSkill as apiTogglePluginSkill, removeSkill, removeMcp, removePlugin } from "@/lib/api";
import type { PluginInfo } from "@mycelium/core";
import type { Status } from "@/types";
type ApiStatus = "checking" | "connected" | "disconnected";

interface GraphData {
  tools: Array<{ id: string; name: string; status: Status; installed: boolean }>;
  skills: Array<{ name: string; status: Status; enabled: boolean; connectedTools: string[] }>;
  mcps: Array<{ name: string; status: Status; enabled: boolean; connectedTools: string[] }>;
  memory: Array<{ name: string; scope: "shared" | "coding" | "personal"; status: Status }>;
  plugins: Array<{ name: string; marketplace: string; componentCount: number; enabled: boolean; skills: string[]; agents?: string[]; commands?: string[]; hooks?: string[]; libs?: string[] }>;
  migrated: boolean;
}

interface DashboardStore {
  graphData: GraphData | null;
  loading: boolean;
  error: boolean;
  activeTab: "graph" | "migrate" | "marketplace";
  selectedPlugin: PluginInfo | null;
  apiStatus: ApiStatus;
  hasPendingChanges: boolean;
  syncBanner: { type: "success" | "pending" | "error"; message: string } | null;

  checkApiStatus: () => Promise<void>;
  fetchState: () => Promise<void>;
  toggleResource: (toggle: { type: string; name: string; enabled: boolean }) => Promise<void>;
  togglePlugin: (name: string, enabled: boolean) => Promise<void>;
  togglePluginSkill: (pluginName: string, skillName: string, enabled: boolean) => Promise<void>;
  removeItem: (type: "skill" | "mcp" | "plugin", name: string) => Promise<void>;
  triggerSync: () => Promise<void>;
  setActiveTab: (tab: "graph" | "migrate" | "marketplace") => void;
  setSelectedPlugin: (plugin: PluginInfo | null) => void;
  openPluginPanel: (pluginName: string) => void;
  openMcpPanel: (mcpName: string) => void;
  openSkillPanel: (skillName: string) => void;
}

function parseState(state: any): GraphData {
  const skills = (state.skills ?? []).map((s: any) => ({ ...s, enabled: s.enabled ?? true }));
  const mcps = (state.mcps ?? []).map((m: any) => ({ ...m, enabled: m.enabled ?? true }));
  const memory = (state.memory ?? []).map((m: any) => ({ ...m, scope: m.scope ?? "shared" }));
  const plugins = (state.plugins ?? []).map((p: any) => {
    const sk = p.skills ?? [];
    const ag = p.agents ?? [];
    const cm = p.commands ?? [];
    const hk = p.hooks ?? [];
    const lb = p.libs ?? [];
    return {
      name: p.name,
      marketplace: p.marketplace ?? "",
      componentCount: sk.length + ag.length + cm.length + hk.length + lb.length,
      enabled: p.enabled ?? true,
      skills: sk, agents: ag, commands: cm, hooks: hk, libs: lb,
    };
  });
  return {
    tools: state.tools ?? [],
    skills,
    mcps,
    memory,
    plugins,
    migrated: state.migrated ?? false,
  };
}

export const useDashboardStore = create<DashboardStore>((set, get) => ({
  graphData: null,
  loading: true,
  error: false,
  activeTab: "graph",
  selectedPlugin: null,
  apiStatus: "checking",
  hasPendingChanges: false,
  syncBanner: null,

  checkApiStatus: async () => {
    try {
      await fetchDashboardState();
      set({ apiStatus: "connected" });
    } catch {
      set({ apiStatus: "disconnected" });
    }
  },

  fetchState: async () => {
    const { apiStatus } = get();
    if (apiStatus !== "connected") {
      set({ loading: false, error: apiStatus === "disconnected" });
      return;
    }
    set({ loading: true });
    try {
      const state = await fetchDashboardState();
      set({ graphData: parseState(state), error: false });
    } catch {
      set({ error: true });
    } finally {
      set({ loading: false });
    }
  },

  toggleResource: async (toggle) => {
    // Optimistic update
    set((s) => {
      if (!s.graphData) return s;
      if (toggle.type === "skill") {
        return { graphData: { ...s.graphData, skills: s.graphData.skills.map(sk => sk.name === toggle.name ? { ...sk, enabled: toggle.enabled } : sk) } };
      }
      if (toggle.type === "mcp") {
        return { graphData: { ...s.graphData, mcps: s.graphData.mcps.map(m => m.name === toggle.name ? { ...m, enabled: toggle.enabled, status: toggle.enabled ? "synced" as Status : "disabled" as Status } : m) } };
      }
      return s;
    });
    try {
      await sendToggle({ type: toggle.type as "skill" | "mcp" | "memory", name: toggle.name, toolId: "claude-code", enabled: toggle.enabled });
      const fresh = await fetchDashboardState();
      set({ graphData: parseState(fresh) });
    } catch {
      const fresh = await fetchDashboardState();
      set({ graphData: parseState(fresh) });
    }
  },

  togglePlugin: async (name, enabled) => {
    await apiTogglePlugin(name, enabled).catch((err) => { console.error("togglePlugin failed:", err); });
    set((s) => ({
      selectedPlugin: s.selectedPlugin ? { ...s.selectedPlugin, enabled } : null,
      hasPendingChanges: true,
    }));
  },

  togglePluginSkill: async (pluginName, skillName, enabled) => {
    await apiTogglePluginSkill(pluginName, skillName, enabled).catch((err) => { console.error("togglePluginSkill failed:", err); });
    set({ hasPendingChanges: true });
  },

  removeItem: async (type, name) => {
    try {
      if (type === "skill") await removeSkill(name);
      else if (type === "mcp") await removeMcp(name);
      else if (type === "plugin") await removePlugin(name);
      set({ hasPendingChanges: true, syncBanner: { type: "pending", message: `Removed ${type}: ${name}. Click Sync to propagate.` } });
      setTimeout(() => { const { syncBanner } = get(); if (syncBanner?.message.includes(name)) set({ syncBanner: null }); }, 5000);
      get().fetchState();
    } catch (err) {
      console.error("removeItem failed:", err);
    }
  },

  triggerSync: async () => {
    set({ syncBanner: { type: "pending", message: "Syncing to all tools..." } });
    try {
      await fetch("/api/sync", { method: "POST" });
      set({ syncBanner: { type: "success", message: "Synced to all tools" }, hasPendingChanges: false });
      setTimeout(() => set({ syncBanner: null }), 3000);
    } catch {
      set({ syncBanner: { type: "error", message: "Sync failed — run `mycelium sync` manually" } });
      setTimeout(() => set({ syncBanner: null }), 5000);
    }
  },

  setActiveTab: (tab) => set({ activeTab: tab }),
  setSelectedPlugin: (plugin) => set({ selectedPlugin: plugin }),

  openPluginPanel: (pluginName) => {
    set({
      selectedPlugin: {
        name: pluginName, marketplace: "", version: "",
        description: `Plugin: ${pluginName}`, author: undefined, enabled: true,
        skills: [], agents: [], commands: [], hooks: [], libs: [], installPath: "",
      },
    });
    fetchPlugins().then((plugins) => {
      const found = plugins.find((p) => p.name === pluginName);
      if (found) set({ selectedPlugin: found });
    }).catch((err) => { console.error("openPluginPanel fetch failed:", err); });
  },

  openMcpPanel: (mcpName) => {
    set({
      selectedPlugin: {
        name: mcpName, marketplace: "system", version: "",
        description: `MCP server: ${mcpName}`, author: undefined, enabled: true,
        skills: [], agents: [], commands: [], hooks: [], libs: [], installPath: "",
      },
    });
  },

  openSkillPanel: (skillName) => {
    fetchDashboardState().then((state) => {
      const ownerPlugin = ((state as any).plugins ?? []).find((p: any) => (p.skills ?? []).includes(skillName));
      if (ownerPlugin) {
        get().openPluginPanel(ownerPlugin.name);
      } else {
        set({
          selectedPlugin: {
            name: skillName, marketplace: "standalone", version: "",
            description: `Standalone skill: ${skillName}`, author: undefined, enabled: true,
            skills: [skillName], agents: [], commands: [], hooks: [], libs: [], installPath: "",
          },
        });
      }
    }).catch((err) => {
      console.error("openSkillPanel fetch failed:", err);
      set({
        selectedPlugin: {
          name: skillName, marketplace: "standalone", version: "",
          description: `Standalone skill: ${skillName}`, author: undefined, enabled: true,
          skills: [skillName], agents: [], commands: [], hooks: [], libs: [], installPath: "",
        },
      });
    });
  },
}));
