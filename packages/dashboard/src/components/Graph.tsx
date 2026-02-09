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
import {
  NODE_SIZES,
  DEFAULT_SIZE,
  EDGE_COLORS,
  STATUS_COLORS,
  EDGE_STYLE,
  DISABLED_EDGE_STYLE,
  BACKGROUND_GRID,
  LOCALSTORAGE_KEYS,
  DEFAULT_EDGE_TYPE,
  DEFAULT_LAYOUT_DIRECTION,
} from "@/lib/graph-config";
import type { Direction, EdgeType } from "@/lib/graph-config";

// Re-export node components for backwards compatibility
export { ToolNode, ResourceNode, PluginNode, AddToolNode };

import type { Status } from "@/types";

// ── Category classifier ──

type Category = "plugin" | "skill" | "tool" | "mcp" | "memory" | "other";

function getCategory(node: Node): Category {
  if (node.type === "tool" || node.type === "addTool") return "tool";
  if (node.type === "plugin") return "plugin";
  if (node.data?.type === "skill") return "skill";
  if (node.data?.type === "mcp") return "mcp";
  if (node.data?.type === "memory") return "memory";
  return "other";
}

// Row order for layered layouts: top → bottom (DOWN) or left → right (RIGHT)
const LAYER_ORDER: Category[] = ["plugin", "skill", "tool", "mcp", "memory"];

function groupByCategory(nodes: Node[]): Map<Category, Node[]> {
  const groups = new Map<Category, Node[]>();
  for (const cat of LAYER_ORDER) groups.set(cat, []);
  for (const node of nodes) {
    const cat = getCategory(node);
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(node);
  }
  return groups;
}

// ── Manual layered layout — guaranteed 4-row grouping ──

function getLayeredLayout(
  nodes: Node[],
  edges: Edge[],
  direction: "DOWN" | "RIGHT",
): { nodes: Node[]; edges: Edge[] } {
  const isHorizontal = direction === "RIGHT";
  const groups = groupByCategory(nodes);
  const nodeSpacing = 30;
  const layerSpacing = 120;
  const result: Node[] = [];

  // Merge plugins + skills into one row, keep tools, mcps, memory separate
  const rows: Node[][] = [
    [...(groups.get("plugin") ?? []), ...(groups.get("skill") ?? [])],
    groups.get("tool") ?? [],
    groups.get("mcp") ?? [],
    groups.get("memory") ?? [],
  ].filter((r) => r.length > 0);

  // For each row, calculate its "spread" along the cross axis (the axis nodes are laid out on)
  // DOWN mode: spread = total width of row | RIGHT mode: spread = total height of row
  const rowSpreads = rows.map((row) =>
    row.reduce((sum, n) => {
      const size = NODE_SIZES[n.type || ""] || DEFAULT_SIZE;
      return sum + (isHorizontal ? size.height : size.width) + nodeSpacing;
    }, -nodeSpacing),
  );
  const maxSpread = Math.max(...rowSpreads);

  let layerOffset = 0;

  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx];
    const rowSpread = rowSpreads[rowIdx];
    // Center this row relative to the widest row
    const startOffset = (maxSpread - rowSpread) / 2;

    let maxLayerThickness = 0;
    let crossOffset = startOffset;

    for (const node of row) {
      const size = NODE_SIZES[node.type || ""] || DEFAULT_SIZE;
      const thickness = isHorizontal ? size.width : size.height;
      const crossSize = isHorizontal ? size.height : size.width;
      maxLayerThickness = Math.max(maxLayerThickness, thickness);

      result.push({
        ...node,
        zIndex: 10, // nodes above edges
        position: isHorizontal
          ? { x: layerOffset, y: crossOffset }
          : { x: crossOffset, y: layerOffset },
        sourcePosition: isHorizontal ? Position.Right : Position.Bottom,
        targetPosition: isHorizontal ? Position.Left : Position.Top,
      });

      crossOffset += crossSize + nodeSpacing;
    }

    layerOffset += maxLayerThickness + layerSpacing;
  }

  return { nodes: result, edges };
}

// ── Radial layout — concentric circles, each ring = one category ──

