/**
 * Mock graph data for debugging/testing layouts.
 *
 * Three approaches to mock data:
 * 1. **Preset datasets** (MOCK_SMALL/MEDIUM/LARGE/XL) — hand-crafted realistic scenarios
 * 2. **Scenario datasets** (MOCK_SINGLE_TOOL, MOCK_RADIAL_TEST, etc.) — targeted layout testing
 * 3. **Generator** (generateMockData) — dynamic creation with configurable counts + distributions
 *
 * URL activation: ?debug=small|medium|large|xl|single-tool|radial|heavy-mcp|empty
 * Custom: ?debug=custom&tools=3&mcps=10&memory=5&skills=4&plugins=3&disabledRatio=0.3
 */
import type { DashboardGraphData } from "./graph-builder";
import type { Status } from "@/types";

// ── Shared name pools (realistic, reusable) ──

const TOOL_POOL = [
  { id: "claude-code", name: "Claude Code" },
  { id: "codex", name: "Codex CLI" },
  { id: "gemini", name: "Gemini CLI" },
  { id: "opencode", name: "OpenCode" },
  { id: "openclaw", name: "OpenClaw" },
  { id: "aider", name: "Aider" },
] as const;

const PLUGIN_POOL = [
  { name: "sherpai", marketplace: "sherpai-marketplace", skills: ["navigate", "health", "debug", "live-bot", "cache-debug", "iterate", "walkforward"], extras: { agents: ["bot-agent", "monitor-agent"], hooks: ["pre-deploy", "post-test"], commands: ["run-backtest"] } },
  { name: "superpowers", marketplace: "superpowers-marketplace", skills: ["tdd", "debugging", "plans", "git-worktrees", "code-review", "parallel-agents", "brainstorming", "finishing-branch", "verification"] },
  { name: "sherpai-core", marketplace: "sherpai-marketplace", skills: ["skill-creator", "raycast", "prompt-builder"] },
  { name: "glm-plan-usage", marketplace: "zai-coding-plugins", skills: ["usage-query", "cost-tracker"] },
  { name: "docgen", marketplace: "community", skills: ["api-docs", "readme-gen", "changelog", "jsdoc-gen"] },
  { name: "test-runner", marketplace: "community", skills: ["vitest-run", "jest-run", "coverage", "e2e-run"] },
  { name: "infra-tools", marketplace: "internal", skills: ["docker-compose", "k8s-deploy", "terraform-plan"] },
  { name: "code-quality", marketplace: "community", skills: ["eslint-fix", "prettier-run", "sonar-scan", "dead-code"] },
  { name: "ai-helpers", marketplace: "community", skills: ["prompt-optimize", "context-compress", "token-count"] },
  { name: "data-tools", marketplace: "internal", skills: ["csv-parse", "json-transform", "sql-gen"] },
] as const;

const MCP_POOL = [
  "context7", "playwright", "supabase", "github-mcp", "linear",
  "slack-mcp", "notion-mcp", "redis-mcp", "postgres-mcp", "sentry-mcp",
  "stripe-mcp", "vercel-mcp", "cloudflare-mcp", "openai-mcp", "pinecone-mcp",
  "grafana-mcp", "whark-trading", "massive",
] as const;

const SKILL_POOL = [
  "custom-deploy", "lint-fix", "db-migrate", "api-scaffold", "perf-profile",
  "env-sync", "secret-rotate", "changelog-gen", "pr-template", "benchmark",
] as const;

const MEMORY_POOL = [
  { name: "Argusito", scope: "shared" as const },
  { name: "mycelium", scope: "shared" as const },
  { name: "vnido", scope: "shared" as const },
  { name: "bytemines-io", scope: "shared" as const },
  { name: "trading-bot", scope: "shared" as const },
  { name: "personal-notes", scope: "personal" as const },
  { name: "coding-standards", scope: "coding" as const },
  { name: "architecture-decisions", scope: "shared" as const },
  { name: "api-patterns", scope: "coding" as const },
  { name: "team-conventions", scope: "shared" as const },
  { name: "incident-log", scope: "shared" as const },
  { name: "performance-baselines", scope: "coding" as const },
  { name: "security-policies", scope: "shared" as const },
  { name: "onboarding-guide", scope: "shared" as const },
] as const;

