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
  Position,
  useNodesState,
  useEdgesState,
  Panel,
} from "@xyflow/react";
import ELK from "elkjs/lib/elk.bundled.js";
import "@xyflow/react/dist/style.css";
import { cn } from "@/lib/utils";
import { ToolNode, ResourceNode, PluginNode, AddToolNode } from "./nodes";
import type { ResourceNodeData, PluginNodeData } from "./nodes";

// Re-export node components for backwards compatibility
export { ToolNode, ResourceNode, PluginNode, AddToolNode };

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
  componentCount: number;
  enabled: boolean;
  skills: string[];
  agents?: string[];
  commands?: string[];
  hooks?: string[];
  libs?: string[];
}

interface GraphData {
  tools?: ToolData[];
  skills: SkillData[];
  mcps: McpData[];
  memory: MemoryData[];
  plugins?: PluginData[];
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
      width: node.type === "tool" || node.type === "addTool" ? 140 : 120,
      height: node.type === "tool" || node.type === "addTool" ? 60 : 50,
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

// Node types registry
const nodeTypes = {
  tool: ToolNode,
  resource: ResourceNode,
  plugin: PluginNode,
  addTool: AddToolNode,
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
  mode?: "dashboard" | "migrate";
  onNodeClick?: (node: Node) => void;
  onToggle?: (toggle: ToggleInfo) => void;
  onPluginClick?: (pluginName: string) => void;
  onMcpClick?: (mcpName: string) => void;
  onSkillClick?: (skillName: string) => void;
  onAddTool?: () => void;
  showUninstalledTools?: boolean;
}

export function Graph({ data, mode = "dashboard", onNodeClick, onToggle, onPluginClick, onMcpClick, onSkillClick, onAddTool, showUninstalledTools = false }: GraphProps) {
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
          componentCount: plugin.componentCount,
          skillCount: plugin.skills?.length ?? 0,
          agentCount: plugin.agents?.length ?? 0,
          commandCount: plugin.commands?.length ?? 0,
          hookCount: plugin.hooks?.length ?? 0,
          libCount: plugin.libs?.length ?? 0,
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

    // Skill nodes — skip skills that belong to a plugin (they're collapsed into the plugin node)
    data?.skills.forEach((skill, index) => {
      if (pluginSkillSet.has(skill.name)) return; // collapsed into plugin node

      const nodeId = `skill-${skill.name}`;
      nodes.push({
        id: nodeId,
        type: "resource",
        position: { x: index * 140, y: 150 },
        data: { name: skill.name, type: "skill", status: skill.status, enabled: skill.enabled, onToggle: handleToggle },
      });

      const isEnabled = skill.enabled !== false;

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

    // "+ Add Tool" node in migrate mode
    if (mode === "migrate") {
      nodes.push({
        id: "add-tool",
        type: "addTool",
        position: { x: visibleTools.length * 160, y: 0 },
        data: { onClick: onAddTool },
      });
    }

    return { initialNodes: nodes, initialEdges: edges };
  }, [data, mode, showUninstalledTools, handleToggle, onToggle, onPluginClick, onAddTool]);

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
      // Dispatch to specific click handlers based on node type
      if (node.type === "plugin") {
        onPluginClick?.((node.data as unknown as PluginNodeData).name);
      } else if (node.type === "resource") {
        const rd = node.data as unknown as ResourceNodeData;
        if (rd.type === "mcp") onMcpClick?.(rd.name);
        else if (rd.type === "skill") onSkillClick?.(rd.name);
      }
    },
    [onNodeClick, onPluginClick, onMcpClick, onSkillClick]
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
