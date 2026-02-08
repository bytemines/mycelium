# Mycelium — Developer Guide

## Project Structure

```
packages/
  core/     — shared types, Zod schemas, utilities (@mycelium/core)
  cli/      — Commander-based CLI, all business logic (@mycelium/cli)
  dashboard/ — React + React Flow visualization (@mycelium/dashboard)
```

- `packages/core/src/types.ts` — all shared interfaces (ToolConfig, McpServerConfig, Skill, etc.)
- `packages/core/src/schema.ts` — Zod validation schemas
- `packages/cli/src/commands/` — one file per CLI command (init, sync, status, doctor, etc.)
- `packages/cli/src/core/` — business logic modules (config-merger, symlink-manager, migrator, etc.)
- `packages/dashboard/src/components/` — React components (Graph, panels, wizards)

## Tech Stack

- **Language**: TypeScript (ESM, `"type": "module"` everywhere)
- **Monorepo**: pnpm workspaces + Turborepo
- **CLI**: Commander.js, picocolors for output, yaml for YAML parsing
- **Dashboard**: React 19, @xyflow/react (React Flow), Zustand, Tailwind CSS 4, Radix UI
- **Validation**: Zod 4 (core package)
- **Server**: Express 5 (`mycelium serve` on port 3378)
- **Testing**: Vitest 4 across all packages
- **Node**: >=22 required

## Build & Test

```bash
pnpm install          # install all deps
pnpm build            # turbo build (core first, then cli + dashboard)
pnpm test             # turbo test across all packages
pnpm typecheck        # tsc --noEmit in all packages

# Per-package
cd packages/cli && pnpm test          # 426 tests
cd packages/core && pnpm test         # 28 tests
cd packages/dashboard && pnpm test    # 17 tests
```

## CLI Commands

Binary: `mycelium` (alias `myc`). Key commands:
`init`, `sync`, `status`, `doctor`, `add`, `remove`, `enable`, `disable`,
`teams`, `preset`, `migrate`, `marketplace`, `serve`, `push`, `pull`, `env`

## Code Patterns

### Config Merge (3-tier)
Priority: **Project > Machine > Global**. See `config-merger.ts`.
Project configs can disable items with `enabled: false`.

### Symlink Strategy
Skills are symlinked from `~/.mycelium/skills/` into each tool's skill directory.
`symlink-manager.ts` handles creation and cleanup.

### Overlay Sync
`sync-writer.ts` writes MCPs into tool-native config files (claude.json, settings.json, etc.)
using section-only replacement — it only modifies the mycelium-managed section, preserving user config.

### Machine Overrides
Per-hostname MCP path resolution via `which`. Stored in `~/.mycelium/machines/<hostname>.json`.

### Migration
`migrator.ts` scans tool configs (Claude Code, Codex, Gemini, OpenClaw), generates a plan,
and imports skills/MCPs/memory into mycelium. Manifest tracked at `~/.mycelium/migration-manifest.json`.

### Marketplace
Registry-driven (YAML config at `~/.mycelium/marketplace-registry.yaml`).
Sources are pluggable — add/remove via CLI. `marketplace-registry.ts` manages discovery and state.

## Key Types (packages/core/src/types.ts)

- `ToolId` — union of 6 supported tools
- `ToolConfig` — paths, format, enabled state per tool
- `McpServerConfig` — command, args, env, tool targeting
- `MergedConfig` — result of 3-tier config merge with source tracking
- `MigrationPlan` / `MigrationResult` — migration workflow types
- `MarketplaceEntry` / `PluginInfo` — marketplace and plugin types
- `SnapshotMetadata` — snapshot/restore state
- `TeamConfig` / `AgentConfig` — agent team definitions

## Testing Conventions

- Co-located test files: `foo.ts` has `foo.test.ts` in the same directory
- Exception: `packages/cli/src/__tests__/` for integration-style tests
- Vitest with `vi.mock()` for fs/child_process mocking
- Dynamic imports after mocking: `const { fn } = await import("./module.js")`
- Tests use `describe`/`it`/`expect` from vitest
- Dashboard tests use `@testing-library/react` + jsdom

## Known Gotchas

- `watcher.ts` uses `fs.watch` with `recursive: true` — not supported on Linux
- `preset load` prints planned actions but does not execute enable/disable
- `Graph.tsx` is ~600 lines — should be refactored (extract edge-building, plugin nodes)
- `doctor.ts` checkMcpServerConnectivity spawns actual MCP commands (could use `which` instead)
- Duplicate `memoryLimits` map exists in both `doctor.ts` and `memory-scoper.ts`
