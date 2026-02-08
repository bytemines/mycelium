# Mycelium Full Codebase Audit Report

**Date:** 2026-02-08
**Auditors:** 6-agent expert team + SherpAI codebase_analyzer + audit-plugin
**Scope:** 106 source files, ~23,200 lines across 3 packages

---

## Executive Summary

| Dimension | Score | Notes |
|-----------|-------|-------|
| **Architecture** | 7.5/10 | Monorepo split is justified, clean boundaries |
| **Code Quality** | 6/10 | 5 god files, ~10 production `any` types, silent catches |
| **Tech Stack** | 7.8/10 | Solid choices, 3 easy dependency swaps |
| **Test Coverage** | 7.5/10 | 471 tests, but 7 source files untested |
| **Maintainability** | 6/10 | Large files hurt readability and merge conflicts |
| **DRY** | 6.5/10 | MCP writing logic in 3 places, MYCELIUM_DIR in 5 places |
| **Security** | 7/10 | 2 command injection risks in init.ts and remote.ts |
| **Performance** | 7/10 | Missing React.memo on node components, elkjs not lazy-loaded |
| **Overall** | **7/10** | Solid foundation with accumulated tech debt in CLI package |

**Verdict: NEEDS WORK** — well-engineered foundation, but the CLI package has grown too large without modularization.

---

## SherpAI Codebase Analyzer Results

```
Scanned: 104 files
Found:   47 files >= 200 lines
         10 files >= 500 lines
          1 file  >= 800 lines (migrator.ts at 864)
```

### Top 10 Hotspot Files

| # | File | Lines | Score /100 | Category |
|---|------|-------|-----------|----------|
| 1 | `cli/src/core/migrator.ts` | **864** | **45** | URGENT |
| 2 | `cli/src/commands/doctor.test.ts` | 745 | 55 | Refactor |
| 3 | `cli/src/commands/add.test.ts` | 744 | 55 | Refactor |
| 4 | `cli/src/commands/doctor.ts` | **699** | **50** | Refactor |
| 5 | `cli/src/core/tool-adapter.ts` | **691** | **50** | Refactor |
| 6 | `cli/src/core/memory-scoper.test.ts` | 588 | 55 | Refactor |
| 7 | `cli/src/core/mcp-injector.test.ts` | 569 | 50 | Refactor |
| 8 | `cli/src/core/migrator.test.ts` | 543 | 55 | Refactor |
| 9 | `cli/src/core/marketplace.ts` | **535** | **50** | Refactor |
| 10 | `cli/src/commands/add.ts` | **518** | **45** | URGENT |

### SherpAI Plugin Health

```
Size Limits:   PASS
Structure:     PASS
Hooks:         PASS
Versions:      WARNING — plugin.json=1.27.1, installed=1.27.0
```

---

## Package Audit Reports

### CLI Package (70 files, ~19,400 lines with tests) — NEEDS WORK

**Checklist:**

| Check | Status | Notes |
|-------|--------|-------|
| Solves Problem | PASS | Full multi-tool orchestrator |
| Lean | NEEDS WORK | 5 source files over 500 lines |
| DRY | NEEDS WORK | MCP writing in 3 places, MYCELIUM_DIR 5x |
| Aligned | PASS | Consistent Commander.js patterns |
| Not Over-engineered | PASS | Each module solves a real need |
| Permanent Fix | NEEDS WORK | 3 @deprecated exports still live |

**Critical Issues:**

1. **P1 — God module: `migrator.ts` (864 lines)**
   - Contains 12 exported functions: 4 tool scanners + plan generation + execution + manifest + YAML serializer + hooks writer + clearing
   - Split into: `migrator/scanners.ts`, `migrator/planner.ts`, `migrator/executor.ts`, `migrator/manifest.ts`

2. **P1 — DRY: MCP config writing duplicated in 3 files**
   - `sync-writer.ts:76-315` + `mcp-injector.ts:337-451` + `tool-adapter.ts:193-598`
   - TOML section-replace logic nearly identical in all 3

3. **P1 — DRY: `MYCELIUM_DIR` defined in 5 separate files**
   - `migrator.ts:38`, `marketplace-registry.ts:10`, `marketplace.ts:19`, `remove.ts:18`, `machine-overrides.ts:17`

