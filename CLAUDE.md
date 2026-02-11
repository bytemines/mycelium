# Mycelium — Developer Guide

## Project Structure

```
packages/
  core/     — shared types, Zod schemas, utilities (@mycelish/core)
  cli/      — Commander-based CLI, all business logic (@mycelish/cli)
  dashboard/ — React + React Flow visualization (@mycelish/dashboard)
```

- `packages/core/src/types.ts` — shared interfaces (McpServerConfig, Skill, MemoryScope, ItemState, etc.)
- `packages/core/src/tools/` — **Tool Registry**: one ToolDescriptor per tool, auto-derived everything
- `packages/core/src/schema.ts` — Zod validation schemas (toolIdSchema derived from registry)
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
cd packages/cli && pnpm test          # 546 tests
cd packages/core && pnpm test         # 42 tests
cd packages/dashboard && pnpm test    # 17 tests
```

## Release Process

```bash
make release         # patch bump (default)
make release-minor   # minor bump
make release-major   # major bump
```

**How it works (AI-driven):**

1. AI runs `git log <last-tag>..HEAD --oneline` to see all changes since last release
2. AI writes a quality changelog to `/tmp/mycelium-changelog.md`
3. AI runs `make release` (or `make release-minor` / `make release-major`)
4. Script creates changeset → versions → builds → commits → pushes
5. GitHub Actions publishes to npm + creates GitHub release with that version's notes

**Changelog guidelines** — write for `/tmp/mycelium-changelog.md`:

Concise, user-focused. Emojis and any markdown welcome. Link PRs/issues, credit contributors. Keep it short.

## CLI Commands

Binary: `mycelium` (alias `myc`). Key commands:
`init`, `sync`, `status`, `doctor`, `add`, `remove`, `enable`, `disable`,
`teams`, `preset`, `migrate`, `marketplace`, `serve`, `push`, `pull`, `env`, `report`

## Code Patterns

### Config Merge (3-tier)
Priority: **Project > Machine > Global**. See `config-merger.ts`.
All manifest items (skills, MCPs, plugins) have unified `state: ItemState` ("enabled"|"disabled"|"deleted") and `source: string` fields. State is merged using priority rules, with higher-priority configs overriding lower ones.

### Symlink Strategy
Skills are symlinked from `~/.mycelium/skills/` into each tool's skill directory.
`symlink-manager.ts` handles creation and cleanup.

### Overlay Sync
`sync-writer.ts` writes MCPs into tool-native config files (claude.json, settings.json, etc.)
using read-preserve-write strategy — adapters read existing tool configs before writing, preserving user-set properties that Mycelium doesn't manage. Section-only replacement ensures only the mycelium-managed section is modified.

### Machine Overrides
Per-hostname MCP path resolution via `which`. Stored in `~/.mycelium/machines/<hostname>.json`.

### Migration
`migrator.ts` scans tool configs (Claude Code, Codex, Gemini, OpenClaw), generates a plan,
and imports skills/MCPs/memory into mycelium. Manifest tracked at `~/.mycelium/migration-manifest.json`.

### Marketplace
Registry-driven (YAML config at `~/.mycelium/marketplace-registry.yaml`).
Sources are pluggable — add/remove via CLI. `marketplace-registry.ts` manages discovery and state.

### Memory Sync
`memory-scoper.ts` routes memory files from `~/.mycelium/global/memory/{shared,coding,personal}/`
to each tool's global memory path. `smart-memory.ts` handles compression and deduplication.
Watcher triggers re-sync on `.md` file changes in memory scope directories.
See `docs/memory-architecture.md` for full details.

### Observability
`trace-store.ts` stores structured events in SQLite (`~/.mycelium/traces/trace.db`).
`tracer.ts` provides `createTrace()` API — returns a `TraceLogger` with info/warn/error methods.
`global-tracer.ts` manages the singleton instance. Auto-snapshots on ERROR to `~/.mycelium/traces/snapshots/`.
`report.ts` command queries the DB and exports filtered JSONL for LLM consumption.
`debug-mycelium.md` skill teaches AI tools the diagnostic workflow.

Each log entry has 16 dimensions: ts, traceId, level, cmd, scope, op, tool, item, itemType, state, source, configLevel, phase, method, format, project — plus msg, error, dur, path, entryShape, progress, data.

## Tool Registry (packages/core/src/tools/)

Single source of truth for all tool knowledge. 9 tools: Claude Code, Codex, Gemini CLI, OpenCode, OpenClaw, Aider, Cursor, VS Code, Antigravity.

- `_types.ts` — `ToolDescriptor`, `Capability`, `McpFormat`, `McpEntryShape`, `PathSpec`
- `_registry.ts` — `TOOL_REGISTRY`, `ALL_TOOL_IDS`, `resolvePath()`, `toolsWithCapability()`, `toolsForScope()`
- One file per tool (e.g., `claude-code.ts`) exporting a `ToolDescriptor`

**Adding a new tool**: 1 descriptor file + 1 import in `_registry.ts` + 1 SVG icon.

The auto-adapter (`packages/cli/src/core/auto-adapter.ts`) generates adapters from descriptors. Custom adapters exist only for OpenClaw (array format) and Aider (dual-file).

## Key Types (packages/core/src/types.ts)

- `ToolId` — `string` (derived from registry at runtime)
- `ItemState` — `"enabled" | "disabled" | "deleted"` (unified state for all items)
- `McpServerConfig` — command, args, env, tool targeting, state, source
- `SkillManifest` — name, description, tools, state, source
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
- `memoryLimits` in `doctor.ts` could derive from `TOOL_REGISTRY` (currently separate)
- `dryRunSync` doesn't use `entryShape` for vscode/opencode preview (cosmetic)
