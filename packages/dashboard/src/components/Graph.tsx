/**
 * Graph - Interactive React Flow visualization with ELK auto-layout
 * Layout: Skills/Plugins (top) → Tools (middle) → MCPs/Memory (bottom)
 * Features: collision resolution, per-edge toggle, direction switch
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
  addEdge,
  Connection,
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

// Node dimension estimates (match actual rendered sizes)
const NODE_SIZES: Record<string, { width: number; height: number }> = {
  tool: { width: 160, height: 60 },
  addTool: { width: 160, height: 60 },
  resource: { width: 170, height: 58 },
  plugin: { width: 180, height: 68 },
};

const DEFAULT_SIZE = { width: 160, height: 55 };

// ELK layout options — tight same-layer, generous between-layer
const elkOptions = {
  "elk.algorithm": "layered",
  "elk.layered.spacing.nodeNodeBetweenLayers": "70",
  "elk.spacing.nodeNode": "20",
  "elk.spacing.edgeNode": "10",
  "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
  "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
  "elk.padding": "[top=15,left=15,bottom=15,right=15]",
};

// Post-layout collision resolver — nudges overlapping nodes apart
function resolveCollisions(
  nodes: Node[],
  margin = 10,
  maxIterations = 50
): Node[] {
  const result = nodes.map((n) => ({ ...n, position: { ...n.position } }));

  for (let iter = 0; iter < maxIterations; iter++) {
    let hadCollision = false;

    for (let i = 0; i < result.length; i++) {
      const a = result[i];
      const aSize = NODE_SIZES[a.type || ""] || DEFAULT_SIZE;

      for (let j = i + 1; j < result.length; j++) {
        const b = result[j];
        const bSize = NODE_SIZES[b.type || ""] || DEFAULT_SIZE;

        // Bounding box overlap check with margin
        const overlapX =
          (aSize.width + bSize.width) / 2 +
          margin -
          Math.abs(
            a.position.x + aSize.width / 2 - (b.position.x + bSize.width / 2)
          );
        const overlapY =
          (aSize.height + bSize.height) / 2 +
          margin -
          Math.abs(
            a.position.y +
              aSize.height / 2 -
              (b.position.y + bSize.height / 2)
          );

        if (overlapX > 0 && overlapY > 0) {
          hadCollision = true;
          // Push apart along axis of minimum overlap
          if (overlapX < overlapY) {
            const sign =
              a.position.x + aSize.width / 2 <
              b.position.x + bSize.width / 2
                ? -1
                : 1;
            a.position.x += (sign * overlapX) / 2;
            b.position.x -= (sign * overlapX) / 2;
          } else {
            const sign =
              a.position.y + aSize.height / 2 <
              b.position.y + bSize.height / 2
                ? -1
                : 1;
            a.position.y += (sign * overlapY) / 2;
            b.position.y -= (sign * overlapY) / 2;
          }
        }
      }
    }

    if (!hadCollision) break;
  }

  return result;
}

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
    children: nodes.map((node) => {
      const size = NODE_SIZES[node.type || ""] || DEFAULT_SIZE;
      return {
        ...node,
        width: size.width,
        height: size.height,
        // Layer constraints: skills/plugins first, tools middle, MCPs/memory last
        layoutOptions: node.data?.__elkLayer
          ? { "elk.layered.layerConstraint": node.data.__elkLayer as string }
          : undefined,
      };
    }),
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

    const layoutedNodes =
      (layoutedGraph.children?.map((node: any) => ({
        ...nodes.find((n) => n.id === node.id),
        position: { x: node.x ?? 0, y: node.y ?? 0 },
        targetPosition: isHorizontal ? Position.Left : Position.Top,
        sourcePosition: isHorizontal ? Position.Right : Position.Bottom,
      })) as Node[]) ?? [];

    // Post-layout collision resolution
    const resolved = resolveCollisions(layoutedNodes);

    return { nodes: resolved, edges };
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
  onEdgeToggle?: (edgeId: string, enabled: boolean) => void;
  disabledEdges?: Set<string>;
  showUninstalledTools?: boolean;
}

export function Graph({
  data,
  mode = "dashboard",
  onNodeClick,
  onToggle,
  onPluginClick,
  onMcpClick,
  onSkillClick,
  onAddTool,
  onEdgeToggle,
  disabledEdges,
  showUninstalledTools = false,
}: GraphProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [layoutDirection, setLayoutDirection] = useState<"DOWN" | "RIGHT">(
    "DOWN"
  );

  // Track disabled edges locally if not controlled
  const [localDisabledEdges, setLocalDisabledEdges] = useState<Set<string>>(
    new Set()
  );
  const effectiveDisabled = disabledEdges ?? localDisabledEdges;

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

  const stableHandlers = useMemo(
    () => ({
      handleToggle,
      onToggle: (toggle: ToggleInfo) => onToggleRef.current?.(toggle),
      onPluginClick: (name: string) => onPluginClickRef.current?.(name),
      onAddTool: () => onAddToolRef.current?.(),
    }),
    [handleToggle]
  );

  // Build initial nodes and edges from data
  const { initialNodes, initialEdges } = useMemo(
    () =>
      buildDashboardGraph(data, mode, showUninstalledTools, stableHandlers),
    [data, mode, showUninstalledTools, stableHandlers]
  );

  // Apply disabled-edge styling
  const styledEdges = useMemo(() => {
    return edges.map((edge) => {
      if (effectiveDisabled.has(edge.id)) {
        return {
          ...edge,
          animated: false,
          interactionWidth: 30,
          style: {
            stroke: "#ef4444",
            strokeWidth: 1.5,
            strokeDasharray: "6,4",
            opacity: 0.55,
          },
          label: "✕",
          labelStyle: { fill: "#ef4444", fontSize: 13, fontWeight: 700, cursor: "pointer" },
          labelBgStyle: { fill: "#1a1a1a", fillOpacity: 0.9, rx: 8, ry: 8 },
          labelBgPadding: [5, 5] as [number, number],
        };
      }
      return { ...edge, interactionWidth: 30 };
    });
  }, [edges, effectiveDisabled]);

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

  // Resolve collisions after drag
  const onNodeDragStop = useCallback(
    () => {
      setNodes((nds) => resolveCollisions([...nds]));
    },
    [setNodes]
  );

  // Drag from handle to create new connections
  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            animated: true,
            style: { stroke: "#6b7280", strokeWidth: 1.5 },
          },
          eds
        )
      );
    },
    [setEdges]
  );

  // Edge click — toggle individual connections
  const handleEdgeClick = useCallback(
    (_event: React.MouseEvent, edge: Edge) => {
      const isCurrentlyDisabled = effectiveDisabled.has(edge.id);
      if (onEdgeToggle) {
        onEdgeToggle(edge.id, isCurrentlyDisabled); // parent controls
      } else {
        setLocalDisabledEdges((prev) => {
          const next = new Set(prev);
          if (isCurrentlyDisabled) {
            next.delete(edge.id);
          } else {
            next.add(edge.id);
          }
          return next;
        });
      }
    },
    [effectiveDisabled, onEdgeToggle]
  );

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      onNodeClick?.(node);
      if (node.type === "plugin") {
        onPluginClickRef.current?.(
          (node.data as unknown as PluginNodeData).name
        );
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
        edges={styledEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        onNodeClick={handleNodeClick}
        onNodeDragStop={onNodeDragStop}
        onEdgeClick={handleEdgeClick}
        onConnect={onConnect}
        fitView
        minZoom={0.3}
        maxZoom={2}
        defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
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
