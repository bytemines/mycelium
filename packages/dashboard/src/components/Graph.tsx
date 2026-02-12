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
  useNodesInitialized,
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
  DEFAULT_RADIAL_MODE,
} from "@/lib/graph-config";
import type { Direction, EdgeType, RadialMode } from "@/lib/graph-config";

// Re-export node components for backwards compatibility
export { ToolNode, ResourceNode, PluginNode, AddToolNode };

import type { Status } from "@/types";

// ── Category classifier ──

type Category = "plugin" | "skill" | "tool" | "mcp" | "other";

function getCategory(node: Node): Category {
  if (node.type === "tool" || node.type === "addTool") return "tool";
  if (node.type === "plugin") return "plugin";
  if (node.data?.type === "skill") return "skill";
  if (node.data?.type === "mcp") return "mcp";
  return "other";
}

// Row order for layered layouts: top → bottom (DOWN) or left → right (RIGHT)
const LAYER_ORDER: Category[] = ["plugin", "skill", "tool", "mcp"];

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
  ].filter((r) => r.length > 0);

  // Get actual node size: prefer measured dimensions, fall back to NODE_SIZES config
  const getSize = (n: Node) => {
    const measured = n.measured;
    if (measured?.width && measured?.height) return { width: measured.width, height: measured.height };
    return NODE_SIZES[n.type || ""] || DEFAULT_SIZE;
  };

  // Calculate total cross-axis content size per row (sum of node widths/heights)
  const rowContentSizes = rows.map((row) =>
    row.reduce((sum, n) => {
      const size = getSize(n);
      return sum + (isHorizontal ? size.height : size.width);
    }, 0),
  );

  // Row spread = content + uniform gaps
  const rowSpreads = rows.map((row, ri) =>
    rowContentSizes[ri] + (row.length - 1) * nodeSpacing,
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
      const size = getSize(node);
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

// ── Shared radial helpers ──

function buildToolAngles(tools: Node[]): Map<string, number> {
  const m = new Map<string, number>();
  tools.forEach((t, i) => {
    m.set(t.id, (i / tools.length) * 2 * Math.PI - Math.PI / 2);
  });
  return m;
}

function buildNodeToTools(edges: Edge[], toolAngles: Map<string, number>): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const edge of edges) {
    if (toolAngles.has(edge.source)) {
      const list = m.get(edge.target) ?? [];
      list.push(edge.source);
      m.set(edge.target, list);
    }
    if (toolAngles.has(edge.target)) {
      const list = m.get(edge.source) ?? [];
      list.push(edge.target);
      m.set(edge.source, list);
    }
  }
  return m;
}

function primaryToolAngle(node: Node, nodeToTools: Map<string, string[]>, toolAngles: Map<string, number>): number {
  const connected = nodeToTools.get(node.id) ?? [];
  if (connected.length === 0) return Math.PI;
  const angles = connected.map((tid) => toolAngles.get(tid) ?? 0);
  const sinSum = angles.reduce((s, a) => s + Math.sin(a), 0);
  const cosSum = angles.reduce((s, a) => s + Math.cos(a), 0);
  return Math.atan2(sinSum / angles.length, cosSum / angles.length);
}

function placeNode(node: Node, cx: number, cy: number, radius: number, angle: number): Node {
  const nw = NODE_SIZES[node.type || ""]?.width ?? DEFAULT_SIZE.width;
  const nh = NODE_SIZES[node.type || ""]?.height ?? DEFAULT_SIZE.height;
  return {
    ...node,
    zIndex: 10,
    position: {
      x: cx + radius * Math.cos(angle) - nw / 2,
      y: cy + radius * Math.sin(angle) - nh / 2,
    },
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
  };
}

// ── Radial Mode A: Hybrid — Category rings + tool-sector sorting ──