function getRadialLayout(
  nodes: Node[],
  edges: Edge[],
): { nodes: Node[]; edges: Edge[] } {
  const groups = groupByCategory(nodes);
  const result: Node[] = [];

  const ringDefs: Node[][] = [
    groups.get("tool") ?? [],
    [...(groups.get("plugin") ?? []), ...(groups.get("skill") ?? [])],
    groups.get("mcp") ?? [],
    groups.get("memory") ?? [],
  ];

  // Build radii incrementally — each ring must be far enough from previous to avoid overlap
  const radii: number[] = [];
  let prevRadius = 0;

  for (let i = 0; i < ringDefs.length; i++) {
    const ringNodes = ringDefs[i];
    if (ringNodes.length === 0) {
      radii.push(prevRadius); // placeholder
      continue;
    }

    if (i === 0) {
      // Tools: center ring
      const r = ringNodes.length <= 1 ? 0 : Math.max(100, ringNodes.length * 45);
      radii.push(r);
      prevRadius = r;
    } else {
      // Outer ring: radius must provide enough circumference AND be far enough from previous ring
      const maxNodeW = Math.max(...ringNodes.map((n) => NODE_SIZES[n.type || ""]?.width ?? DEFAULT_SIZE.width));
      const maxNodeH = Math.max(...ringNodes.map((n) => NODE_SIZES[n.type || ""]?.height ?? DEFAULT_SIZE.height));
      const nodeGap = 50;
      const minCircumference = ringNodes.length * (maxNodeW + nodeGap);
      const minRadiusForFit = minCircumference / (2 * Math.PI);
      const minRadiusForGap = prevRadius + Math.max(maxNodeH, maxNodeW) + 80;
      const r = Math.max(minRadiusForFit, minRadiusForGap);
      radii.push(r);
      prevRadius = r;
    }
  }

  // Center point
  const outerRadius = Math.max(...radii);
  const cx = outerRadius + 200;
  const cy = outerRadius + 200;

  for (let i = 0; i < ringDefs.length; i++) {
    const ringNodes = ringDefs[i];
    if (ringNodes.length === 0) continue;
    const radius = radii[i];

    ringNodes.forEach((node, j) => {
      const angle = (j / ringNodes.length) * 2 * Math.PI - Math.PI / 2;
      const nw = NODE_SIZES[node.type || ""]?.width ?? DEFAULT_SIZE.width;
      const nh = NODE_SIZES[node.type || ""]?.height ?? DEFAULT_SIZE.height;
      result.push({
        ...node,
        zIndex: 10,
        position: {
          x: cx + radius * Math.cos(angle) - nw / 2,
          y: cy + radius * Math.sin(angle) - nh / 2,
        },
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
      });
    });
  }

  return { nodes: result, edges };
}

// ── Main layout dispatcher ──