// ── Builders (type-safe, composable) ──

function mkTool(id: string, name: string, installed = true) {
  return { id, name, status: "synced" as Status, installed };
}

function mkMcp(name: string, enabled = true, connectedTools?: string[]) {
  return { name, status: (enabled ? "synced" : "disabled") as Status, enabled, connectedTools };
}

function mkMemory(name: string, scope: "shared" | "coding" | "personal" = "shared") {
  return { name, scope, status: "synced" as Status };
}

function mkSkill(name: string, enabled = true, connectedTools?: string[]) {
  return { name, status: "synced" as Status, enabled, connectedTools };
}

function mkPlugin(
  name: string, marketplace: string, skills: string[],
  extras?: { agents?: string[]; commands?: string[]; hooks?: string[]; libs?: string[] },
) {
  return {
    name, marketplace, componentCount: skills.length, enabled: true, skills,
    agents: extras?.agents, commands: extras?.commands, hooks: extras?.hooks, libs: extras?.libs,
  };
}

// ── Approach 1: Preset datasets (hand-crafted, realistic) ──

export const MOCK_SMALL: DashboardGraphData = {
  tools: [mkTool("claude-code", "Claude Code"), mkTool("codex", "Codex CLI")],
  plugins: [
    mkPlugin("sherpai", "sherpai-marketplace", ["navigate", "health", "debug"], { agents: ["bot-agent"], hooks: ["pre-deploy"] }),
    mkPlugin("superpowers", "superpowers-marketplace", ["tdd", "debugging", "plans", "git-worktrees"]),
  ],
  skills: [],
  mcps: [mkMcp("context7"), mkMcp("playwright"), mkMcp("whark-trading", false)],
  memory: [mkMemory("Argusito"), mkMemory("mycelium"), mkMemory("vnido")],
};

export const MOCK_MEDIUM: DashboardGraphData = {
  tools: TOOL_POOL.slice(0, 4).map((t) => mkTool(t.id, t.name)),
  plugins: PLUGIN_POOL.slice(0, 4).map((p) =>
    mkPlugin(p.name, p.marketplace, [...p.skills], "extras" in p ? (p as any).extras : undefined),
  ),
  skills: [mkSkill("custom-deploy", true, ["claude-code"]), mkSkill("lint-fix", true, ["claude-code", "codex"])],
  mcps: [
    mkMcp("context7"), mkMcp("playwright"), mkMcp("whark-trading", false),
    mkMcp("massive", false), mkMcp("supabase"), mkMcp("github-mcp"), mkMcp("linear"),
  ],
  memory: [
    mkMemory("Argusito"), mkMemory("mycelium"), mkMemory("vnido"),
    mkMemory("bytemines-io"), mkMemory("personal-notes", "personal"), mkMemory("coding-standards", "coding"),
  ],
};

export const MOCK_LARGE: DashboardGraphData = {
  tools: TOOL_POOL.map((t) => mkTool(t.id, t.name)),
  plugins: PLUGIN_POOL.slice(0, 7).map((p) =>
    mkPlugin(p.name, p.marketplace, [...p.skills], "extras" in p ? (p as any).extras : undefined),
  ),
  skills: [
    mkSkill("custom-deploy", true, ["claude-code"]),
    mkSkill("lint-fix", true, ["claude-code", "codex"]),
    mkSkill("db-migrate", true, ["claude-code", "opencode"]),
    mkSkill("api-scaffold", true, ["claude-code", "gemini"]),
    mkSkill("perf-profile", true, ["claude-code"]),
  ],
  mcps: MCP_POOL.slice(0, 12).map((name, i) => mkMcp(name, i !== 2 && i !== 3 && i !== 11)),
  memory: MEMORY_POOL.slice(0, 10).map((m) => mkMemory(m.name, m.scope)),
};

