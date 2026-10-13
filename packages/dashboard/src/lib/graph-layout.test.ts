import { describe, expect, it } from "vitest";
import { Position, type Node, type Edge } from "@xyflow/react";
import { getLayoutedElements } from "./graph-layout";
import { DEFAULT_RADIAL_MODE, NODE_SIZES } from "./graph-config";
import type { Direction, RadialMode } from "./graph-config";

const nodes: Node[] = [
  { id: "mcp", type: "resource", data: { type: "mcp" }, position: { x: 1, y: 2 } },
  { id: "tool-a", type: "tool", data: {}, position: { x: 3, y: 4 } },
  { id: "skill", type: "resource", data: { type: "skill" }, position: { x: 5, y: 6 } },
  { id: "plugin", type: "plugin", data: {}, position: { x: 7, y: 8 } },
  { id: "tool-b", type: "addTool", data: {}, position: { x: 9, y: 10 } },
  ...["agent", "command", "rule"].map(type => ({
    id: type, type: "resource", data: { type }, position: { x: 0, y: 0 },
  })),
];
const edges: Edge[] = [
  { id: "skill-tool", source: "skill", target: "tool-a" },
  { id: "tool-mcp", source: "tool-a", target: "mcp" },
  { id: "plugin-tool", source: "plugin", target: "tool-b" },
];
const modes: [Direction, RadialMode][] = [
  ["DOWN", "hybrid"], ["RIGHT", "hybrid"],
  ["RADIAL", "hybrid"], ["RADIAL", "sectors"], ["RADIAL", "force"],
];

describe("graph layout", () => {
  it.each(modes)("%s/%s is deterministic, preserves IDs/links, and does not mutate inputs", (direction, mode) => {
    const inputNodes = structuredClone(nodes);
    const inputEdges = structuredClone(edges);
    const result = getLayoutedElements(inputNodes, inputEdges, direction, mode);
    expect(result).toEqual(getLayoutedElements(inputNodes, inputEdges, direction, mode));
    expect(inputNodes).toEqual(nodes);
    expect(inputEdges).toEqual(edges);
    expect(result.nodes.map(node => node.id).sort()).toEqual(nodes.map(node => node.id).sort());
    expect(result.edges).toBe(inputEdges);
    for (const node of result.nodes) {
      expect(Number.isFinite(node.position.x)).toBe(true);
      expect(Number.isFinite(node.position.y)).toBe(true);
      expect(node.data).toBe(inputNodes.find(input => input.id === node.id)!.data);
    }
  });

  it.each(["DOWN", "RIGHT"] as const)("%s keeps resource/plugin, tool, and MCP layers with measured spacing", direction => {
    const measuredNodes = nodes.map(node => ({ ...node, measured: { width: 300, height: 100 } }));
    const result = getLayoutedElements(measuredNodes, edges, direction);
    const byId = new Map(result.nodes.map(node => [node.id, node]));
    const layerAxis = direction === "DOWN" ? "y" : "x";
    const crossAxis = direction === "DOWN" ? "x" : "y";
    expect(byId.get("plugin")!.position[layerAxis]).toBe(0);
    expect(byId.get("skill")!.position[layerAxis]).toBe(0);
    expect(byId.get("tool-a")!.position[layerAxis]).toBe(direction === "DOWN" ? 220 : 420);
    expect(byId.get("mcp")!.position[layerAxis]).toBe(direction === "DOWN" ? 440 : 840);
    expect(byId.get("skill")!.position[crossAxis] - byId.get("plugin")!.position[crossAxis]).toBe(direction === "DOWN" ? 330 : 130);
    expect(byId.get("skill")!.sourcePosition).toBe(direction === "DOWN" ? Position.Bottom : Position.Right);
    expect(byId.get("skill")!.targetPosition).toBe(direction === "DOWN" ? Position.Top : Position.Left);
  });

  it.each(["hybrid", "sectors", "force"] as const)("%s responds to spacing, center, and density with unchanged IDs", mode => {
    const before = getLayoutedElements(nodes, edges, "RADIAL", mode, 60, 150, 50).nodes;
    for (const settings of [[200, 150, 50], [60, 300, 50], [60, 150, 100]]) {
      const after = getLayoutedElements(nodes, edges, "RADIAL", mode, ...settings as [number, number, number]).nodes;
      expect(after.map(node => node.id)).toEqual(before.map(node => node.id));
      expect(after.map(node => node.position)).not.toEqual(before.map(node => node.position));
    }
  });

  it("keeps default direction and radial mode unchanged", () => {
    expect(getLayoutedElements(nodes, edges)).toEqual(getLayoutedElements(nodes, edges, "DOWN"));
    expect(getLayoutedElements(nodes, edges, "RADIAL")).toEqual(getLayoutedElements(nodes, edges, "RADIAL", DEFAULT_RADIAL_MODE, 60, 150, 50));
  });

  it.each(modes)("%s/%s handles empty input", (direction, mode) => {
    expect(getLayoutedElements([], [], direction, mode)).toEqual({ nodes: [], edges: [] });
  });

  it.each(["hybrid", "sectors", "force"] as const)("%s centers a single tool independently of center-ring size", mode => {
    const tool = nodes.filter(node => node.id === "tool-a");
    const result = getLayoutedElements(tool, [], "RADIAL", mode, 60, 0, 50);
    expect(result).toEqual(getLayoutedElements(tool, [], "RADIAL", mode, 60, 500, 50));
    expect(result.nodes[0].position.x + NODE_SIZES.tool.width / 2)
      .toBe(result.nodes[0].position.y + NODE_SIZES.tool.height / 2);
  });
});