// Compute adaptive radii for a set of rings
function computeAdaptiveRadii(
  rings: Node[][],
  prevRadius: number,
  ringGap = 40,
  nodeGap = 30,
  density = 50, // 0=ignore fit constraint, 100=full fit constraint
): number[] {
  const fitScale = density / 100; // 0→1
  const radii: number[] = [];
  let prev = prevRadius;
  for (const ringNodes of rings) {
    if (ringNodes.length === 0) { radii.push(prev); continue; }
    const maxW = Math.max(...ringNodes.map((n) => NODE_SIZES[n.type || ""]?.width ?? DEFAULT_SIZE.width));
    const maxH = Math.max(...ringNodes.map((n) => NODE_SIZES[n.type || ""]?.height ?? DEFAULT_SIZE.height));
    const minForFit = (ringNodes.length * (maxW + nodeGap)) / (2 * Math.PI) * fitScale;
    const minForGap = prev + Math.max(maxW, maxH) * fitScale + ringGap;
    const r = Math.max(minForFit, minForGap);
    radii.push(r);
    prev = r;
  }
  return radii;
}

// ── Radial Mode: Hybrid — Category rings + tool-sector sorting ──

function getRadialHybrid(nodes: Node[], edges: Edge[], spacing = 60, center = 150, density = 50): { nodes: Node[]; edges: Edge[] } {
  const groups = groupByCategory(nodes);
  const tools = groups.get("tool") ?? [];
  const toolRadius = tools.length <= 1 ? 0 : center;
  const toolAngles = buildToolAngles(tools);
  const nodeToTools = buildNodeToTools(edges, toolAngles);

  const outerRings = [
    [...(groups.get("plugin") ?? []), ...(groups.get("skill") ?? [])],
    groups.get("mcp") ?? [],
  ];

  const ringRadii = computeAdaptiveRadii(outerRings, toolRadius, spacing, spacing / 2, density);
  const outerR = Math.max(toolRadius, ...ringRadii);
  const cx = outerR + 200, cy = outerR + 200;
  const result: Node[] = [];

  // Place tools
  for (const tool of tools) result.push(placeNode(tool, cx, cy, toolRadius, toolAngles.get(tool.id)!));

  // Place outer rings sorted by primary tool angle
  for (let ri = 0; ri < outerRings.length; ri++) {
    if (outerRings[ri].length === 0) continue;
    const sorted = [...outerRings[ri]].sort(
      (a, b) => primaryToolAngle(a, nodeToTools, toolAngles) - primaryToolAngle(b, nodeToTools, toolAngles),
    );
    sorted.forEach((node, j) => {
      result.push(placeNode(node, cx, cy, ringRadii[ri], (j / sorted.length) * 2 * Math.PI - Math.PI / 2));
    });
  }
  return { nodes: result, edges };
}

// ── Radial Mode: Sectors — each CATEGORY gets a quadrant of the circle ──
// Plugins top-left, Skills bottom-left, MCPs top-right, Memory bottom-right.
// Tools in center. Within each quadrant, nodes fan out in arcs sorted by
// their primary tool connection so related nodes cluster.