export const MOCK_XL: DashboardGraphData = {
  tools: TOOL_POOL.map((t) => mkTool(t.id, t.name)),
  plugins: PLUGIN_POOL.map((p) =>
    mkPlugin(p.name, p.marketplace, [...p.skills], "extras" in p ? (p as any).extras : undefined),
  ),
  skills: SKILL_POOL.map((name, i) => {
    const toolIds = TOOL_POOL.map((t) => t.id);
    const connected = toolIds.slice(0, Math.max(1, (i % toolIds.length) + 1));
    return mkSkill(name, true, connected);
  }),
  mcps: MCP_POOL.map((name, i) => mkMcp(name, i % 5 !== 0)),
  memory: MEMORY_POOL.map((m) => mkMemory(m.name, m.scope)),
};

// ── Approach 2: Scenario datasets (targeted layout/edge-case testing) ──

/** Single tool — tests degenerate radial (1 sector), tests no-sector-spread */
export const MOCK_SINGLE_TOOL: DashboardGraphData = {
  tools: [mkTool("claude-code", "Claude Code")],
  plugins: [mkPlugin("superpowers", "superpowers-marketplace", ["tdd", "debugging"])],
  skills: [mkSkill("lint-fix", true, ["claude-code"])],
  mcps: [mkMcp("context7", true, ["claude-code"]), mkMcp("playwright", true, ["claude-code"])],
  memory: [mkMemory("project-a")],
};

/** Radial sector test — explicit per-tool connectivity to validate sector grouping */
export const MOCK_RADIAL_TEST: DashboardGraphData = {
  tools: [mkTool("claude-code", "Claude Code"), mkTool("codex", "Codex CLI"), mkTool("gemini", "Gemini CLI")],
  plugins: [
    mkPlugin("superpowers", "superpowers-marketplace", ["tdd", "debugging"]),
  ],
  skills: [
    mkSkill("claude-only-skill", true, ["claude-code"]),
    mkSkill("codex-only-skill", true, ["codex"]),
    mkSkill("gemini-only-skill", true, ["gemini"]),
    mkSkill("shared-skill", true, ["claude-code", "codex", "gemini"]),
  ],
  mcps: [
    mkMcp("claude-mcp", true, ["claude-code"]),
    mkMcp("codex-mcp", true, ["codex"]),
    mkMcp("shared-mcp", true, ["claude-code", "codex"]),
    mkMcp("all-mcp", true, ["claude-code", "codex", "gemini"]),
  ],
  memory: [
    mkMemory("shared-mem"),
    mkMemory("coding-mem", "coding"),
    mkMemory("personal-mem", "personal"),
  ],
};

/** Heavy MCP — many MCPs, few of everything else; tests bottom-layer crowding */
export const MOCK_HEAVY_MCP: DashboardGraphData = {
  tools: [mkTool("claude-code", "Claude Code"), mkTool("codex", "Codex CLI")],
  plugins: [],
  skills: [],
  mcps: MCP_POOL.map((name, i) => mkMcp(name, i % 3 !== 0, i % 2 === 0 ? ["claude-code"] : ["codex"])),
  memory: [mkMemory("project-a")],
};

/** Empty state — no resources at all, only tools */
export const MOCK_EMPTY: DashboardGraphData = {
  tools: [mkTool("claude-code", "Claude Code"), mkTool("codex", "Codex CLI")],
  plugins: [],
  skills: [],
  mcps: [],
  memory: [],
};

// ── Approach 3: Dynamic generator (configurable counts + distributions) ──

export interface MockDataConfig {
  tools?: number;
  mcps?: number;
  memory?: number;
  skills?: number;
  plugins?: number;
  /** Ratio of disabled MCPs (0-1, default 0.2) */
  disabledRatio?: number;
  /** Seeded random for deterministic output (default: Date.now()) */
  seed?: number;
}

/** Simple seeded PRNG for deterministic mock generation */
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

