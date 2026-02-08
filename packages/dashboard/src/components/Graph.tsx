/**
 * Graph - Interactive React Flow visualization with ELK auto-layout
 * Supports drag-and-drop, smart layout for large graphs, and tool detection
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import "@xyflow/react/dist/style.css";
import { cn } from "@/lib/utils";
import { ToolNode, ResourceNode, PluginNode, AddToolNode } from "./nodes";
import type { ResourceNodeData, PluginNodeData } from "./nodes";
import { buildDashboardGraph } from "@/lib/graph-builder";
import type { DashboardGraphData } from "@/lib/graph-builder";

// Re-export node components for backwards compatibility
export { ToolNode, ResourceNode, PluginNode, AddToolNode };

import type { Status } from "@/types";

// ELK layout options
const elkOptions = {
  "elk.algorithm": "layered",
  "elk.layered.spacing.nodeNodeBetweenLayers": "100",
  "elk.spacing.nodeNode": "50",
  "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
  "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
};

// Lazy-load ELK and apply layout
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
    const ELK = (await import("elkjs/lib/elk.bundled.js")).default;
    const elk = new ELK();
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

interface ToggleInfo {
  type: "skill" | "mcp" | "memory";
  name: string;
  enabled: boolean;
}

interface GraphProps {
  data?: DashboardGraphData;
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

  // Stabilize callback refs to prevent unnecessary re-renders and ELK re-layouts
  const onToggleRef = useRef(onToggle);
  onToggleRef.current = onToggle;
  const onPluginClickRef = useRef(onPluginClick);
  onPluginClickRef.current = onPluginClick;
  const onAddToolRef = useRef(onAddTool);
  onAddToolRef.current = onAddTool;

  const handleToggle = useCallback(
    (type: "skill" | "mcp" | "memory", name: string, enabled: boolean) => {
      onToggleRef.current?.({ type, name, enabled });
    },
    []
  );

  const stableHandlers = useMemo(() => ({
    handleToggle,
    onToggle: (toggle: ToggleInfo) => onToggleRef.current?.(toggle),
    onPluginClick: (name: string) => onPluginClickRef.current?.(name),
    onAddTool: () => onAddToolRef.current?.(),
  }), [handleToggle]);

  // Build initial nodes and edges from data
  const { initialNodes, initialEdges } = useMemo(
    () => buildDashboardGraph(data, mode, showUninstalledTools, stableHandlers),
    [data, mode, showUninstalledTools, stableHandlers]
  );

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
      if (node.type === "plugin") {
        onPluginClickRef.current?.((node.data as unknown as PluginNodeData).name);
      } else if (node.type === "resource") {
        const rd = node.data as unknown as ResourceNodeData;
        if (rd.type === "mcp") onMcpClick?.(rd.name);
        else if (rd.type === "skill") onSkillClick?.(rd.name);
      }
    },
    [onNodeClick, onMcpClick, onSkillClick]
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
