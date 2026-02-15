/**
 * Graph configuration — single source of truth for all graph constants.
 * All magic numbers, colors, sizes, and layout parameters live here.
 */

// ── Node Sizes ──

export const NODE_SIZES: Record<string, { width: number; height: number }> = {
  tool: { width: 160, height: 60 },
  addTool: { width: 160, height: 60 },
  resource: { width: 170, height: 58 },
  plugin: { width: 180, height: 68 },
};

export const DEFAULT_SIZE = { width: 160, height: 55 };

// ── Colors ──

export const EDGE_COLORS = {
  skill: "#3b82f6",
  mcp: "#a855f7",
  plugin: "#14b8a6",
  agent: "#f59e0b",
  command: "#06b6d4",
  rule: "#8b5cf6",
  custom: "#6b7280",
  disabled: "#ef4444",
} as const;

export const STATUS_COLORS = {
  synced: "#22c55e",
  pending: "#eab308",
  error: "#ef4444",
  not_installed: "#374151",
  fallback: "#6b7280",
} as const;

// ── Edge Styling ──

export const EDGE_STYLE = {
  strokeWidth: 1.5,
  disabledDashArray: "5,5",
  disabledOpacity: 0.4,
} as const;

export const DISABLED_EDGE_STYLE = {
  strokeDasharray: "6,4",
  opacity: 0.55,
  fontSize: 13,
  labelBgOpacity: 0.9,
  labelBgRadius: 8,
  labelPadding: [5, 5] as [number, number],
} as const;

// ── Initial (pre-layout) Positions ──

export const INITIAL_LAYOUT = {
  horizontalSpacing: 180,
  addToolSpacing: 160,
  layers: { top: 0, middle: 200, bottom: 400 },
} as const;

// ── Background Grid ──

export const BACKGROUND_GRID = {
  color: "#333",
  gap: 20,
} as const;

// ── Defaults ──

export const DEFAULT_EDGE_TYPE = "smoothstep" as const;
export const DEFAULT_LAYOUT_DIRECTION = "DOWN" as const;

// ── Persistence ──

export const LOCALSTORAGE_KEYS = {
  layout: "mycelium:graph:layout",
  edgeType: "mycelium:graph:edgeType",
  radialMode: "mycelium:graph:radialMode",
} as const;

// ── Types ──

export type Direction = "DOWN" | "RIGHT" | "RADIAL";
export type RadialMode = "hybrid" | "sectors" | "force";
export type EdgeType = "smoothstep" | "default" | "straight" | "step";

export const DEFAULT_RADIAL_MODE = "sectors" as const;