4. **P2 — Security: Command injection in init.ts and remote.ts**
   - `init.ts:252-253`: `execSync` with string interpolation `git -C ${myceliumDir} ...`
   - `remote.ts:20`: `execSync(\`git -C ${MYCELIUM_DIR} ${args}\`)`
   - Fix: Replace with `execFileSync` using array arguments

5. **P2 — Dead code: 3 deprecated exports still live**
   - `mcp-injector.ts:249` — `createDefaultConfig` @deprecated
   - `mcp-injector.ts:296` — `injectMcpsToTool` @deprecated
   - `migrator.ts:36` — `expandHome` deprecated alias

6. **P2 — `marketplace-registry.ts:18-65` — Custom YAML parser**
   - Hand-rolled `parseSimpleYaml` when `yaml` package is already a dependency

7. **P3 — Test coverage gaps: 7 untested source files**
   - `fs-helpers.ts`, `commands/marketplace.ts`, `commands/migrate.ts`, `commands/preset.ts`, `commands/remove.ts`, `commands/serve.ts`, `commands/teams.ts`
   - `server.ts` (502 lines, 20 endpoints) has no tests

**Complex Functions (>30 lines):**

| Function | File:Line | Lines |
|----------|-----------|-------|
| `scanClaudeCode` | `migrator.ts:64` | ~140 |
| `executeMigration` | `migrator.ts:614` | ~158 |
| `generateMigrationPlan` | `migrator.ts:438` | ~120 |
| `autoSetup` | `init.ts:303` | ~152 |
| `addSkill` | `add.ts:148` | ~132 |
| `syncCommand.action` | `sync.ts:250` | ~130 |
| `getPopularSkills` | `marketplace.ts:335` | ~113 |
| `/api/state` handler | `server.ts:48` | ~95 |

**Strengths:**
- Clean adapter pattern (BaseToolAdapter + per-tool subclasses)
- Good separation: commands/ for CLI, core/ for business logic
- fs-helpers.ts deduplication pattern
- Machine overrides + env template system well-architected
- 426 CLI tests

---

### Dashboard Package (7 files, ~2,500 lines) — MINOR ISSUES

**Checklist:**

| Check | Status | Notes |
|-------|--------|-------|
| Solves Problem | PASS | Interactive graph dashboard |
| Lean | PASS | Components are reasonably sized |
| DRY | NEEDS WORK | Status type duplicated in 5+ files |
| Aligned | PASS | Consistent React patterns |
| Not Over-engineered | PASS | Zustand is right-sized |
| Performance | NEEDS WORK | Missing React.memo on node components |

**Issues:**

1. **P1 — Silent catches in dashboard-store.ts**
   - Lines 128, 136, 148, 177: `.catch(() => {})` swallows errors — UI appears to succeed when backend fails

2. **P2 — Missing React.memo() on node components**
   - ToolNode, ResourceNode, PluginNode, AddToolNode not memoized — React Flow re-renders all nodes on any state change

3. **P2 — Status type duplicated in 5+ files**
   - Dashboard.tsx, Graph.tsx, graph-builder.ts, dashboard-store.ts, StatusDot.tsx, ToolNode.tsx, ResourceNode.tsx

4. **P2 — Dead code: 3 unused hooks**
   - `useFetch.ts`, `useToggle.ts`, `useModal.ts` — never imported anywhere

5. **P2 — Accessibility gaps**
   - PluginDetailPanel and MarketplaceBrowser modals: no focus trap, no Escape handler, no `aria-modal`
   - Radix Dialog is already in package.json but unused for these modals
   - No `aria-live` regions for loading states, error banners
   - Tab navbar missing `role="tablist"` / `role="tab"` / `aria-selected`

6. **P3 — Graph.tsx still 449 lines**
   - 163-line useMemo block for node/edge building
   - Should move this logic to graph-builder.ts (which already exists but only handles migration data)

7. **P3 — Hardcoded URL: `dashboard-store.ts:154`**
   - `fetch("http://localhost:3378/api/sync")` bypasses the api.ts abstraction

8. **P4 — `proOptions={{ hideAttribution: true }}` in Graph.tsx:403**
   - Requires React Flow Pro license. Verify licensing status.