function getRadialSectors(nodes: Node[], edges: Edge[], spacing = 60, center = 150, density = 50): { nodes: Node[]; edges: Edge[] } {
  const groups = groupByCategory(nodes);
  const tools = groups.get("tool") ?? [];
  const toolAngles = buildToolAngles(tools);
  const nodeToTools = buildNodeToTools(edges, toolAngles);
  const toolRadius = tools.length <= 1 ? 0 : center;

  // Each category gets a fixed quadrant (center angle + sweep)
  const quadrants: { cat: Category[]; centerAngle: number; label: string }[] = [
    { cat: ["plugin"],  centerAngle: -Math.PI * 3 / 4, label: "Plugins (top-left)" },     // top-left
    { cat: ["skill"],   centerAngle: Math.PI * 3 / 4,  label: "Skills (bottom-left)" },    // bottom-left
    { cat: ["mcp"],     centerAngle: Math.PI / 4,       label: "MCPs (bottom-right)" },     // bottom-right
  ];

  const quadrantSweep = Math.PI / 2; // 90° per quadrant
  const halfSweep = quadrantSweep * 0.42; // use 84%, leave gaps between quadrants

  // Collect nodes per quadrant
  const quadrantNodes: Node[][] = [];
  for (const q of quadrants) {
    const qNodes: Node[] = [];
    for (const cat of q.cat) qNodes.push(...(groups.get(cat) ?? []));
    quadrantNodes.push(qNodes);
  }

  // Use ONE consistent radius for all quadrants — the largest needed
  const maxPerArc = 6;
  const nodeGap = 40;
  const maxW = DEFAULT_SIZE.width;
  const maxNodesInQuadrant = Math.max(...quadrantNodes.map((q) => q.length), 1);
  const nodesOnFirstArc = Math.min(maxPerArc, maxNodesInQuadrant);
  const fitScale = density / 100;
  const minRadiusForFit = (nodesOnFirstArc * (maxW + nodeGap)) / quadrantSweep * fitScale;
  const baseRadius = Math.max(toolRadius + spacing, minRadiusForFit);
  const ringSpacing = spacing + 40;

  // Max arcs needed
  const maxArcs = Math.max(...quadrantNodes.map((q) => Math.ceil(q.length / maxPerArc)), 1);
  const outerR = baseRadius + maxArcs * ringSpacing + 100;
  const cx = outerR + 200, cy = outerR + 200;
  const result: Node[] = [];

  // Place tools in center
  for (const tool of tools) {
    result.push(placeNode(tool, cx, cy, toolRadius, toolAngles.get(tool.id)!));
  }

  // Place each quadrant at the SAME base radius
  for (let qi = 0; qi < quadrants.length; qi++) {
    const q = quadrants[qi];
    const qNodes = quadrantNodes[qi];
    if (qNodes.length === 0) continue;

    // Sort by primary tool angle for clustering
    const sorted = [...qNodes].sort(
      (a, b) => primaryToolAngle(a, nodeToTools, toolAngles) - primaryToolAngle(b, nodeToTools, toolAngles),
    );

    // Split into arcs of maxPerArc
    const arcCount = Math.ceil(sorted.length / maxPerArc);
    for (let arc = 0; arc < arcCount; arc++) {
      const arcNodes = sorted.slice(arc * maxPerArc, (arc + 1) * maxPerArc);
      const radius = baseRadius + arc * ringSpacing;

      arcNodes.forEach((node, j) => {
        const angleOffset = arcNodes.length <= 1
          ? 0
          : (j / (arcNodes.length - 1) - 0.5) * 2 * halfSweep;
        result.push(placeNode(node, cx, cy, radius, q.centerAngle + angleOffset));
      });
    }
  }

  return { nodes: result, edges };
}

// ── Radial Mode: Force — edge-attracted force simulation with radial band constraints ──
// Produces an organic layout: connected nodes pull toward each other,
// nodes repel to avoid overlap, and a radial band constraint keeps category grouping.

