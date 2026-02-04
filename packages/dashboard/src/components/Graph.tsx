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
  connectedTools?: string[];
}

interface McpData {
  name: string;
  status: Status;
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

interface GraphData {
  tools?: ToolData[];
  skills: SkillData[];
  mcps: McpData[];
  memory: MemoryData[];
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
        style.bg
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-muted !w-2 !h-2" />
      <div className="flex items-center gap-2">
        <StatusDot status={data.status} />
        <span className="text-sm font-medium truncate max-w-[100px]">{data.name}</span>
      </div>
      <div className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-wider">
        {data.type}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-muted !w-2 !h-2" />
    </div>
  );
}

// Node types registry
const nodeTypes = {
  tool: ToolNode,
  resource: ResourceNode,
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

interface GraphProps {
  data?: GraphData;
  onNodeClick?: (node: Node) => void;
  showUninstalledTools?: boolean;
}

export function Graph({ data, onNodeClick, showUninstalledTools = false }: GraphProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [layoutDirection, setLayoutDirection] = useState<"DOWN" | "RIGHT">("DOWN");

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

    // Skill nodes
    data?.skills.forEach((skill, index) => {
      const nodeId = `skill-${skill.name}`;
      nodes.push({
        id: nodeId,
        type: "resource",
        position: { x: index * 140, y: 150 },
        data: { name: skill.name, type: "skill", status: skill.status },
      });

      // Connect to specified tools or all installed tools
      const targetTools = skill.connectedTools || visibleTools.filter(t => t.installed).map((t) => t.id);
      targetTools.forEach((toolId) => {
        if (visibleTools.some(t => t.id === toolId)) {
          edges.push({
            id: `${nodeId}-to-${toolId}`,
            source: nodeId,
            target: `tool-${toolId}`,
            animated: skill.status === "synced",
            style: { stroke: "#3b82f6", strokeWidth: 2 },
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
        data: { name: mcp.name, type: "mcp", status: mcp.status },
      });

      // Connect to specified tools or all installed tools
      const targetTools = mcp.connectedTools || visibleTools.filter(t => t.installed).map((t) => t.id);
      targetTools.forEach((toolId) => {
        if (visibleTools.some(t => t.id === toolId)) {
          edges.push({
            id: `${nodeId}-to-${toolId}`,
            source: nodeId,
            target: `tool-${toolId}`,
            animated: mcp.status === "synced",
            style: { stroke: "#a855f7", strokeWidth: 2 },
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
        data: { name: mem.name, type: "memory", status: mem.status },
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
  }, [data, showUninstalledTools]);

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