**Strengths:**
- Clean Zustand store with optimistic updates and rollback
- Good node component extraction (nodes/ directory)
- Proper React Flow integration with ELK auto-layout
- Consistent Tailwind patterns with semantic tokens
- ARIA attributes on toggle switches

---

### Core Package (5 files, ~700 lines) — PASS

**Checklist:**

| Check | Status | Notes |
|-------|--------|-------|
| Type Design | 7/10 | Solid, missing discriminated unions |
| Exports | 8/10 | Clean barrel, unused subpath exports |
| Interface Boundaries | 6/10 | UI concerns leak (ENTRY_TYPE_META has Tailwind classes) |
| Type Safety | 8/10 | Zero `any`, some `as` casts |
| Naming | 8/10 | Consistent, minor schema suffix confusion |
| Cross-Package | 9/10 | Clean unidirectional deps |

**Issues:**

1. **P2 — UI concern in core: `ENTRY_TYPE_META`**
   - Contains Tailwind CSS classes (`text-purple-400`, `bg-purple-500/10`)
   - Should move to dashboard package

2. **P2 — Dual type definitions**
   - `types.ts` defines manual types, `schema.ts` defines Zod schemas that infer types
   - The `z.infer` exports (`*Schema` suffix) are unused — delete them or switch to schema-derived types

3. **P3 — `DashboardState` uses inline anonymous types**
   - `Array<{ id: ToolId; name: string; ... }>` should be named interfaces

4. **P3 — `SUPPORTED_TOOLS` hardcodes filesystem paths**
   - Tool-specific configuration in core couples it to filesystem layout assumptions

**Strengths:**
- Zero `any` types
- Pure types + schemas + utils (no business logic)
- Single dependency: zod
- Clean unidirectional dependency graph

---

## Tech Stack Evaluation

### Backend/CLI Stack

| Library | Version | Rating | Verdict | Alternative |
|---------|---------|--------|---------|-------------|
| TypeScript | ^5.7.2 | **9/10** | KEEP | — |
| pnpm | 9.15 | **9/10** | KEEP | — |
| Turborepo | ^2.3.3 | **8/10** | KEEP | Slightly overkill for 3 packages but fine |
| Vitest | ^2.1.8 | **9/10** | KEEP | — |
| Commander | ^13.0.0 | **8/10** | KEEP | Battle-tested, well-typed |
| Zod | ^3.24.1 | **9/10** | KEEP | — |
| YAML | ^2.6.1 | **8/10** | KEEP | Best YAML lib for Node |
| **Express 5** | ^5.2.1 | **6/10** | CONSIDER | Hono (14KB vs 550KB, typed, similar API) |
| **Chalk** | ^5.4.1 | **5/10** | **SWAP** | picocolors (0.7KB, 13x smaller, same API) |
| **dotenv** | ^16.4.7 | **4/10** | **SWAP** | Node 20+ native `--env-file` |
| **cors** | ^2.8.6 | **5/10** | **SWAP** | 5-line inline middleware (localhost-only) |

### Frontend/Dashboard Stack

| Library | Version | Rating | Verdict | Alternative |
|---------|---------|--------|---------|-------------|
| React | ^18.3.1 | **7/10** | KEEP | Upgrade to 19 when @xyflow supports it |
| @xyflow/react | ^12.4.3 | **7/10** | KEEP | See deep dive below |
| Zustand | ^5.0.11 | **9/10** | KEEP | Perfect for this use case |
| Radix UI | various | **8/10** | KEEP | Good a11y, only 4 primitives used |
| Tailwind CSS | ^3.4.17 | **7/10** | KEEP | Upgrade to v4 when ready |
| ELK.js | ^0.11.0 | **7/10** | KEEP | Consider lazy-loading (200KB) |
| Vite | ^6.0.7 | **9/10** | KEEP | — |
| lucide-react | ^0.469.0 | **7/10** | KEEP | — |
| **CVA** | ^0.7.1 | **6/10** | CONSIDER | Remove if only used in 2-3 components |
| **tailwindcss-animate** | ^1.0.7 | **5/10** | **SWAP** | Native CSS @keyframes (10 lines) |

### React Flow Deep Dive

**Feature utilization: ~25-30%** of React Flow's capability.