function getRadialForce(nodes: Node[], edges: Edge[], spacing = 60, center = 150, density = 50): { nodes: Node[]; edges: Edge[] } {
  const groups = groupByCategory(nodes);
  const tools = groups.get("tool") ?? [];
  const toolRadius = tools.length <= 1 ? 0 : center;

  // Category → target radius band (density scales the gap)
  const gap = spacing * (1 + density / 50);
  const catRadii: Record<string, number> = {
    tool: toolRadius,
    plugin: toolRadius + gap,
    skill: toolRadius + gap,
    mcp: toolRadius + gap * 2,
  };

  const outerR = toolRadius + gap * 2 + 200;
  const cx = outerR + 200, cy = outerR + 200;

  // Initialize particles with positions spread by category ring + jittered angle
  type Particle = { node: Node; x: number; y: number; vx: number; vy: number; targetR: number; fixed: boolean };
  const allNodes = [...nodes];
  const idToIdx = new Map<string, number>();
  const particles: Particle[] = [];

  // Counters per ring for initial angular spread
  const ringCounts = new Map<number, number>();
  const ringIdx = new Map<number, number>();

  for (const node of allNodes) {
    const cat = getCategory(node);
    const tr = catRadii[cat] ?? toolRadius + 300;
    const rc = ringCounts.get(tr) ?? 0;
    ringCounts.set(tr, rc + 1);
  }
  for (const [r] of ringCounts) ringIdx.set(r, 0);

  for (const node of allNodes) {
    const cat = getCategory(node);
    const tr = catRadii[cat] ?? toolRadius + 300;
    const count = ringCounts.get(tr) ?? 1;
    const idx = ringIdx.get(tr) ?? 0;
    ringIdx.set(tr, idx + 1);
    const angle = (idx / count) * 2 * Math.PI - Math.PI / 2;
    idToIdx.set(node.id, particles.length);
    particles.push({
      node,
      x: cx + tr * Math.cos(angle),
      y: cy + tr * Math.sin(angle),
      vx: 0, vy: 0,
      targetR: tr,
      fixed: cat === "tool", // tools stay fixed on center ring
    });
  }

  // Run simulation: 80 iterations
  const iterations = 80;
  const alpha = 0.3; // global cooling factor

  for (let iter = 0; iter < iterations; iter++) {
    const t = 1 - iter / iterations; // temperature: 1→0

    // 1. Edge attraction — pull connected nodes toward each other
    for (const edge of edges) {
      const si = idToIdx.get(edge.source);
      const ti = idToIdx.get(edge.target);
      if (si === undefined || ti === undefined) continue;
      const a = particles[si], b = particles[ti];
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const idealDist = Math.abs(a.targetR - b.targetR) * 0.8 + 100;
      const force = (dist - idealDist) / dist * 0.02 * t;
      if (!a.fixed) { a.vx += dx * force; a.vy += dy * force; }
      if (!b.fixed) { b.vx -= dx * force; b.vy -= dy * force; }
    }

    // 2. Node-node repulsion
    for (let i = 0; i < particles.length; i++) {
      if (particles[i].fixed) continue;
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[j].x - particles[i].x;
        const dy = particles[j].y - particles[i].y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const minDist = 200;
        if (dist < minDist) {
          const force = (minDist - dist) / dist * 0.25 * t;
          if (!particles[i].fixed) { particles[i].vx -= dx * force; particles[i].vy -= dy * force; }
          if (!particles[j].fixed) { particles[j].vx += dx * force; particles[j].vy += dy * force; }
        }
      }
    }

    // 3. Apply velocity and radial band constraint
    for (const p of particles) {
      if (p.fixed) continue;
      p.x += p.vx * alpha;
      p.y += p.vy * alpha;
      p.vx *= 0.7; // damping
      p.vy *= 0.7;

      // Pull toward target ring (soft constraint)
      const dx = p.x - cx, dy = p.y - cy;
      const currentR = Math.sqrt(dx * dx + dy * dy) || 1;
      const angle = Math.atan2(dy, dx);
      const newR = currentR + (p.targetR - currentR) * 0.3;
      p.x = cx + newR * Math.cos(angle);
      p.y = cy + newR * Math.sin(angle);
    }
  }

  const result = particles.map((p) => {
    const nw = NODE_SIZES[p.node.type || ""]?.width ?? DEFAULT_SIZE.width;
    const nh = NODE_SIZES[p.node.type || ""]?.height ?? DEFAULT_SIZE.height;
    return {
      ...p.node,
      zIndex: 10,
      position: { x: p.x - nw / 2, y: p.y - nh / 2 },
      sourcePosition: Position.Bottom as Position,
      targetPosition: Position.Top as Position,
    };
  });

  return { nodes: result, edges };
}

// ── Radial dispatcher ──

function getRadialLayout(nodes: Node[], edges: Edge[], mode: RadialMode = "hybrid", spacing = 60, center = 150, density = 50): { nodes: Node[]; edges: Edge[] } {
  switch (mode) {
    case "sectors": return getRadialSectors(nodes, edges, spacing, center, density);
    case "force": return getRadialForce(nodes, edges, spacing, center, density);
    case "hybrid":
    default: return getRadialHybrid(nodes, edges, spacing, center, density);
  }
}

// ── Main layout dispatcher ──

