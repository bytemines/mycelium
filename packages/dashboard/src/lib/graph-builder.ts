import type { Status } from "@/types";
import { TOOL_REGISTRY } from "@mycelish/core";

export interface ScanData {
  toolId: string;
  toolName: string;
  installed: boolean;
  skills: Array<{ name: string; path: string; source: string; metadata?: Record<string, string>; marketplace?: string; pluginName?: string }>;
  mcps: Array<{ name: string; source: string; config: { command: string; args?: string[]; env?: Record<string, string> } }>;
  components: Array<{ type: string; name: string; path: string; marketplace?: string; pluginName?: string }>;
}

export interface MigrateToggleState {
  skills: Record<string, boolean>;
  mcps: Record<string, boolean>;
  tools: Record<string, boolean>;
}

export function buildGraphData(scans: ScanData[], toggleState: MigrateToggleState) {
  // Tools as destinations — installed ones are pre-selected
  const toolSet = new Map<string, { id: string; name: string; installed: boolean }>();
  for (const scan of scans) {
    if (scan.installed) {
      toolSet.set(scan.toolId, { id: scan.toolId, name: scan.toolName, installed: true });
    }
  }

  // Resolve connected tools by capability (matching state.ts computeConnectedTools)
  const installedToolIds = Array.from(toolSet.keys());
  const skillCapableTools = installedToolIds.filter(id => {
    const desc = TOOL_REGISTRY[id];
    return desc?.capabilities.includes("skills");
  });
  const mcpCapableTools = installedToolIds.filter(id => {
    const desc = TOOL_REGISTRY[id];
    return desc?.capabilities.includes("mcp");
  });

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
          connectedTools: skillCapableTools,
        });
      }
    }
  }

  const plugins = Array.from(pluginMap.entries()).map(([key, val]) => {
    const pluginName = key.split("/")[1] || key;
    return {
      name: pluginName,
      marketplace: val.marketplace,
      componentCount: val.skills.length,
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
          connectedTools: mcpCapableTools,
        });
      }
    }
  }

  return { tools, skills: standaloneSkills, mcps, plugins };
}

// ── Dashboard graph builder (extracted from Graph.tsx useMemo) ──

import type { Node, Edge } from "@xyflow/react";
import { EDGE_COLORS, EDGE_STYLE, INITIAL_LAYOUT } from "./graph-config";

interface SkillData {
  name: string;
  status: Status;
  enabled?: boolean;
  connectedTools?: string[];
}

interface McpData {
  name: string;
  status: Status;
  enabled?: boolean;
  connectedTools?: string[];
}

interface ToolDataDash {
  id: string;
  name: string;
  status: Status;
  installed: boolean;
}

interface PluginDataDash {
  name: string;
  marketplace: string;
  componentCount: number;
  enabled: boolean;
  skills: string[];
  agents?: string[];
  commands?: string[];
  hooks?: string[];
  libs?: string[];
  disabledItems?: string[];
}

export interface DashboardGraphData {
  tools?: ToolDataDash[];
  skills: SkillData[];
  mcps: McpData[];
  plugins?: PluginDataDash[];
}

export const ALL_TOOLS: ToolDataDash[] = Object.values(TOOL_REGISTRY).map(desc => ({
  id: desc.id,
  name: desc.display.name,
  status: "synced" as Status,
  installed: true,
}));

export interface DashboardGraphHandlers {
  handleToggle: (type: "skill" | "mcp", name: string, enabled: boolean) => void;
  onToggle?: (toggle: { type: "skill" | "mcp"; name: string; enabled: boolean }) => void;
  onPluginToggle?: (name: string, enabled: boolean) => void;
  onPluginClick?: (pluginName: string) => void;
  onAddTool?: () => void;
}

function edgeStyle(color: string, enabled: boolean) {
  return {
    stroke: color,
    strokeWidth: EDGE_STYLE.strokeWidth,
    ...(enabled ? {} : { strokeDasharray: EDGE_STYLE.disabledDashArray, opacity: EDGE_STYLE.disabledOpacity }),
  };
}

