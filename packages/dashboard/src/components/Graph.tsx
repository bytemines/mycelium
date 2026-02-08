/**
 * Graph - Interactive React Flow visualization with ELK auto-layout
 * Supports drag-and-drop, smart layout for large graphs, and tool detection
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  Panel,
} from "@xyflow/react";
import ELK from "elkjs/lib/elk.bundled.js";
import "@xyflow/react/dist/style.css";
import { cn } from "@/lib/utils";

// Initialize ELK
const elk = new ELK();

type Status = "synced" | "pending" | "error" | "disabled" | "not_installed";

// Data types
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

interface MemoryData {
  name: string;
  scope: "shared" | "coding" | "personal";
  status: Status;
}

interface ToolData {
  id: string;
  name: string;
  status: Status;
  installed: boolean;
}

interface PluginData {
  name: string;
  marketplace: string;
  skillCount: number;
  enabled: boolean;
  skills: string[];
}

interface GraphData {
  tools?: ToolData[];
  skills: SkillData[];
  mcps: McpData[];
  memory: MemoryData[];
  plugins?: PluginData[];
}

// Node data types
interface ToolNodeData {
  name: string;
  status: Status;
  installed: boolean;
}

interface ResourceNodeData {
  name: string;
  type: "skill" | "mcp" | "memory";
  status: Status;
  enabled?: boolean;
  onToggle?: (type: "skill" | "mcp" | "memory", name: string, enabled: boolean) => void;
}

interface PluginNodeData {
  name: string;
  marketplace: string;
  skillCount: number;
  enabled: boolean;
  onToggle?: (name: string, enabled: boolean) => void;
  onClick?: (name: string) => void;
}

// ELK layout options
const elkOptions = {
  "elk.algorithm": "layered",
  "elk.layered.spacing.nodeNodeBetweenLayers": "100",
  "elk.spacing.nodeNode": "50",
  "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
  "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
};

// Apply ELK layout to nodes and edges
async function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
  direction: "DOWN" | "RIGHT" = "DOWN"
): Promise<{ nodes: Node[]; edges: Edge[] }> {
  const isHorizontal = direction === "RIGHT";

  const graph = {
    id: "root",
    layoutOptions: {
      ...elkOptions,
      "elk.direction": direction,
    },
    children: nodes.map((node) => ({
      ...node,
      width: node.type === "tool" ? 140 : 120,
      height: node.type === "tool" ? 60 : 50,
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  };

  try {
    const layoutedGraph = await elk.layout(graph);

    return {
      nodes: layoutedGraph.children?.map((node: any) => ({
        ...nodes.find((n) => n.id === node.id),
        position: { x: node.x ?? 0, y: node.y ?? 0 },
        targetPosition: isHorizontal ? Position.Left : Position.Top,
        sourcePosition: isHorizontal ? Position.Right : Position.Bottom,
      })) as Node[] ?? [],
      edges,
    };
  } catch (error) {
    console.error("ELK layout error:", error);
    return { nodes, edges };
  }
}

// Status indicator component
function StatusDot({ status }: { status: Status }) {
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
      className={cn(
        "inline-block w-2.5 h-2.5 rounded-full shadow-sm",
        colors[status]
      )}
    />
  );
}

// Tool Node - represents AI tools (Claude Code, Codex, etc.)
export function ToolNode({ data }: { data: ToolNodeData }) {
  const isInstalled = data.installed !== false;

  return (
    <div
      className={cn(
        "px-4 py-3 rounded-lg border-2 bg-card shadow-lg min-w-[130px] transition-all",
        isInstalled
          ? "border-primary/60 hover:border-primary hover:shadow-primary/20"
          : "border-gray-600 opacity-50"
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-primary !w-3 !h-3" />
      <div className="flex items-center gap-2">
        <StatusDot status={isInstalled ? data.status : "not_installed"} />
        <span className={cn("font-medium text-sm", !isInstalled && "text-gray-500")}>
          {data.name}
        </span>
      </div>
      {!isInstalled && (
        <div className="text-[10px] text-gray-500 mt-1">Not installed</div>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-primary !w-3 !h-3" />
    </div>
  );
}

// Resource Node - represents skills, MCPs, or memory files
export function ResourceNode({ data }: { data: ResourceNodeData }) {
  const isEnabled = data.enabled !== false;
  const typeStyles: Record<string, { border: string; bg: string }> = {
    skill: { border: "border-blue-500/60", bg: "bg-blue-500/10" },
    mcp: { border: "border-purple-500/60", bg: "bg-purple-500/10" },
    memory: { border: "border-amber-500/60", bg: "bg-amber-500/10" },
  };

  const style = typeStyles[data.type] || typeStyles.skill;

  return (
    <div
      className={cn(
        "px-3 py-2 rounded-md border shadow-md min-w-[110px] transition-all hover:scale-105",
        style.border,
        style.bg,
        !isEnabled && "opacity-50"
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-muted !w-2 !h-2" />
      <div className="flex items-center gap-2">
        <StatusDot status={isEnabled ? data.status : "disabled"} />
        <span className="text-sm font-medium truncate max-w-[100px]">{data.name}</span>
        <button
          role="switch"
          aria-checked={isEnabled}
          aria-label={`Toggle ${data.name}`}
          onClick={(e) => {
            e.stopPropagation();
            data.onToggle?.(data.type, data.name, !isEnabled);
          }}
          className={cn(
            "ml-auto relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
            isEnabled ? "bg-primary" : "bg-muted"
          )}
        >
          <span
            className={cn(
              "pointer-events-none inline-block h-3 w-3 rounded-full bg-white shadow-sm transition-transform",
              isEnabled ? "translate-x-3" : "translate-x-0"
            )}
          />
        </button>
      </div>
      <div className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-wider">
        {data.type}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-muted !w-2 !h-2" />
    </div>
  );
}

// Plugin Node - represents installed plugins from marketplaces
export function PluginNode({ data }: { data: PluginNodeData }) {
  const isEnabled = data.enabled !== false;

  return (
    <div
      className={cn(
        "px-3 py-2 rounded-md border shadow-md min-w-[110px] transition-all hover:scale-105 cursor-pointer",
        "border-teal-500/60",
        "bg-teal-500/10",
        !isEnabled && "opacity-50"
      )}
      onClick={() => data.onClick?.(data.name)}
    >
      <Handle type="target" position={Position.Top} className="!bg-muted !w-2 !h-2" />
      <div className="flex items-center gap-2">
        <StatusDot status={isEnabled ? "synced" : "disabled"} />
        <span className="text-sm font-medium truncate max-w-[100px]">{data.name}</span>
        <button
          role="switch"
          aria-checked={isEnabled}
          aria-label={`Toggle ${data.name}`}
          onClick={(e) => {
            e.stopPropagation();
            data.onToggle?.(data.name, !isEnabled);
          }}
          className={cn(
            "ml-auto relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
            isEnabled ? "bg-primary" : "bg-muted"
          )}
        >
          <span
            className={cn(
              "pointer-events-none inline-block h-3 w-3 rounded-full bg-white shadow-sm transition-transform",
              isEnabled ? "translate-x-3" : "translate-x-0"
            )}
          />
        </button>
      </div>
      <div className="flex items-center gap-2 mt-0.5">
        <span className="rounded-full bg-teal-500/20 px-1.5 py-0 text-[9px] text-teal-400">{data.marketplace}</span>
        <span className="text-[10px] text-muted-foreground">{data.skillCount} skills</span>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-muted !w-2 !h-2" />
    </div>
  );
}

// Node types registry
const nodeTypes = {
  tool: ToolNode,
  resource: ResourceNode,
  plugin: PluginNode,
};

// Default tools - will be filtered based on what's installed
const ALL_TOOLS: ToolData[] = [
  { id: "claude-code", name: "Claude Code", status: "synced", installed: true },
  { id: "codex", name: "Codex CLI", status: "synced", installed: true },
  { id: "gemini", name: "Gemini CLI", status: "synced", installed: true },
  { id: "opencode", name: "OpenCode", status: "synced", installed: true },
  { id: "openclaw", name: "OpenClaw", status: "synced", installed: true },
  { id: "aider", name: "Aider", status: "synced", installed: true },
];

interface ToggleInfo {
  type: "skill" | "mcp" | "memory";
  name: string;
  enabled: boolean;
}

interface GraphProps {
  data?: GraphData;
  onNodeClick?: (node: Node) => void;
  onToggle?: (toggle: ToggleInfo) => void;
  onPluginClick?: (pluginName: string) => void;
  showUninstalledTools?: boolean;
}

export function Graph({ data, onNodeClick, onToggle, onPluginClick, showUninstalledTools = false }: GraphProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [layoutDirection, setLayoutDirection] = useState<"DOWN" | "RIGHT">("DOWN");

  const handleToggle = useCallback(
    (type: "skill" | "mcp" | "memory", name: string, enabled: boolean) => {
      onToggle?.({ type, name, enabled });
    },
    [onToggle]
  );

  // Build initial nodes and edges from data
  const { initialNodes, initialEdges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    // Get tools - use provided or defaults, filter by installed status
    const tools = data?.tools || ALL_TOOLS;
    const visibleTools = showUninstalledTools
      ? tools
      : tools.filter((t) => t.installed !== false);

    // Tool nodes
    visibleTools.forEach((tool, index) => {
      nodes.push({
        id: `tool-${tool.id}`,
        type: "tool",
        position: { x: index * 160, y: 0 },
        data: {
          name: tool.name,
          status: tool.status,
          installed: tool.installed
        },
      });
    });

    // Build a set of skills owned by plugins
    const pluginSkillSet = new Set<string>();
    data?.plugins?.forEach((plugin) => {
      plugin.skills.forEach((s) => pluginSkillSet.add(s));
    });

    // Plugin nodes
    data?.plugins?.forEach((plugin, index) => {
      const nodeId = `plugin-${plugin.name}`;
      nodes.push({
        id: nodeId,
        type: "plugin",
        position: { x: index * 160, y: 75 },
        data: {
          name: plugin.name,
          marketplace: plugin.marketplace,
          skillCount: plugin.skillCount,
          enabled: plugin.enabled,
          onToggle: (name: string, enabled: boolean) => onToggle?.({ type: "skill", name, enabled }),
          onClick: (name: string) => onPluginClick?.(name),
        },
      });

      // Connect plugin to all installed tools
      visibleTools.filter(t => t.installed).forEach((tool) => {
        edges.push({
          id: `${nodeId}-to-tool-${tool.id}`,
          source: nodeId,
          target: `tool-${tool.id}`,
          animated: plugin.enabled,
          style: { stroke: "#14b8a6", strokeWidth: 2, ...(plugin.enabled ? {} : { strokeDasharray: "5,5", opacity: 0.4 }) },
        });
      });
    });

    // Skill nodes
    data?.skills.forEach((skill, index) => {
      const nodeId = `skill-${skill.name}`;
      nodes.push({
        id: nodeId,
        type: "resource",
        position: { x: index * 140, y: 150 },
        data: { name: skill.name, type: "skill", status: skill.status, enabled: skill.enabled, onToggle: handleToggle },
      });

      const isEnabled = skill.enabled !== false;

      // If this skill belongs to a plugin, connect to plugin instead of tools
      if (pluginSkillSet.has(skill.name)) {
        const parentPlugin = data?.plugins?.find((p) => p.skills.includes(skill.name));
        if (parentPlugin) {
          edges.push({
            id: `${nodeId}-to-plugin-${parentPlugin.name}`,
            source: nodeId,
            target: `plugin-${parentPlugin.name}`,
            animated: isEnabled && skill.status === "synced",
            style: { stroke: "#3b82f6", strokeWidth: 2, ...(isEnabled ? {} : { strokeDasharray: "5,5", opacity: 0.4 }) },
          });
          return;
        }
      }

      // Connect to specified tools or all installed tools
      const targetTools = skill.connectedTools || visibleTools.filter(t => t.installed).map((t) => t.id);
      targetTools.forEach((toolId) => {
        if (visibleTools.some(t => t.id === toolId)) {
          edges.push({
            id: `${nodeId}-to-${toolId}`,
            source: nodeId,
            target: `tool-${toolId}`,
            animated: isEnabled && skill.status === "synced",
            style: { stroke: "#3b82f6", strokeWidth: 2, ...(isEnabled ? {} : { strokeDasharray: "5,5", opacity: 0.4 }) },
          });
        }
      });
    });

    // MCP nodes
    data?.mcps.forEach((mcp, index) => {
      const nodeId = `mcp-${mcp.name}`;
      nodes.push({
        id: nodeId,
        type: "resource",
        position: { x: index * 140, y: 300 },
        data: { name: mcp.name, type: "mcp", status: mcp.status, enabled: mcp.enabled, onToggle: handleToggle },
      });

      const isMcpEnabled = mcp.enabled !== false;
      // Connect to specified tools or all installed tools
      const targetTools = mcp.connectedTools || visibleTools.filter(t => t.installed).map((t) => t.id);
      targetTools.forEach((toolId) => {
        if (visibleTools.some(t => t.id === toolId)) {
          edges.push({
            id: `${nodeId}-to-${toolId}`,
            source: nodeId,
            target: `tool-${toolId}`,
            animated: isMcpEnabled && mcp.status === "synced",
            style: { stroke: "#a855f7", strokeWidth: 2, ...(isMcpEnabled ? {} : { strokeDasharray: "5,5", opacity: 0.4 }) },
          });
        }
      });
    });

    // Memory nodes
    data?.memory.forEach((mem, index) => {
      const nodeId = `memory-${mem.name}`;
      nodes.push({
        id: nodeId,
        type: "resource",
        position: { x: index * 140, y: 450 },
        data: { name: mem.name, type: "memory", status: mem.status, onToggle: handleToggle },
      });

      // Connect based on scope
      let targetToolIds: string[];
      if (mem.scope === "personal") {
        targetToolIds = ["openclaw"];
      } else if (mem.scope === "coding") {
        targetToolIds = visibleTools.filter(t => t.id !== "openclaw" && t.installed).map((t) => t.id);
      } else {
        targetToolIds = visibleTools.filter(t => t.installed).map((t) => t.id);
      }

      targetToolIds.forEach((toolId) => {
        if (visibleTools.some(t => t.id === toolId)) {
          edges.push({
            id: `${nodeId}-to-${toolId}`,
            source: nodeId,
            target: `tool-${toolId}`,
            animated: mem.status === "synced",
            style: { stroke: "#f59e0b", strokeWidth: 2 },
          });
        }
      });
    });

    return { initialNodes: nodes, initialEdges: edges };
  }, [data, showUninstalledTools, handleToggle, onToggle, onPluginClick]);

  // Apply ELK layout when data changes
  useEffect(() => {
    if (initialNodes.length > 0) {
      getLayoutedElements(initialNodes, initialEdges, layoutDirection).then(
        ({ nodes: layoutedNodes, edges: layoutedEdges }) => {
          setNodes(layoutedNodes);
          setEdges(layoutedEdges);
        }
      );
    }
  }, [initialNodes, initialEdges, layoutDirection, setNodes, setEdges]);

  // Re-layout handler
  const onLayout = useCallback(
    (direction: "DOWN" | "RIGHT") => {
      setLayoutDirection(direction);
      getLayoutedElements(nodes, edges, direction).then(
        ({ nodes: layoutedNodes, edges: layoutedEdges }) => {
          setNodes(layoutedNodes);
          setEdges(layoutedEdges);
        }
      );
    },
    [nodes, edges, setNodes, setEdges]
  );

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      onNodeClick?.(node);
    },
    [onNodeClick]
  );

  return (
    <div data-testid="react-flow-graph" className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        onNodeClick={handleNodeClick}
        fitView
        minZoom={0.3}
        maxZoom={2}
        defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
        proOptions={{ hideAttribution: true }}
      >
        <Panel position="top-right" className="flex gap-2">
          <button
            onClick={() => onLayout("DOWN")}
            className={cn(
              "px-3 py-1.5 rounded text-xs font-medium transition-colors",
              layoutDirection === "DOWN"
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            )}
          >
            Vertical
          </button>
          <button
            onClick={() => onLayout("RIGHT")}
            className={cn(
              "px-3 py-1.5 rounded text-xs font-medium transition-colors",
              layoutDirection === "RIGHT"
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            )}
          >
            Horizontal
          </button>
        </Panel>
        <Background color="#333" gap={20} />
        <Controls className="!bg-card !border-border [&>button]:!bg-card [&>button]:!border-border" />
        <MiniMap
          className="!bg-card/80 !border-border"
          maskColor="rgba(0,0,0,0.8)"
          nodeColor={(node) => {
            const nodeData = node.data as { status?: Status; type?: string };
            if (nodeData?.status === "synced") return "#22c55e";
            if (nodeData?.status === "pending") return "#eab308";
            if (nodeData?.status === "error") return "#ef4444";
            if (nodeData?.status === "not_installed") return "#374151";
            if (nodeData?.type === "skill") return "#3b82f6";
            if (nodeData?.type === "mcp") return "#a855f7";
            if (nodeData?.type === "memory") return "#f59e0b";
            return "#6b7280";
          }}
        />
      </ReactFlow>
    </div>
  );
}