async function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
  direction: Direction = DEFAULT_LAYOUT_DIRECTION,
  radialMode: RadialMode = DEFAULT_RADIAL_MODE,
  radialSpacing = 60,
  radialCenter = 150,
  radialDensity = 50,
): Promise<{ nodes: Node[]; edges: Edge[] }> {
  if (direction === "RADIAL") {
    return getRadialLayout(nodes, edges, radialMode, radialSpacing, radialCenter, radialDensity);
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
  type: "skill" | "mcp";
  name: string;
  enabled: boolean;
}

interface GraphProps {
  data?: DashboardGraphData;
  mode?: "dashboard" | "migrate";
  onNodeClick?: (node: Node) => void;
  onToggle?: (toggle: ToggleInfo) => void;
  onPluginToggle?: (name: string, enabled: boolean) => void;
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
  onPluginToggle,
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
  const [radialMode, setRadialModeState] = useState<RadialMode>(() => {
    try { return (localStorage.getItem(LOCALSTORAGE_KEYS.radialMode) as RadialMode) || DEFAULT_RADIAL_MODE; } catch { return DEFAULT_RADIAL_MODE; }
  });
  const [radialSpacing, setRadialSpacing] = useState(60);
  const [radialCenter, setRadialCenter] = useState(150);
  const [radialDensity, setRadialDensity] = useState(50); // 0=max tight, 100=no overlap

  const isDebugMode = useMemo(() => {
    try { return new URLSearchParams(window.location.search).has("debug"); } catch { return false; }
  }, []);

  const setLayoutDirection = useCallback((dir: Direction) => {
    setLayoutDirectionState(dir);
    try { localStorage.setItem(LOCALSTORAGE_KEYS.layout, dir); } catch {}
  }, []);

  const setEdgeType = useCallback((type: EdgeType) => {
    setEdgeTypeState(type);
    try { localStorage.setItem(LOCALSTORAGE_KEYS.edgeType, type); } catch {}
  }, []);

  const setRadialMode = useCallback((mode: RadialMode) => {
    setRadialModeState(mode);
    try { localStorage.setItem(LOCALSTORAGE_KEYS.radialMode, mode); } catch {}
  }, []);

  // Track disabled edges locally if not controlled
  const [localDisabledEdges, setLocalDisabledEdges] = useState<Set<string>>(
    new Set()
  );
  const effectiveDisabled = disabledEdges ?? localDisabledEdges;

  // Stabilize callback refs to prevent unnecessary re-renders and ELK re-layouts
  const onToggleRef = useRef(onToggle);
  onToggleRef.current = onToggle;
  const onPluginToggleRef = useRef(onPluginToggle);
  onPluginToggleRef.current = onPluginToggle;
  const onPluginClickRef = useRef(onPluginClick);
  onPluginClickRef.current = onPluginClick;
  const onAddToolRef = useRef(onAddTool);
  onAddToolRef.current = onAddTool;

  const handleToggle = useCallback(
    (type: "skill" | "mcp", name: string, enabled: boolean) => {
      onToggleRef.current?.({ type, name, enabled });
    },
    []
  );

  const stableHandlers = useMemo(
    () => ({
      handleToggle,
      onToggle: (toggle: ToggleInfo) => onToggleRef.current?.(toggle),
      onPluginToggle: (name: string, enabled: boolean) => onPluginToggleRef.current?.(name, enabled),
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

  // Apply layout when data or mode changes — only fitView on first render
  const hasInitialFit = useRef(false);
  const hasMeasuredLayout = useRef(false);
  useEffect(() => {
    if (initialNodes.length > 0) {
      hasMeasuredLayout.current = false; // reset on data change
      getLayoutedElements(initialNodes, initialEdges, layoutDirection, radialMode, radialSpacing, radialCenter, radialDensity).then(
        ({ nodes: layoutedNodes, edges: layoutedEdges }) => {
          setNodes(layoutedNodes);
          setEdges(layoutedEdges);
          if (!hasInitialFit.current) {
            hasInitialFit.current = true;
            setTimeout(() => fitViewRef.current?.(), 50);
          }
        }
      );
    }
  }, [initialNodes, initialEdges, layoutDirection, radialMode, radialSpacing, radialCenter, radialDensity, setNodes, setEdges]);

  // Second layout pass: re-layout using actual measured node dimensions for uniform spacing.
  // React Flow measures nodes after first render (node.measured.width/height).
  // This is the recommended pattern per React Flow docs for layout with real dimensions.
  const nodesInitialized = useNodesInitialized();
  useEffect(() => {
    if (nodesInitialized && nodes.length > 0 && !hasMeasuredLayout.current) {
      hasMeasuredLayout.current = true;
      getLayoutedElements(nodes, edges, layoutDirection, radialMode, radialSpacing, radialCenter, radialDensity).then(
        ({ nodes: layoutedNodes, edges: layoutedEdges }) => {
          setNodes(layoutedNodes);
          setEdges(layoutedEdges);
        }
      );
    }
    // Only re-run when nodesInitialized flips true — other deps are stable refs or unchanged
  }, [nodesInitialized]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-layout handler
  const onLayout = useCallback(
    (direction: Direction) => {
      setLayoutDirection(direction);
      getLayoutedElements(nodes, edges, direction, radialMode, radialSpacing, radialCenter, radialDensity).then(
        ({ nodes: layoutedNodes, edges: layoutedEdges }) => {
          setNodes(layoutedNodes);
          setEdges(layoutedEdges);
          setTimeout(() => fitViewRef.current?.(), 50);
        }
      );
    },
    [nodes, edges, radialMode, radialSpacing, radialCenter, radialDensity, setNodes, setEdges, setLayoutDirection]
  );

  // Radial mode switch handler
  const onRadialModeChange = useCallback(
    (mode: RadialMode) => {
      setRadialMode(mode);
      getLayoutedElements(nodes, edges, "RADIAL", mode, radialSpacing, radialCenter, radialDensity).then(
        ({ nodes: layoutedNodes, edges: layoutedEdges }) => {
          setNodes(layoutedNodes);
          setEdges(layoutedEdges);
          setTimeout(() => fitViewRef.current?.(), 50);
        }
      );
    },
    [nodes, edges, radialSpacing, radialCenter, radialDensity, setNodes, setEdges, setRadialMode]
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
          {layoutDirection === "RADIAL" && isDebugMode && (
            <>
              <span className="mx-1 text-muted-foreground/40">|</span>
              {(["hybrid", "sectors", "force"] as RadialMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => onRadialModeChange(m)}
                  className={cn(
                    "px-2 py-1.5 rounded text-[10px] font-medium transition-colors capitalize",
                    radialMode === m
                      ? "bg-emerald-600 text-white"
                      : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                  )}
                >
                  {m}
                </button>
              ))}
              <span className="mx-1 text-muted-foreground/40">|</span>
              <label className="flex items-center gap-1 text-[10px] text-muted-foreground" title="Density: 0=tight, 100=spacious">
                Density
                <input type="range" min={0} max={100} step={5} value={radialDensity}
                  onChange={(e) => setRadialDensity(Number(e.target.value))}
                  className="w-20 h-1 accent-orange-500" />
                <span className="w-6 text-right font-mono">{radialDensity}</span>
              </label>
              <label className="flex items-center gap-1 text-[10px] text-muted-foreground" title="Center ring size">
                Center
                <input type="range" min={0} max={500} step={5} value={radialCenter}
                  onChange={(e) => setRadialCenter(Number(e.target.value))}
                  className="w-20 h-1 accent-cyan-500" />
                <span className="w-6 text-right font-mono">{radialCenter}</span>
              </label>
              <label className="flex items-center gap-1 text-[10px] text-muted-foreground" title="Gap between rings">
                Gap
                <input type="range" min={0} max={500} step={5} value={radialSpacing}
                  onChange={(e) => setRadialSpacing(Number(e.target.value))}
                  className="w-20 h-1 accent-emerald-500" />
                <span className="w-6 text-right font-mono">{radialSpacing}</span>
              </label>
            </>
          )}
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
            return STATUS_COLORS.fallback;
          }}
        />
      </ReactFlow>
    </div>
  );
}
