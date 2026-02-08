# Tier 1 + Tier 2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement all Tier 1 (foundation + viral hook) and Tier 2 (moat) features for Mycelium's Hybrid Strategy (Smart Memory + Visual Dashboard).

**Architecture:** Dashboard gets interactive toggle switches on graph nodes (enable/disable per tool). CLI gets smart memory compression, SKILL.md parsing, MCP registry integration, preset profiles, watch mode, and conflict detection. A shared API layer (`@mycelium/core`) connects CLI and dashboard data.

**Tech Stack:** TypeScript, React Flow, Vite, Commander.js, Zod, Vitest, pnpm monorepo with Turborepo.

---

## Tier 1 Features

### Task 1: Dashboard Toggle Switches (Feature 1.1)

**Files:**
- Modify: `packages/dashboard/src/components/Graph.tsx`
- Modify: `packages/dashboard/src/components/Dashboard.tsx`
- Modify: `packages/core/src/types.ts`
- Create: `packages/dashboard/src/lib/api.ts`
- Test: `packages/dashboard/src/components/Graph.test.tsx`

**Step 1: Add toggle types to core**

Add to `packages/core/src/types.ts` after the `SyncResult` interface (~line 176):

```typescript
// Toggle action types for dashboard <-> CLI communication
export interface ToggleAction {
  type: "skill" | "mcp" | "memory";
  name: string;
  toolId: ToolId;
  enabled: boolean;
}

export interface DashboardState {
  tools: Array<{
    id: ToolId;
    name: string;
    status: SyncStatus;
    installed: boolean;
  }>;
  skills: Array<{
    name: string;
    status: SyncStatus;
    enabled: boolean;
    connectedTools: ToolId[];
  }>;
  mcps: Array<{
    name: string;
    status: SyncStatus;
    enabled: boolean;
    connectedTools: ToolId[];
  }>;
  memory: Array<{
    name: string;
    scope: MemoryScope;
    status: SyncStatus;
  }>;
}
```

**Step 2: Write failing test for toggle functionality**

Add to `packages/dashboard/src/components/Graph.test.tsx`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import { Graph } from "./Graph";

describe("Graph toggle switches", () => {
  const mockData = {
    tools: [
      { id: "claude-code", name: "Claude Code", status: "synced" as const, installed: true },
    ],
    skills: [
      { name: "tdd", status: "synced" as const, enabled: true, connectedTools: ["claude-code"] },
    ],
    mcps: [
      { name: "git-mcp", status: "synced" as const, enabled: true, connectedTools: ["claude-code"] },
    ],
    memory: [
      { name: "MEMORY.md", scope: "shared" as const, status: "synced" as const },
    ],
  };

  it("renders toggle switch on resource nodes", () => {
    render(
      <ReactFlowProvider>
        <Graph data={mockData} onToggle={vi.fn()} />
      </ReactFlowProvider>
    );
    // Resource nodes should have toggle switches
    const toggles = screen.getAllByRole("switch");
    expect(toggles.length).toBeGreaterThan(0);
  });

  it("calls onToggle when switch is clicked", async () => {
    const onToggle = vi.fn();
    render(
      <ReactFlowProvider>
        <Graph data={mockData} onToggle={onToggle} />
      </ReactFlowProvider>
    );
    const toggles = screen.getAllByRole("switch");
    fireEvent.click(toggles[0]);
    expect(onToggle).toHaveBeenCalledWith(
      expect.objectContaining({ type: "skill", name: "tdd" })
    );
  });
});
```

**Step 3: Run test to verify it fails**

Run: `cd packages/dashboard && pnpm test -- --run Graph.test`
Expected: FAIL (onToggle prop doesn't exist)

**Step 4: Implement toggle switches in Graph.tsx**

In `packages/dashboard/src/components/Graph.tsx`:

1. Add `onToggle` prop to `GraphProps` interface
2. Add `enabled` field to `ResourceNodeData`
3. Add toggle switch (HTML `<button role="switch">`) to `ResourceNode` component
4. Wire up click handler to call `onToggle` with a `ToggleAction`
5. Update edge opacity/animation based on enabled state (disabled = dashed, no animation)

**Step 5: Run test to verify it passes**

Run: `cd packages/dashboard && pnpm test -- --run Graph.test`
Expected: PASS

**Step 6: Create API layer for dashboard-CLI communication**

Create `packages/dashboard/src/lib/api.ts`:

```typescript
import type { ToggleAction, DashboardState } from "@mycelium/core";