Used: ReactFlow container, useNodesState/useEdgesState, custom nodeTypes (4), Background/Controls/MiniMap/Panel, animated edges, ELK layout, fitView, pan/zoom.

NOT used: Edge types, drag-to-connect, node resizing, sub-flows, undo/redo, keyboard shortcuts, copy/paste, grouping, collaboration.

| Option | Bundle | DX | Custom Nodes | Auto-Layout | Score |
|--------|--------|-----|-------------|-------------|-------|
| **@xyflow/react** (current) | 5/10 | 9/10 | 9/10 | 8/10 | **7.7** |
| D3.js | 7/10 | 4/10 | 6/10 | 7/10 | 6.0 |
| Cytoscape.js | 6/10 | 5/10 | 5/10 | 9/10 | 6.2 |
| Native SVG/Canvas | 10/10 | 4/10 | 8/10 | 2/10 | 6.0 |

**Verdict: KEEP React Flow.** Despite 25% utilization, the JSX custom node rendering, built-in MiniMap/Controls, and ELK integration would take weeks to reimplement. Bundle cost (~150KB + 200KB elkjs) is acceptable for a dashboard app.

**One concern:** `proOptions={{ hideAttribution: true }}` requires a Pro license.

### Quick Dependency Wins (30 min work, save ~85KB)

1. Drop `dotenv` → use `node --env-file=.env`
2. Replace `chalk` → `picocolors` (drop-in)
3. Inline `cors` → 5-line middleware for localhost

---

## Pattern Detection Report

### Naming Conventions — CLEAN
All files kebab-case, functions camelCase, types PascalCase. No violations.

### Error Handling — INCONSISTENT

| Pattern | Location | Severity |
|---------|----------|----------|
| Silent `.catch(() => {})` | dashboard-store.ts:128,136,148,177 | HIGH |
| 21 identical try/catch blocks | server.ts (every route) | MEDIUM |
| Fire-and-forget async | remote.ts:125 | MEDIUM |
| Clean error wrapping | tool-adapter.ts (throughout) | GOOD |

### DRY Violations

| Violation | Locations | Priority |
|-----------|-----------|----------|
| MCP config writing logic | sync-writer.ts, mcp-injector.ts, tool-adapter.ts | P1 |
| `MYCELIUM_DIR` constant | 5 files | P1 |
| TOML section-replace | sync-writer.ts, tool-adapter.ts, mcp-injector.ts | P1 |
| Port `3378` hardcoded | server.ts, serve.ts, init.ts, dashboard-store.ts | P2 |
| `memoryLimits` map | doctor.ts (possibly deduplicated already) | P2 |
| server.ts error handling | 21 identical catch blocks | P2 |

### Anti-Patterns

| Anti-Pattern | Count | Locations |
|--------------|-------|-----------|
| `any` types (production) | ~10 | dashboard-store.ts, snapshot.ts, server.ts |
| `any` types (tests) | ~47 | Various test files |
| God files (>500L) | 5 | migrator, doctor, tool-adapter, marketplace, add |
| Magic numbers | ~15 | Port 3378 (4x), timeout 5000 (2x), limit 200 |
| Custom parser when lib exists | 1 | marketplace-registry.ts parseSimpleYaml |

### Good Patterns to Replicate
- `fs-helpers.ts` — small shared utility, used by 3+ modules
- `env-template.ts` — clean single-responsibility module
- `conflict-detector.ts`, `presets.ts` — right-sized modules
- Test co-location (`*.test.ts` alongside `*.ts`)
- Zustand store with optimistic updates

---

## Architecture Assessment

### Monorepo Structure — JUSTIFIED

```
core (types + zod, 0 workspace deps)
  <- cli  (commands + server + core logic)
  <- dashboard (React + React Flow + Zustand)
```

The 3-package split prevents circular deps and separates Node.js-only code from browser code. `core` is thin (~200 lines of types) but serves as a clean shared contract.

### What's Correctly Engineered
- TypeScript throughout with good type coverage
- Commander pattern for CLI commands (one file per command)
- Adapter pattern for multi-tool support (BaseToolAdapter + subclasses)
- Zustand for dashboard state (right-sized, no over-engineering)
- React Flow + ELK for graph visualization (appropriate for the use case)
- pnpm + Turborepo (industry standard monorepo tooling)
- Vitest (modern, fast, ESM-native)

