# Mycelium Remediation — Orchestration Plan (v2)

**Source:** `docs/plans/2026-02-08-full-codebase-audit.md`

## Pre-applied fixes (already done)
- Removed `class-variance-authority` (unused dep)
- Removed `tailwindcss-animate` (only native animate-spin/pulse used)
- Added Vite proxy (`/api` -> `localhost:3378`) for HMR dev workflow
- Decision: Keep Express 5 (no Hono migration needed)
- Decision: No shadcn/ui needed (raw Radix is sufficient)

---

## Dependency Graph

```
BATCH 1 (Foundation — all parallel, no deps)
├── [A] Shared constants (MYCELIUM_HOME, PORT, MEMORY_LINE_LIMIT)
├── [B] Security fixes (execSync → execFileSync)
├── [C] Dep swaps (chalk→picocolors, drop dotenv, inline cors)
├── [D] Dashboard fixes (React.memo, dead hooks, silent catches, Status type)
└── [E] Core cleanup (ENTRY_TYPE_META move, dual types, DashboardState types)

BATCH 2 (Modularization — depends on Batch 1A completing)
├── [F] Split migrator.ts → migrator/
├── [G] Split doctor.ts → health-checks/
├── [H] Dedupe MCP writing + extract TOML helper + split tool-adapter.ts
├── [I] Split server.ts → routes/ + error middleware
└── [J] Split add.ts + marketplace.ts + kill custom YAML parser

BATCH 3 (Polish — depends on Batch 2 completing)
├── [K] Delete deprecated exports + dead writers (after H)
├── [L] A11y: Radix Dialog focus traps, aria roles
├── [M] Perf: lazy-load elkjs, extract Graph.tsx builder, stabilize refs
├── [N] Add tests for 7 untested files (after F,G,I,J)
└── [P] VERIFY: typecheck + test + codebase_analyzer (after ALL above)
```

## Batch Details

### Batch 1 — 5 PARALLEL agents

| Agent | Touches | Blocked by |
|-------|---------|------------|
| constants-agent | fs-helpers.ts + 9 files | nothing |
| security-agent | init.ts, remote.ts | nothing |
| deps-agent | all CLI .ts files, package.json | nothing |
| dashboard-agent | nodes/*.tsx, hooks/, dashboard-store.ts, 5+ files | nothing |
| core-agent | core/types.ts, core/schema.ts, dashboard imports | nothing |

### Batch 2 — 5 PARALLEL agents

| Agent | Touches | Blocked by |
|-------|---------|------------|
| migrator-agent | migrator.ts → migrator/, tests, imports | Batch 1A (constants) |
| doctor-agent | doctor.ts → health-checks/, tests | Batch 1A (constants) |
| adapter-agent | sync-writer, mcp-injector, tool-adapter, new toml-helpers | Batch 1A (constants) |
| server-agent | server.ts → routes/, serve.ts | Batch 1A (constants) |
| commands-agent | add.ts, marketplace.ts, marketplace-registry.ts | Batch 1A (constants) |

### Batch 3 — 4 PARALLEL + 1 sequential verifier

| Agent | Touches | Blocked by |
|-------|---------|------------|
| cleanup-agent | mcp-injector.ts, sync-writer.ts, migrator/ | Batch 2 adapter-agent |
| a11y-agent | PluginDetailPanel, MarketplaceBrowser, Dashboard | nothing (Batch 2 done) |
| perf-agent | Graph.tsx, graph-builder.ts | nothing (Batch 2 done) |
| test-agent | 7 new test files | ALL Batch 2 |
| **verify-agent** | read-only | **ALL Batch 3** |

## Estimated wall clock: ~5 hours (15 agents)