export function buildDashboardGraph(
  data: DashboardGraphData | undefined,
  mode: "dashboard" | "migrate",
  showUninstalledTools: boolean,
  handlers: DashboardGraphHandlers,
): { initialNodes: Node[]; initialEdges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const tools = data?.tools || ALL_TOOLS;
  const visibleTools = showUninstalledTools
    ? tools
    : tools.filter((t) => t.installed !== false);

  // Tool nodes — middle layer
  visibleTools.forEach((tool, index) => {
    nodes.push({
      id: `tool-${tool.id}`,
      type: "tool",
      position: { x: index * INITIAL_LAYOUT.horizontalSpacing, y: INITIAL_LAYOUT.layers.middle },
      data: { name: tool.name, status: tool.status, installed: tool.installed, __elkLayer: "NONE" },
    });
  });

  // Build a set of skills owned by plugins
  const pluginSkillSet = new Set<string>();
  data?.plugins?.forEach((plugin) => {
    plugin.skills.forEach((s) => pluginSkillSet.add(s));
  });

  // Plugin nodes — top layer (FIRST)
  data?.plugins?.forEach((plugin, index) => {
    const nodeId = `plugin-${plugin.name}`;
    const disabledCount = plugin.disabledItems?.length ?? 0;
    const hasAnyEnabled = disabledCount < plugin.componentCount;
    nodes.push({
      id: nodeId,
      type: "plugin",
      position: { x: index * INITIAL_LAYOUT.horizontalSpacing, y: INITIAL_LAYOUT.layers.top },
      data: {
        __elkLayer: "FIRST",
        name: plugin.name,
        marketplace: plugin.marketplace,
        componentCount: plugin.componentCount,
        skillCount: plugin.skills?.length ?? 0,
        agentCount: plugin.agents?.length ?? 0,
        commandCount: plugin.commands?.length ?? 0,
        hookCount: plugin.hooks?.length ?? 0,
        libCount: plugin.libs?.length ?? 0,
        enabled: disabledCount === 0,
        partial: disabledCount > 0 && disabledCount < plugin.componentCount,
        disabledCount,
        onToggle: (name: string, enabled: boolean) => handlers.onPluginToggle?.(name, enabled),
        onClick: (name: string) => handlers.onPluginClick?.(name),
      },
    });

    // Connect plugin to tools that support at least one of its component types
    const pluginCaps = new Set<string>();
    if (plugin.skills?.length) pluginCaps.add("skills");
    if (plugin.agents?.length) pluginCaps.add("agents");
    if (plugin.commands?.length) pluginCaps.add("commands");
    if (plugin.hooks?.length) pluginCaps.add("hooks");
    visibleTools.filter(t => {
      if (!t.installed) return false;
      const desc = TOOL_REGISTRY[t.id];
      if (!desc) return false;
      return desc.capabilities.some(c => pluginCaps.has(c));
    }).forEach((tool) => {
      edges.push({
        id: `${nodeId}-to-tool-${tool.id}`,
        source: nodeId,
        target: `tool-${tool.id}`,
        animated: hasAnyEnabled,
        style: edgeStyle(EDGE_COLORS.plugin, hasAnyEnabled),
      });
    });
  });

  // Skill nodes — top layer (FIRST), edges flow down into tools
  data?.skills.forEach((skill, index) => {
    if (pluginSkillSet.has(skill.name)) return;
    const nodeId = `skill-${skill.name}`;
    nodes.push({
      id: nodeId,
      type: "resource",
      position: { x: index * INITIAL_LAYOUT.horizontalSpacing, y: INITIAL_LAYOUT.layers.top },
      data: { name: skill.name, type: "skill", status: skill.status, enabled: skill.enabled, onToggle: handlers.handleToggle, __elkLayer: "FIRST" },
    });
    const isEnabled = skill.enabled !== false;
    const targetTools = skill.connectedTools || visibleTools.filter(t => t.installed).map((t) => t.id);
    targetTools.forEach((toolId) => {
      if (visibleTools.some(t => t.id === toolId)) {
        edges.push({
          id: `${nodeId}-to-${toolId}`,
          source: nodeId,
          target: `tool-${toolId}`,
          animated: isEnabled && skill.status === "synced",
          style: edgeStyle(EDGE_COLORS.skill, isEnabled),
        });
      }
    });
  });

  // MCP nodes — bottom layer (LAST), edges from tool down to MCP
  data?.mcps.forEach((mcp, index) => {
    const nodeId = `mcp-${mcp.name}`;
    nodes.push({
      id: nodeId,
      type: "resource",
      position: { x: index * INITIAL_LAYOUT.horizontalSpacing, y: INITIAL_LAYOUT.layers.bottom },
      data: { name: mcp.name, type: "mcp", status: mcp.status, enabled: mcp.enabled, onToggle: handlers.handleToggle },
    });
    const isMcpEnabled = mcp.enabled !== false;
    const targetTools = mcp.connectedTools || visibleTools.filter(t => t.installed).map((t) => t.id);
    targetTools.forEach((toolId) => {
      if (visibleTools.some(t => t.id === toolId)) {
        edges.push({
          id: `tool-${toolId}-to-${nodeId}`,
          source: `tool-${toolId}`,
          target: nodeId,
          animated: isMcpEnabled && mcp.status === "synced",
          style: edgeStyle(EDGE_COLORS.mcp, isMcpEnabled),
        });
      }
    });
  });

  // "+ Add Tool" node in migrate mode
  if (mode === "migrate") {
    nodes.push({
      id: "add-tool",
      type: "addTool",
      position: { x: visibleTools.length * INITIAL_LAYOUT.addToolSpacing, y: INITIAL_LAYOUT.layers.top },
      data: { onClick: handlers.onAddTool },
    });
  }

  return { initialNodes: nodes, initialEdges: edges };
}