const API_BASE = "http://localhost:3378";

export async function fetchDashboardState(): Promise<DashboardState> {
  const res = await fetch(`${API_BASE}/api/state`);
  return res.json();
}

export async function sendToggle(action: ToggleAction): Promise<void> {
  await fetch(`${API_BASE}/api/toggle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(action),
  });
}
```

**Step 7: Update Dashboard.tsx to use real toggle state**

Replace mock data in `Dashboard.tsx` with state management that tracks enabled/disabled and calls the API layer. Use `useState` for local toggle state and optimistic updates.

**Step 8: Commit**

```bash
git add packages/core/src/types.ts packages/dashboard/src/components/Graph.tsx packages/dashboard/src/components/Dashboard.tsx packages/dashboard/src/lib/api.ts packages/dashboard/src/components/Graph.test.tsx
git commit -m "feat(dashboard): add toggle switches to graph nodes for enable/disable per tool"
```

---

### Task 2: Smart Memory Sync (Feature 1.2)

**Files:**
- Create: `packages/cli/src/core/smart-memory.ts`
- Modify: `packages/cli/src/core/memory-scoper.ts`
- Modify: `packages/core/src/types.ts`
- Test: `packages/cli/src/core/smart-memory.test.ts`

**Step 1: Write failing test for memory compression**

Create `packages/cli/src/core/smart-memory.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { compressMemory, mergeMemoryFiles, extractKeyInsights } from "./smart-memory.js";

describe("smart-memory", () => {
  it("compresses long memory content to under max lines", () => {
    const longContent = Array.from({ length: 500 }, (_, i) => `Line ${i}: Some verbose session context`).join("\n");
    const compressed = compressMemory(longContent, { maxLines: 200 });
    const lines = compressed.split("\n");
    expect(lines.length).toBeLessThanOrEqual(200);
  });

  it("extracts key insights from session content", () => {
    const content = `
# Session Notes
- Bug: The API returns 404 when path has trailing slash
- Fix: Strip trailing slashes in router middleware
- Pattern: Always normalize paths before routing
- TODO: Add regression test
    `.trim();
    const insights = extractKeyInsights(content);
    expect(insights).toContain("Strip trailing slashes");
  });

  it("merges multiple memory files with deduplication", () => {
    const files = [
      { scope: "shared", content: "# Preferences\n- Use TypeScript\n- Prefer functional style" },
      { scope: "coding", content: "# Patterns\n- Use TypeScript\n- Always use Zod for validation" },
    ];
    const merged = mergeMemoryFiles(files);
    // Should deduplicate "Use TypeScript"
    const occurrences = (merged.match(/Use TypeScript/g) || []).length;
    expect(occurrences).toBe(1);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/cli && pnpm test -- --run smart-memory.test`
Expected: FAIL (module doesn't exist)

**Step 3: Implement smart-memory.ts**

Create `packages/cli/src/core/smart-memory.ts`:

```typescript
/**
 * Smart Memory Module
 * Compresses, deduplicates, and intelligently syncs memory across tools
 */

interface CompressOptions {
  maxLines: number;
  preserveHeaders?: boolean;
}

/**
 * Compress memory content to fit within line limits.
 * Prioritizes: headers > key insights > recent content > verbose details
 */
export function compressMemory(content: string, options: CompressOptions): string {
  const { maxLines, preserveHeaders = true } = options;
  const lines = content.split("\n");

  if (lines.length <= maxLines) return content;

  const headers: string[] = [];
  const keyInsights: string[] = [];
  const other: string[] = [];

  for (const line of lines) {
    if (line.startsWith("#")) {
      headers.push(line);
    } else if (line.match(/^[-*]\s*(Bug|Fix|Pattern|Important|Note|Key|Critical|Rule):/i)) {
      keyInsights.push(line);
    } else {
      other.push(line);
    }
  }

  // Build compressed output: headers first, then insights, then fill with other
  const result: string[] = [];
  if (preserveHeaders) result.push(...headers);
  result.push(...keyInsights);

  const remaining = maxLines - result.length;
  if (remaining > 0) {
    // Take from end of other (most recent)
    result.push(...other.slice(-remaining));
  }

  return result.slice(0, maxLines).join("\n");
}

/**
 * Extract key insights from session content
 */
export function extractKeyInsights(content: string): string {
  const lines = content.split("\n");
  const insights = lines.filter(line =>
    line.match(/^[-*]\s*(Bug|Fix|Pattern|Important|Note|Key|Critical|Rule|Lesson|Remember):/i) ||
    line.match(/^[-*]\s*.*(always|never|important|critical|remember|note:)/i)
  );
  return insights.join("\n");
}

/**
 * Merge multiple memory files with deduplication
 */
export function mergeMemoryFiles(
  files: Array<{ scope: string; content: string }>
): string {
  const seen = new Set<string>();
  const sections: string[] = [];

  for (const file of files) {
    const lines = file.content.split("\n");
    const uniqueLines: string[] = [];

    for (const line of lines) {
      const normalized = line.trim().toLowerCase();
      if (normalized === "" || normalized.startsWith("#")) {
        uniqueLines.push(line);
        continue;
      }
      if (!seen.has(normalized)) {
        seen.add(normalized);
        uniqueLines.push(line);
      }
    }

    sections.push(`<!-- SCOPE: ${file.scope} -->\n${uniqueLines.join("\n")}`);
  }

  return sections.join("\n\n");
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/cli && pnpm test -- --run smart-memory.test`
Expected: PASS

**Step 5: Integrate smart memory into memory-scoper.ts**

Modify `packages/cli/src/core/memory-scoper.ts` `syncMemoryToTool` function to use `compressMemory` and `mergeMemoryFiles` before writing to tool memory paths. Add a `maxLines` config option per tool (Claude Code = 200 lines for MEMORY.md).

**Step 6: Commit**

```bash
git add packages/cli/src/core/smart-memory.ts packages/cli/src/core/smart-memory.test.ts packages/cli/src/core/memory-scoper.ts packages/core/src/types.ts
git commit -m "feat(memory): add smart memory compression and deduplication across tools"
```

---

### Task 3: SKILL.md Standard Support (Feature 1.3)

**Files:**
- Create: `packages/cli/src/core/skill-parser.ts`
- Modify: `packages/cli/src/commands/add.ts`
- Modify: `packages/core/src/types.ts`
- Test: `packages/cli/src/core/skill-parser.test.ts`

**Step 1: Write failing test for SKILL.md parsing**

Create `packages/cli/src/core/skill-parser.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { parseSkillMd, isValidSkillMd } from "./skill-parser.js";

describe("skill-parser", () => {
  it("parses SKILL.md frontmatter correctly", () => {
    const content = `---
name: tdd-workflow
description: Test-driven development workflow
tools: claude-code, codex
model: sonnet
color: green
---

# TDD Workflow

Write failing test first, then implement.
`;
    const result = parseSkillMd(content);
    expect(result.name).toBe("tdd-workflow");
    expect(result.description).toBe("Test-driven development workflow");
    expect(result.tools).toEqual(["claude-code", "codex"]);
    expect(result.model).toBe("sonnet");
    expect(result.body).toContain("Write failing test first");
  });

  it("validates SKILL.md has required name field", () => {
    const valid = `---\nname: my-skill\n---\nBody`;
    const invalid = `---\ndescription: no name\n---\nBody`;
    expect(isValidSkillMd(valid)).toBe(true);
    expect(isValidSkillMd(invalid)).toBe(false);
  });

  it("handles SKILL.md without frontmatter", () => {
    const content = "# Just a markdown file\nNo frontmatter here.";
    const result = parseSkillMd(content);
    expect(result.name).toBe("");
    expect(result.body).toContain("Just a markdown file");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/cli && pnpm test -- --run skill-parser.test`
Expected: FAIL

**Step 3: Implement skill-parser.ts**

Create `packages/cli/src/core/skill-parser.ts`:

```typescript
/**
 * SKILL.md Parser
 * Parses the SKILL.md standard format (frontmatter + body)
 */

export interface SkillMdMetadata {
  name: string;
  description: string;
  tools: string[];
  model?: string;
  color?: string;
  body: string;
}

/**
 * Parse SKILL.md content into structured metadata
 */
export function parseSkillMd(content: string): SkillMdMetadata {
  const result: SkillMdMetadata = {
    name: "",
    description: "",
    tools: [],
    body: content,
  };

  // Check for frontmatter (--- delimited)
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!frontmatterMatch) return result;

  const [, frontmatter, body] = frontmatterMatch;
  result.body = body.trim();

  // Parse frontmatter key-value pairs
  for (const line of frontmatter.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();

    switch (key) {
      case "name":
        result.name = value;
        break;
      case "description":
        result.description = value;
        break;
      case "tools":
        result.tools = value.split(",").map(t => t.trim()).filter(Boolean);
        break;
      case "model":
        result.model = value;
        break;
      case "color":
        result.color = value;
        break;
    }
  }

  return result;
}

/**
 * Validate that SKILL.md has required fields
 */
export function isValidSkillMd(content: string): boolean {
  const parsed = parseSkillMd(content);
  return parsed.name.length > 0;
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/cli && pnpm test -- --run skill-parser.test`
Expected: PASS

**Step 5: Integrate into add command**

Modify `packages/cli/src/commands/add.ts` `addSkill` function to detect and parse `SKILL.md` files in added skills, extracting metadata for the manifest entry.

**Step 6: Commit**

```bash
git add packages/cli/src/core/skill-parser.ts packages/cli/src/core/skill-parser.test.ts packages/cli/src/commands/add.ts
git commit -m "feat(skills): add SKILL.md standard parser for community skill ecosystem"
```

---

### Task 4: MCP Registry Integration (Feature 1.4)

**Files:**
- Create: `packages/cli/src/core/mcp-registry.ts`
- Modify: `packages/cli/src/commands/add.ts`
- Test: `packages/cli/src/core/mcp-registry.test.ts`

**Step 1: Write failing test for registry search**

Create `packages/cli/src/core/mcp-registry.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { searchRegistry, parseRegistryEntry } from "./mcp-registry.js";

describe("mcp-registry", () => {
  it("parses a registry entry into McpServerConfig", () => {
    const entry = {
      name: "git-mcp",
      command: "npx",
      args: ["-y", "@anthropics/git-mcp"],
      description: "Git operations MCP server",
    };
    const config = parseRegistryEntry(entry);
    expect(config.command).toBe("npx");
    expect(config.args).toEqual(["-y", "@anthropics/git-mcp"]);
    expect(config.enabled).toBe(true);
  });

  it("searchRegistry returns results matching query", async () => {
    // Mock fetch for testing
    const mockResults = [
      { name: "git-mcp", description: "Git operations" },
      { name: "github-mcp", description: "GitHub API" },
    ];
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResults),
    });

    const results = await searchRegistry("git");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name).toContain("git");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/cli && pnpm test -- --run mcp-registry.test`
Expected: FAIL

**Step 3: Implement mcp-registry.ts**

Create `packages/cli/src/core/mcp-registry.ts`:

```typescript
/**
 * MCP Registry Integration
 * Search and install from the official MCP registry
 */
import type { McpServerConfig } from "@mycelium/core";

const REGISTRY_URL = "https://registry.modelcontextprotocol.io";

export interface RegistryEntry {
  name: string;
  command: string;
  args?: string[];
  description?: string;
  env?: Record<string, string>;
}

export function parseRegistryEntry(entry: RegistryEntry): McpServerConfig {
  return {
    command: entry.command,
    args: entry.args,
    env: entry.env,
    enabled: true,
  };
}

export async function searchRegistry(query: string): Promise<RegistryEntry[]> {
  const res = await fetch(`${REGISTRY_URL}/api/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error(`Registry search failed: ${res.statusText}`);
  return res.json();
}

export async function getRegistryEntry(name: string): Promise<RegistryEntry | null> {
  try {
    const res = await fetch(`${REGISTRY_URL}/api/servers/${encodeURIComponent(name)}`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/cli && pnpm test -- --run mcp-registry.test`
Expected: PASS

**Step 5: Add `mycelium add mcp --from-registry <name>` to add.ts**

Modify `packages/cli/src/commands/add.ts` to add a `--from-registry` flag that fetches from the MCP registry and auto-populates command/args.

**Step 6: Commit**

```bash
git add packages/cli/src/core/mcp-registry.ts packages/cli/src/core/mcp-registry.test.ts packages/cli/src/commands/add.ts
git commit -m "feat(mcp): add MCP registry integration for search and install"
```

---

### Task 5: Doctor Improvements (Feature 1.5)

**Files:**
- Modify: `packages/cli/src/commands/doctor.ts`
- Test: `packages/cli/src/commands/doctor.test.ts`

**Step 1: Write failing test for new checks**

Add to `packages/cli/src/commands/doctor.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { checkMcpServerConnectivity, checkToolVersions } from "./doctor.js";

describe("doctor improvements", () => {
  it("checkMcpServerConnectivity returns pass for valid command", async () => {
    const result = await checkMcpServerConnectivity("echo", ["hello"]);
    expect(result.status).toBe("pass");
  });

  it("checkMcpServerConnectivity returns fail for invalid command", async () => {
    const result = await checkMcpServerConnectivity("nonexistent-cmd-xyz", []);
    expect(result.status).toBe("fail");
  });

  it("checkToolVersions detects installed tools", async () => {
    const result = await checkToolVersions();
    expect(result.status).toBe("pass");
    expect(result.message).toContain("tool");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/cli && pnpm test -- --run doctor.test`
Expected: FAIL

**Step 3: Implement new doctor checks**

Add to `packages/cli/src/commands/doctor.ts`:

- `checkMcpServerConnectivity(command, args)` — tries to spawn the MCP command to verify it exists
- `checkToolVersions()` — checks which tools are installed and their versions
- `checkMemoryFileSize()` — warns if memory files exceed tool limits (e.g., Claude's 200 line limit)
- Add all new checks to `runAllChecks()`

**Step 4: Run test to verify it passes**

Run: `cd packages/cli && pnpm test -- --run doctor.test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/cli/src/commands/doctor.ts packages/cli/src/commands/doctor.test.ts
git commit -m "feat(doctor): add MCP connectivity, tool version, and memory size checks"
```

---

## Tier 2 Features

### Task 6: MCP Intelligent Routing (Feature 2.1)

**Files:**
- Create: `packages/cli/src/core/mcp-router.ts`
- Modify: `packages/cli/src/commands/sync.ts`
- Test: `packages/cli/src/core/mcp-router.test.ts`

**Step 1: Write failing test**

Create `packages/cli/src/core/mcp-router.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { routeMcpsForProject, detectProjectContext } from "./mcp-router.js";

describe("mcp-router", () => {
  it("detects Python project and enables relevant MCPs", () => {
    const context = { files: ["requirements.txt", "main.py", "README.md"] };
    const allMcps = {
      "python-mcp": { command: "python-mcp", tags: ["python"] },
      "git-mcp": { command: "git-mcp", tags: ["git"] },
      "node-mcp": { command: "node-mcp", tags: ["node", "javascript"] },
    };
    const routed = routeMcpsForProject(allMcps, context);
    expect(routed).toContain("python-mcp");
    expect(routed).toContain("git-mcp"); // always included
    expect(routed).not.toContain("node-mcp");
  });

  it("detectProjectContext identifies project type from files", () => {
    const context = detectProjectContext(["package.json", "tsconfig.json", "src/index.ts"]);
    expect(context.languages).toContain("typescript");
    expect(context.frameworks).toContain("node");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/cli && pnpm test -- --run mcp-router.test`
Expected: FAIL

**Step 3: Implement mcp-router.ts**

Create `packages/cli/src/core/mcp-router.ts` with:

- `detectProjectContext(files)` — analyzes files to detect languages, frameworks
- `routeMcpsForProject(allMcps, context)` — returns which MCPs are relevant
- Tag-based matching: MCPs get `tags` field, matched against project context

**Step 4: Run test, verify pass, commit**

```bash
git add packages/cli/src/core/mcp-router.ts packages/cli/src/core/mcp-router.test.ts packages/cli/src/commands/sync.ts
git commit -m "feat(mcp): add intelligent MCP routing based on project context"
```

---

### Task 7: Agent Team Config Management (Feature 2.2)

**Files:**
- Create: `packages/cli/src/core/agent-teams.ts`
- Create: `packages/cli/src/commands/teams.ts`
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/core/src/types.ts`
- Test: `packages/cli/src/core/agent-teams.test.ts`

**Step 1: Write failing test**

Create `packages/cli/src/core/agent-teams.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { parseTeamConfig, generateTeamManifest } from "./agent-teams.js";

describe("agent-teams", () => {
  it("parses a team config YAML", () => {
    const yaml = `
name: backend-team
agents:
  - name: architect
    role: "Design system architecture"
    model: opus
  - name: implementer
    role: "Write implementation code"
    model: sonnet
  - name: tester
    role: "Write and run tests"
    model: haiku
`;
    const team = parseTeamConfig(yaml);
    expect(team.name).toBe("backend-team");
    expect(team.agents).toHaveLength(3);
    expect(team.agents[0].name).toBe("architect");
  });

  it("generates Claude Code team manifest", () => {
    const team = {
      name: "backend-team",
      agents: [
        { name: "architect", role: "Design", model: "opus" },
        { name: "coder", role: "Implement", model: "sonnet" },
      ],
    };
    const manifest = generateTeamManifest(team);
    expect(manifest).toContain("architect");
    expect(manifest).toContain("opus");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/cli && pnpm test -- --run agent-teams.test`
Expected: FAIL

**Step 3: Implement agent-teams.ts and teams command**

- `packages/cli/src/core/agent-teams.ts` — parse/generate team configs
- `packages/cli/src/commands/teams.ts` — `mycelium teams list`, `mycelium teams create <template>`
- Add team command to `packages/cli/src/index.ts`

**Step 4: Run test, verify pass, commit**

```bash
git add packages/cli/src/core/agent-teams.ts packages/cli/src/core/agent-teams.test.ts packages/cli/src/commands/teams.ts packages/cli/src/index.ts packages/core/src/types.ts
git commit -m "feat(teams): add agent team config management for Claude Code Agent Teams"
```

---

### Task 8: Preset/Profile System (Feature 2.3)

**Files:**
- Create: `packages/cli/src/core/presets.ts`
- Create: `packages/cli/src/commands/preset.ts`
- Modify: `packages/cli/src/index.ts`
- Test: `packages/cli/src/core/presets.test.ts`

**Step 1: Write failing test**

Create `packages/cli/src/core/presets.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { createPreset, applyPreset, exportPreset } from "./presets.js";

describe("presets", () => {
  it("creates a preset from current config", () => {
    const config = {
      skills: ["tdd", "debugging"],
      mcps: ["git-mcp", "postgres-mcp"],
      memory: { scopes: ["shared", "coding"] },
    };
    const preset = createPreset("python-backend", config);
    expect(preset.name).toBe("python-backend");
    expect(preset.skills).toEqual(["tdd", "debugging"]);
  });

  it("applies a preset by enabling/disabling items", () => {
    const preset = {
      name: "python-backend",
      skills: ["tdd"],
      mcps: ["git-mcp"],
      memory: { scopes: ["shared"] },
    };
    const actions = applyPreset(preset, {
      allSkills: ["tdd", "debugging", "frontend"],
      allMcps: ["git-mcp", "node-mcp", "postgres-mcp"],
    });
    // tdd should be enabled, debugging and frontend disabled
    expect(actions.enableSkills).toEqual(["tdd"]);
    expect(actions.disableSkills).toEqual(["debugging", "frontend"]);
  });

  it("exports preset as shareable YAML", () => {
    const preset = { name: "test", skills: ["a"], mcps: ["b"], memory: { scopes: ["shared"] } };
    const yaml = exportPreset(preset);
    expect(yaml).toContain("name: test");
    expect(yaml).toContain("skills:");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/cli && pnpm test -- --run presets.test`
Expected: FAIL

**Step 3: Implement presets.ts and preset command**

- `packages/cli/src/core/presets.ts` — create/apply/export/import presets
- `packages/cli/src/commands/preset.ts` — `mycelium preset save <name>`, `mycelium preset load <name>`, `mycelium preset list`, `mycelium preset export <name>`
- Presets stored in `~/.mycelium/presets/`

**Step 4: Run test, verify pass, commit**

```bash
git add packages/cli/src/core/presets.ts packages/cli/src/core/presets.test.ts packages/cli/src/commands/preset.ts packages/cli/src/index.ts
git commit -m "feat(presets): add preset/profile system for one-click config switching"
```

---

### Task 9: Conflict Detection (Feature 2.4)

**Files:**
- Create: `packages/cli/src/core/conflict-detector.ts`
- Modify: `packages/cli/src/commands/sync.ts`
- Test: `packages/cli/src/core/conflict-detector.test.ts`

**Step 1: Write failing test**

Create `packages/cli/src/core/conflict-detector.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { detectConflicts } from "./conflict-detector.js";

describe("conflict-detector", () => {
  it("detects duplicate MCP with different configs across levels", () => {
    const global = { mcps: { "git-mcp": { command: "npx", args: ["@v1"] } } };
    const project = { mcps: { "git-mcp": { command: "npx", args: ["@v2"] } } };
    const conflicts = detectConflicts(global, project);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].name).toBe("git-mcp");
    expect(conflicts[0].type).toBe("mcp");
  });

  it("returns empty when no conflicts", () => {
    const global = { mcps: { "git-mcp": { command: "npx" } } };
    const project = { mcps: { "db-mcp": { command: "npx" } } };
    const conflicts = detectConflicts(global, project);
    expect(conflicts).toHaveLength(0);
  });
});
```

**Step 2: Implement, test, commit**

```bash
git add packages/cli/src/core/conflict-detector.ts packages/cli/src/core/conflict-detector.test.ts packages/cli/src/commands/sync.ts
git commit -m "feat(sync): add conflict detection between config levels"
```

---

### Task 10: Watch Mode (Feature 2.5)

**Files:**
- Create: `packages/cli/src/core/watcher.ts`
- Modify: `packages/cli/src/commands/sync.ts`
- Test: `packages/cli/src/core/watcher.test.ts`

**Step 1: Write failing test**

Create `packages/cli/src/core/watcher.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { getWatchPaths, shouldTriggerSync } from "./watcher.js";

describe("watcher", () => {
  it("returns correct paths to watch", () => {
    const paths = getWatchPaths("/home/user");
    expect(paths).toContain("/home/user/.mycelium");
    expect(paths.some(p => p.includes("manifest.yaml"))).toBe(false); // watches dirs, not files
  });

  it("shouldTriggerSync returns true for config file changes", () => {
    expect(shouldTriggerSync("manifest.yaml")).toBe(true);
    expect(shouldTriggerSync("mcps.yaml")).toBe(true);
    expect(shouldTriggerSync("random.txt")).toBe(false);
  });
});
```

**Step 2: Implement watcher.ts**

Use `node:fs/promises` `watch` API (Node 20+) to watch config directories. On change, debounce and trigger sync.

**Step 3: Add `--watch` flag to sync command**

Modify `packages/cli/src/commands/sync.ts` to accept `--watch` flag.

**Step 4: Test, commit**

```bash
git add packages/cli/src/core/watcher.ts packages/cli/src/core/watcher.test.ts packages/cli/src/commands/sync.ts
git commit -m "feat(sync): add watch mode for auto-sync on config changes"
```

---

## Team Agent Setup for Parallel Execution

This plan should be executed with a team of 4 agents:

### Agent 1: `dashboard-dev` (general-purpose)
- **Tasks:** Task 1 (Dashboard Toggle Switches)
- **Focus:** React, React Flow, dashboard components

### Agent 2: `cli-core` (general-purpose)
- **Tasks:** Task 2 (Smart Memory), Task 3 (SKILL.md Parser), Task 5 (Doctor)
- **Focus:** CLI core modules, TypeScript

### Agent 3: `cli-features` (general-purpose)
- **Tasks:** Task 4 (MCP Registry), Task 6 (MCP Router), Task 7 (Agent Teams)
- **Focus:** CLI new features, external integrations

### Agent 4: `cli-infra` (general-purpose)
- **Tasks:** Task 8 (Presets), Task 9 (Conflict Detection), Task 10 (Watch Mode)
- **Focus:** CLI infrastructure features

### Agent 5: `auditor` (audit agent - sonnet)
- **Tasks:** Review completed work from each agent after each task
- **Focus:** Code quality, pattern alignment, DRY, YAGNI

### Dependency Graph

```
Task 1 (Dashboard Toggles) ────────────────────────┐
Task 2 (Smart Memory) ──────────────────────────────┤
Task 3 (SKILL.md) ──────────────────────────────────┤──▶ Audit after each
Task 4 (MCP Registry) ──────────────────────────────┤
Task 5 (Doctor) ────────────────────────────────────┘
    │
    ▼ (Tier 2 can start after Tier 1 core types are in place)
Task 6 (MCP Router) ── depends on Task 4 (registry types)
Task 7 (Agent Teams) ── independent
Task 8 (Presets) ── depends on Task 2+3 (config types)
Task 9 (Conflicts) ── independent
Task 10 (Watch) ── independent
```

### Execution Order

**Parallel batch 1 (Tier 1):**
- Agent 1: Task 1
- Agent 2: Tasks 2, 3
- Agent 3: Tasks 4, 5

**Parallel batch 2 (Tier 2):**
- Agent 1: Free for review / dashboard updates
- Agent 2: Task 8
- Agent 3: Tasks 6, 7
- Agent 4: Tasks 9, 10

**After each task:** Agent 5 (auditor) reviews the completed work.