async function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
  direction: Direction = DEFAULT_LAYOUT_DIRECTION,
): Promise<{ nodes: Node[]; edges: Edge[] }> {
  if (direction === "RADIAL") {
    return getRadialLayout(nodes, edges);
  }
  return getLayeredLayout(nodes, edges, direction);
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
  const fitViewRef = useRef<(() => void) | null>(null);
  const [layoutDirection, setLayoutDirectionState] = useState<Direction>(() => {
    try { return (localStorage.getItem(LOCALSTORAGE_KEYS.layout) as Direction) || DEFAULT_LAYOUT_DIRECTION; } catch { return DEFAULT_LAYOUT_DIRECTION; }
  });
  const [edgeType, setEdgeTypeState] = useState<EdgeType>(() => {
    try { return (localStorage.getItem(LOCALSTORAGE_KEYS.edgeType) as EdgeType) || DEFAULT_EDGE_TYPE; } catch { return DEFAULT_EDGE_TYPE; }
  });

  const setLayoutDirection = useCallback((dir: Direction) => {
    setLayoutDirectionState(dir);
    try { localStorage.setItem(LOCALSTORAGE_KEYS.layout, dir); } catch {}
  }, []);

  const setEdgeType = useCallback((type: EdgeType) => {
    setEdgeTypeState(type);
    try { localStorage.setItem(LOCALSTORAGE_KEYS.edgeType, type); } catch {}
  }, []);

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
            stroke: EDGE_COLORS.disabled,
            strokeWidth: EDGE_STYLE.strokeWidth,
            strokeDasharray: DISABLED_EDGE_STYLE.strokeDasharray,
            opacity: DISABLED_EDGE_STYLE.opacity,
          },
          label: "✕",
          labelStyle: { fill: EDGE_COLORS.disabled, fontSize: DISABLED_EDGE_STYLE.fontSize, fontWeight: 700, cursor: "pointer" },
          labelBgStyle: { fill: "#1a1a1a", fillOpacity: DISABLED_EDGE_STYLE.labelBgOpacity, rx: DISABLED_EDGE_STYLE.labelBgRadius, ry: DISABLED_EDGE_STYLE.labelBgRadius },
          labelBgPadding: DISABLED_EDGE_STYLE.labelPadding,
        };
      }
      return { ...edge, type: edgeType, interactionWidth: 30 };
    });
  }, [edges, effectiveDisabled, edgeType]);

  // Apply ELK layout when data changes
  useEffect(() => {
    if (initialNodes.length > 0) {
      getLayoutedElements(initialNodes, initialEdges, layoutDirection).then(
        ({ nodes: layoutedNodes, edges: layoutedEdges }) => {
          setNodes(layoutedNodes);
          setEdges(layoutedEdges);
          setTimeout(() => fitViewRef.current?.(), 50);
        }
      );
    }
  }, [initialNodes, initialEdges, layoutDirection, setNodes, setEdges]);

  // Re-layout handler
  const onLayout = useCallback(
    (direction: Direction) => {
      setLayoutDirection(direction);
      getLayoutedElements(nodes, edges, direction).then(
        ({ nodes: layoutedNodes, edges: layoutedEdges }) => {
          setNodes(layoutedNodes);
          setEdges(layoutedEdges);
          setTimeout(() => fitViewRef.current?.(), 50);
        }
      );
    },
    [nodes, edges, setNodes, setEdges, setLayoutDirection]
  );

  const onNodeDragStop = useCallback(() => {}, []);

  // Drag from handle to create new connections
  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            animated: true,
            style: { stroke: EDGE_COLORS.custom, strokeWidth: EDGE_STYLE.strokeWidth },
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
        onInit={(instance) => { fitViewRef.current = () => instance.fitView({ padding: 0.2, duration: 300 }); }}
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
          <button
            onClick={() => onLayout("RADIAL")}
            className={cn(
              "px-3 py-1.5 rounded text-xs font-medium transition-colors",
              layoutDirection === "RADIAL"
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            )}
          >
            Radial
          </button>
          <span className="mx-1 text-muted-foreground/40">|</span>
          {(["smoothstep", "default", "straight", "step"] as EdgeType[]).map((t) => (
            <button
              key={t}
              onClick={() => setEdgeType(t)}
              className={cn(
                "px-2 py-1.5 rounded text-[10px] font-medium transition-colors capitalize",
                edgeType === t
                  ? "bg-purple-600 text-white"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              )}
            >
              {t === "default" ? "bezier" : t}
            </button>
          ))}
        </Panel>
        <Background color={BACKGROUND_GRID.color} gap={BACKGROUND_GRID.gap} />
        <Controls className="!bg-card !border-border [&>button]:!bg-card [&>button]:!border-border" />
        <MiniMap
          className="!bg-card/80 !border-border"
          maskColor="rgba(0,0,0,0.8)"
          nodeColor={(node) => {
            const nodeData = node.data as { status?: Status; type?: string };
            if (nodeData?.status === "synced") return STATUS_COLORS.synced;
            if (nodeData?.status === "pending") return STATUS_COLORS.pending;
            if (nodeData?.status === "error") return STATUS_COLORS.error;
            if (nodeData?.status === "not_installed") return STATUS_COLORS.not_installed;
            if (nodeData?.type === "skill") return EDGE_COLORS.skill;
            if (nodeData?.type === "mcp") return EDGE_COLORS.mcp;
            if (nodeData?.type === "memory") return EDGE_COLORS.memory;
            return STATUS_COLORS.fallback;
          }}
        />
      </ReactFlow>
    </div>
  );
}
