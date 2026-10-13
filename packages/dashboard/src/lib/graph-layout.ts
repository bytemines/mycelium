import { Position, type Node, type Edge } from "@xyflow/react";
import { NODE_SIZES, DEFAULT_SIZE, DEFAULT_LAYOUT_DIRECTION, DEFAULT_RADIAL_MODE } from "./graph-config";
import type { Direction, RadialMode } from "./graph-config";

type Category = "plugin" | "skill" | "tool" | "mcp" | "other";

function getCategory(node: Node): Category {
  if (node.type === "tool" || node.type === "addTool") return "tool";
  if (node.type === "plugin") return "plugin";
  const dataType = node.data?.type;
  if (dataType === "skill" || dataType === "agent" || dataType === "command" || dataType === "rule") return "skill";
  if (dataType === "mcp") return "mcp";
  return "other";
}

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

function getLayeredLayout(nodes: Node[], edges: Edge[], direction: "DOWN" | "RIGHT"): { nodes: Node[]; edges: Edge[] } {
  const isHorizontal = direction === "RIGHT";
  const groups = groupByCategory(nodes);
  const nodeSpacing = 30;
  const layerSpacing = 120;
  const result: Node[] = [];
  // Merge plugins + skills into one row, keep tools, mcps separate.
  const rows: Node[][] = [
    [...(groups.get("plugin") ?? []), ...(groups.get("skill") ?? [])],
    groups.get("tool") ?? [],
    groups.get("mcp") ?? [],
  ].filter((r) => r.length > 0);
  const getSize = (n: Node) => {
    const measured = n.measured;
    if (measured?.width && measured?.height) return { width: measured.width, height: measured.height };
    return NODE_SIZES[n.type || ""] || DEFAULT_SIZE;
  };
  const rowContentSizes = rows.map((row) =>
    row.reduce((sum, n) => {
      const size = getSize(n);
      return sum + (isHorizontal ? size.height : size.width);
    }, 0),
  );
  const rowSpreads = rows.map((row, ri) => rowContentSizes[ri] + (row.length - 1) * nodeSpacing);
  const maxSpread = Math.max(...rowSpreads);
  let layerOffset = 0;
  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx];
    const rowSpread = rowSpreads[rowIdx];
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
        zIndex: 10,
        position: isHorizontal ? { x: layerOffset, y: crossOffset } : { x: crossOffset, y: layerOffset },
        sourcePosition: isHorizontal ? Position.Right : Position.Bottom,
        targetPosition: isHorizontal ? Position.Left : Position.Top,
      });
      crossOffset += crossSize + nodeSpacing;
    }
    layerOffset += maxLayerThickness + layerSpacing;
  }
  return { nodes: result, edges };
}

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
    position: { x: cx + radius * Math.cos(angle) - nw / 2, y: cy + radius * Math.sin(angle) - nh / 2 },
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
  };
}