/** Generate mock data with specified counts and configurable distributions */
export function generateMockData(config: MockDataConfig): DashboardGraphData {
  const rand = seededRandom(config.seed ?? Date.now());
  const numTools = Math.min(config.tools ?? 2, TOOL_POOL.length);
  const numMcps = config.mcps ?? 3;
  const numMemory = config.memory ?? 2;
  const numSkills = config.skills ?? 0;
  const numPlugins = config.plugins ?? 2;
  const disabledRatio = config.disabledRatio ?? 0.2;

  const toolIds = TOOL_POOL.slice(0, numTools).map((t) => t.id);

  // Distribute connectivity: each item connects to 1..numTools tools using round-robin + random spread
  const pickTools = (index: number): string[] => {
    const primary = toolIds[index % numTools];
    const count = Math.max(1, Math.floor(rand() * numTools) + 1);
    const result = [primary];
    for (let i = 1; i < count && i < numTools; i++) {
      const next = toolIds[(index + i) % numTools];
      if (!result.includes(next)) result.push(next);
    }
    return result;
  };

  return {
    tools: TOOL_POOL.slice(0, numTools).map((t) => mkTool(t.id, t.name)),
    plugins: Array.from({ length: numPlugins }, (_, i) => {
      const src = PLUGIN_POOL[i % PLUGIN_POOL.length];
      const name = i < PLUGIN_POOL.length ? src.name : `${src.name}-${i}`;
      const skillSlice = src.skills.slice(0, Math.max(1, Math.floor(rand() * src.skills.length) + 1));
      return mkPlugin(name, src.marketplace, [...skillSlice], "extras" in src ? (src as any).extras : undefined);
    }),
    skills: Array.from({ length: numSkills }, (_, i) => {
      const name = i < SKILL_POOL.length ? SKILL_POOL[i] : `${SKILL_POOL[i % SKILL_POOL.length]}-${i}`;
      return mkSkill(name, rand() > disabledRatio, pickTools(i));
    }),
    mcps: Array.from({ length: numMcps }, (_, i) => {
      const name = i < MCP_POOL.length ? MCP_POOL[i] : `${MCP_POOL[i % MCP_POOL.length]}-${i}`;
      return mkMcp(name, rand() > disabledRatio, pickTools(i));
    }),
    memory: Array.from({ length: numMemory }, (_, i) => {
      const src = MEMORY_POOL[i % MEMORY_POOL.length];
      const name = i < MEMORY_POOL.length ? src.name : `${src.name}-${i}`;
      return mkMemory(name, src.scope);
    }),
  };
}

// ── Dataset registry ──

const PRESET_MAP: Record<string, DashboardGraphData> = {
  small: MOCK_SMALL,
  medium: MOCK_MEDIUM,
  large: MOCK_LARGE,
  xl: MOCK_XL,
  "single-tool": MOCK_SINGLE_TOOL,
  radial: MOCK_RADIAL_TEST,
  "heavy-mcp": MOCK_HEAVY_MCP,
  empty: MOCK_EMPTY,
};

/** Get mock data by preset name */
export function getMockData(size: string): DashboardGraphData | null {
  return PRESET_MAP[size] ?? null;
}

/** Check URL for ?debug= parameter and return appropriate mock data */
export function getDebugMockData(): DashboardGraphData | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const debug = params.get("debug");
  if (!debug) return null;

  if (debug === "custom") {
    return generateMockData({
      tools: parseInt(params.get("tools") ?? "2", 10),
      mcps: parseInt(params.get("mcps") ?? "3", 10),
      memory: parseInt(params.get("memory") ?? "2", 10),
      skills: parseInt(params.get("skills") ?? "0", 10),
      plugins: parseInt(params.get("plugins") ?? "2", 10),
      disabledRatio: parseFloat(params.get("disabledRatio") ?? "0.2"),
      seed: params.has("seed") ? parseInt(params.get("seed")!, 10) : undefined,
    });
  }

  return getMockData(debug);
}
