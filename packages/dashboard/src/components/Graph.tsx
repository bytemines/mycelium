/** Interactive React Flow visualization with layered/radial layouts. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow, Background, Controls, Node, Edge,
  useNodesState, useEdgesState, useNodesInitialized, Panel,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { cn } from "@/lib/utils";
import { ToolNode, ResourceNode, PluginNode, AddToolNode } from "./nodes";
import type { ResourceNodeData, PluginNodeData } from "./nodes";
import { buildDashboardGraph } from "@/lib/graph-builder";
import type { DashboardGraphData } from "@/lib/graph-builder";
import { getLayoutedElements } from "@/lib/graph-layout";
import {
  BACKGROUND_GRID, LOCALSTORAGE_KEYS, DEFAULT_EDGE_TYPE,
  DEFAULT_LAYOUT_DIRECTION, DEFAULT_RADIAL_MODE,
} from "@/lib/graph-config";
import type { Direction, EdgeType, RadialMode } from "@/lib/graph-config";

// Re-export node components for backwards compatibility
export { ToolNode, ResourceNode, PluginNode, AddToolNode };

const nodeTypes = {
  tool: ToolNode,
  resource: ResourceNode,
  plugin: PluginNode,
  addTool: AddToolNode,
};

interface ToggleInfo {
  type: "skill" | "mcp" | "agent" | "command" | "rule";
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

  // Stabilize callback refs to prevent unnecessary graph rebuilds.
  const onToggleRef = useRef(onToggle);
  onToggleRef.current = onToggle;
  const onPluginToggleRef = useRef(onPluginToggle);
  onPluginToggleRef.current = onPluginToggle;
  const onPluginClickRef = useRef(onPluginClick);
  onPluginClickRef.current = onPluginClick;
  const onAddToolRef = useRef(onAddTool);
  onAddToolRef.current = onAddTool;

  const handleToggle = useCallback(
    (type: "skill" | "mcp" | "agent" | "command" | "rule", name: string, enabled: boolean) => {
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

  const { initialNodes, initialEdges } = useMemo(
    () => buildDashboardGraph(data, mode, showUninstalledTools, stableHandlers),
    [data, mode, showUninstalledTools, stableHandlers]
  );

  const styledEdges = useMemo(() => {
    return edges.map((edge) => ({ ...edge, type: edgeType }));
  }, [edges, edgeType]);

  const prevNodeIdsRef = useRef<string>("");
  const prevLayoutSettingsRef = useRef<string>("");
  const hasInitialFit = useRef(false);
  const hasMeasuredLayout = useRef(false);
  useEffect(() => {
    if (initialNodes.length > 0) {
      const newNodeIds = JSON.stringify(initialNodes.map(n => n.id).sort());
      const layoutSettings = JSON.stringify([layoutDirection, radialMode, radialSpacing, radialCenter, radialDensity]);
      const isStructuralChange = newNodeIds !== prevNodeIdsRef.current;
      const isLayoutChange = layoutSettings !== prevLayoutSettingsRef.current;
      prevNodeIdsRef.current = newNodeIds;
      prevLayoutSettingsRef.current = layoutSettings;

      if (isStructuralChange) hasMeasuredLayout.current = false;

      setNodes((currentNodes) => {
        // Preserve measured sizes and dragged positions on data-only updates.
        const updatedNodes = isStructuralChange ? initialNodes : currentNodes.map((existing) => {
          const updated = initialNodes.find(n => n.id === existing.id);
          if (!updated || JSON.stringify(existing.data) === JSON.stringify(updated.data)) return existing;
          return { ...existing, data: updated.data };
        });
        if (!isStructuralChange && !isLayoutChange) return updatedNodes;
        return getLayoutedElements(updatedNodes, initialEdges, layoutDirection, radialMode, radialSpacing, radialCenter, radialDensity).nodes;
      });
      setEdges(initialEdges);
      if (!hasInitialFit.current) {
        hasInitialFit.current = true;
        setTimeout(() => fitViewRef.current?.(), 50);
      }
    }
  }, [initialNodes, initialEdges, layoutDirection, radialMode, radialSpacing, radialCenter, radialDensity, setNodes, setEdges]);

  // Second pass uses React Flow's measured dimensions after structural changes.
  const nodesInitialized = useNodesInitialized();
  useEffect(() => {
    if (nodesInitialized && nodes.length > 0 && !hasMeasuredLayout.current
      && JSON.stringify(nodes.map(n => n.id).sort()) === prevNodeIdsRef.current) {
      hasMeasuredLayout.current = true;
      const layout = getLayoutedElements(nodes, edges, layoutDirection, radialMode, radialSpacing, radialCenter, radialDensity);
      setNodes(layout.nodes);
    }
  }, [nodesInitialized, nodes, edges, layoutDirection, radialMode, radialSpacing, radialCenter, radialDensity, setNodes]);

  // Explicit buttons also allow resetting a dragged layout without changing settings.
  const onLayout = useCallback(
    (direction: Direction) => {
      setLayoutDirection(direction);
      const layout = getLayoutedElements(nodes, edges, direction, radialMode, radialSpacing, radialCenter, radialDensity);
      setNodes(layout.nodes);
      setTimeout(() => fitViewRef.current?.(), 50);
    },
    [nodes, edges, radialMode, radialSpacing, radialCenter, radialDensity, setNodes, setLayoutDirection]
  );

  const onRadialModeChange = useCallback(
    (mode: RadialMode) => {
      setRadialMode(mode);
      const layout = getLayoutedElements(nodes, edges, "RADIAL", mode, radialSpacing, radialCenter, radialDensity);
      setNodes(layout.nodes);
      setTimeout(() => fitViewRef.current?.(), 50);
    },
    [nodes, edges, radialSpacing, radialCenter, radialDensity, setNodes, setRadialMode]
  );

  const onNodeDragStop = useCallback(() => {}, []);

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      onNodeClick?.(node);
      if (node.type === "plugin") {
        onPluginClickRef.current?.((node.data as unknown as PluginNodeData).name);
      } else if (node.type === "resource") {
        const rd = node.data as unknown as ResourceNodeData;
        if (rd.type === "mcp") onMcpClick?.(rd.name);
        else if (rd.type === "skill" || rd.type === "agent" || rd.type === "command" || rd.type === "rule") onSkillClick?.(rd.name);
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
        edgesFocusable={false}
        proOptions={{ hideAttribution: true }}
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
          {(["default", "smoothstep", "straight", "step"] as EdgeType[]).map((t) => (
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
      </ReactFlow>
    </div>
  );
}