function computeAdaptiveRadii(rings: Node[][], prevRadius: number, ringGap = 40, nodeGap = 30, density = 50): number[] {
  const fitScale = density / 100;
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

// Hybrid: category rings sorted by primary tool connection.
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
  for (const tool of tools) result.push(placeNode(tool, cx, cy, toolRadius, toolAngles.get(tool.id)!));
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

// Sectors: fixed category quadrants, with tool-connected nodes clustered in arcs.
function getRadialSectors(nodes: Node[], edges: Edge[], spacing = 60, center = 150, density = 50): { nodes: Node[]; edges: Edge[] } {
  const groups = groupByCategory(nodes);
  const tools = groups.get("tool") ?? [];
  const toolAngles = buildToolAngles(tools);
  const nodeToTools = buildNodeToTools(edges, toolAngles);
  const toolRadius = tools.length <= 1 ? 0 : center;
  const quadrants: { cat: Category[]; centerAngle: number; label: string }[] = [
    { cat: ["plugin"], centerAngle: -Math.PI * 3 / 4, label: "Plugins (top-left)" },
    { cat: ["skill"], centerAngle: Math.PI * 3 / 4, label: "Skills (bottom-left)" },
    { cat: ["mcp"], centerAngle: Math.PI / 4, label: "MCPs (bottom-right)" },
  ];
  const quadrantSweep = Math.PI / 2;
  const halfSweep = quadrantSweep * 0.42;
  const quadrantNodes: Node[][] = [];
  for (const q of quadrants) {
    const qNodes: Node[] = [];
    for (const cat of q.cat) qNodes.push(...(groups.get(cat) ?? []));
    quadrantNodes.push(qNodes);
  }
  const maxPerArc = 6;
  const nodeGap = 40;
  const maxW = DEFAULT_SIZE.width;
  const maxNodesInQuadrant = Math.max(...quadrantNodes.map((q) => q.length), 1);
  const nodesOnFirstArc = Math.min(maxPerArc, maxNodesInQuadrant);
  const fitScale = density / 100;
  const minRadiusForFit = (nodesOnFirstArc * (maxW + nodeGap)) / quadrantSweep * fitScale;
  const baseRadius = Math.max(toolRadius + spacing, minRadiusForFit);
  const ringSpacing = spacing + 40;
  const maxArcs = Math.max(...quadrantNodes.map((q) => Math.ceil(q.length / maxPerArc)), 1);
  const outerR = baseRadius + maxArcs * ringSpacing + 100;
  const cx = outerR + 200, cy = outerR + 200;
  const result: Node[] = [];
  for (const tool of tools) {
    result.push(placeNode(tool, cx, cy, toolRadius, toolAngles.get(tool.id)!));
  }
  for (let qi = 0; qi < quadrants.length; qi++) {
    const q = quadrants[qi];
    const qNodes = quadrantNodes[qi];
    if (qNodes.length === 0) continue;
    const sorted = [...qNodes].sort(
      (a, b) => primaryToolAngle(a, nodeToTools, toolAngles) - primaryToolAngle(b, nodeToTools, toolAngles),
    );
    const arcCount = Math.ceil(sorted.length / maxPerArc);
    for (let arc = 0; arc < arcCount; arc++) {
      const arcNodes = sorted.slice(arc * maxPerArc, (arc + 1) * maxPerArc);
      const radius = baseRadius + arc * ringSpacing;
      arcNodes.forEach((node, j) => {
        const angleOffset = arcNodes.length <= 1 ? 0 : (j / (arcNodes.length - 1) - 0.5) * 2 * halfSweep;
        result.push(placeNode(node, cx, cy, radius, q.centerAngle + angleOffset));
      });
    }
  }
  return { nodes: result, edges };
}

// Force: edge attraction and repulsion constrained to category radius bands.
function getRadialForce(nodes: Node[], edges: Edge[], spacing = 60, center = 150, density = 50): { nodes: Node[]; edges: Edge[] } {
  const groups = groupByCategory(nodes);
  const tools = groups.get("tool") ?? [];
  const toolRadius = tools.length <= 1 ? 0 : center;
  const gap = spacing * (1 + density / 50);
  const catRadii: Record<string, number> = {
    tool: toolRadius,
    plugin: toolRadius + gap,
    skill: toolRadius + gap,
    mcp: toolRadius + gap * 2,
  };
  const outerR = toolRadius + gap * 2 + 200;
  const cx = outerR + 200, cy = outerR + 200;
  type Particle = { node: Node; x: number; y: number; vx: number; vy: number; targetR: number; fixed: boolean };
  const allNodes = [...nodes];
  const idToIdx = new Map<string, number>();
  const particles: Particle[] = [];
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
      fixed: cat === "tool",
    });
  }
  const iterations = 80;
  const alpha = 0.3;
  for (let iter = 0; iter < iterations; iter++) {
    const t = 1 - iter / iterations;
    // Edge attraction.
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
    // Node-node repulsion (unchanged quadratic simulation).
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
    // Apply velocity and radial band constraint.
    for (const p of particles) {
      if (p.fixed) continue;
      p.x += p.vx * alpha;
      p.y += p.vy * alpha;
      p.vx *= 0.7;
      p.vy *= 0.7;
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

export function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
  direction: Direction = DEFAULT_LAYOUT_DIRECTION,
  radialMode: RadialMode = DEFAULT_RADIAL_MODE,
  radialSpacing = 60,
  radialCenter = 150,
  radialDensity = 50,
): { nodes: Node[]; edges: Edge[] } {
  if (direction !== "RADIAL") return getLayeredLayout(nodes, edges, direction);
  switch (radialMode) {
    case "sectors": return getRadialSectors(nodes, edges, radialSpacing, radialCenter, radialDensity);
    case "force": return getRadialForce(nodes, edges, radialSpacing, radialCenter, radialDensity);
    case "hybrid":
    default: return getRadialHybrid(nodes, edges, radialSpacing, radialCenter, radialDensity);
  }
}