### What Needs Improvement
1. CLI core modules are too large (5 files >500 lines)
2. MCP config writing logic is triplicated
3. server.ts is monolithic (20 routes, no middleware extraction)
4. Silent error catching in dashboard store
5. Missing React.memo on graph node components
6. 7 CLI source files have no tests
7. 2 command injection risks (init.ts, remote.ts)

---

## Priority Action Items

### P1 — Immediate (This Week)

| # | Action | Files | Effort |
|---|--------|-------|--------|
| 1 | Split `migrator.ts` into scanner/planner/executor/manifest | migrator.ts | 2-3 hours |
| 2 | Extract shared `MYCELIUM_HOME` constant | 5 files | 15 min |
| 3 | Replace `chalk` with `picocolors` | All CLI files | 30 min |
| 4 | Drop `dotenv`, use native `--env-file` | package.json, env-template.ts | 15 min |
| 5 | Fix command injection: `execSync` -> `execFileSync` | init.ts, remote.ts | 15 min |

### P2 — Short-term (This Month)

| # | Action | Files | Effort |
|---|--------|-------|--------|
| 6 | Split `doctor.ts` into check modules | doctor.ts | 1-2 hours |
| 7 | Split `tool-adapter.ts` per-tool or extract shared logic | tool-adapter.ts | 1-2 hours |
| 8 | Deduplicate MCP/TOML writing into shared helper | sync-writer, mcp-injector, tool-adapter | 2 hours |
| 9 | Delete deprecated exports + dead per-tool writers | mcp-injector.ts, sync-writer.ts | 30 min |
| 10 | Wrap node components in React.memo() | 4 node components | 15 min |
| 11 | Fix silent catches in dashboard-store.ts | dashboard-store.ts | 30 min |
| 12 | Centralize Status type | 5+ dashboard files | 30 min |
| 13 | Delete unused hooks (useFetch, useToggle, useModal) | 3 files | 5 min |
| 14 | Add focus traps using Radix Dialog (already in deps) | PluginDetailPanel, MarketplaceBrowser | 1 hour |
| 15 | Extract server routes into route files | server.ts | 1 hour |

### P3 — Long-term (This Quarter)

| # | Action | Files | Effort |
|---|--------|-------|--------|
| 16 | Replace custom YAML parser with `yaml` package | marketplace-registry.ts | 30 min |
| 17 | Move `ENTRY_TYPE_META` to dashboard | core/types.ts, dashboard | 30 min |
| 18 | Eliminate dual type definitions (manual vs Zod inferred) | core/types.ts, core/schema.ts | 1 hour |
| 19 | Consider Express -> Hono migration | server.ts | 2-3 hours |
| 20 | Lazy-load elkjs in Graph.tsx | Graph.tsx | 15 min |
| 21 | Add tests for 7 untested source files | Various | 4-6 hours |
| 22 | Add ESLint rule: max file length 300 lines for .ts | eslint config | 15 min |
| 23 | Upgrade to React 19 when @xyflow supports it | dashboard | 1-2 hours |
| 24 | Upgrade Tailwind to v4 | dashboard | 1-2 hours |

---

## Final Assessment

**Is Mycelium correctly engineered?** Yes, with caveats.

The architecture is sound — the monorepo structure, technology choices, and overall design patterns are appropriate for a universal AI tool orchestrator. The codebase has grown rapidly through 5 implementation tiers and accumulated tech debt primarily in the CLI package, where modules have grown past maintainable sizes.

**The #1 priority is modularizing the CLI core modules.** Five files over 500 lines (migrator, doctor, tool-adapter, marketplace, add) contain the bulk of the complexity and are the main drag on maintainability. Splitting these would bring the codebase to a much healthier state.

**The tech stack is well-chosen (7.8/10).** The only clear swaps are `chalk` -> `picocolors` and `dotenv` -> native. React Flow, Zustand, Commander, and the core tooling are all the right choices for this project's needs.

---

*Generated by 6-agent expert team: cli-auditor, dashboard-auditor, core-auditor, tech-evaluator, pattern-detector, architect*
*Enhanced with SherpAI codebase_analyzer.py + audit-plugin.py*
