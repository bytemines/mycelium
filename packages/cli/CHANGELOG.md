# @mycelish/cli

## 0.2.7

### Patch Changes

- ## What's New in v0.2.7

  ### 🔌 Plugin Partial State — No More False Disables

  Toggling a single skill OFF inside a plugin no longer disables the entire plugin node in the dashboard. Now shows a **partial state** with:
  - **Amber toggle** — stays ON position, turns yellow to indicate mixed state
  - **N/M counter** — shows how many components are still enabled (e.g., "2/3")
  - **Animated edges** — stay active as long as any component is enabled

  ### ⚡ Flicker-Free Toggles

  Dashboard toggles are now instant with zero flicker:
  - Optimistic updates for plugin item toggles
  - Node reference stabilization prevents unnecessary React Flow re-renders
  - Background server sync after optimistic update

  ### 🧹 Memory System Removed

  Every AI tool now handles memory natively — Mycelium's memory layer has been fully removed. This simplifies the codebase and eliminates redundant memory management (~50 tests removed, cleaner config).

  ### 🐛 Fixes
  - Fixed broken logo image in README
  - Removed stale competitive analysis references from tracked files

- Updated dependencies []:
  - @mycelish/core@0.2.7

## 0.2.6

### Patch Changes

- ## v0.2.6
  - Dropped memory support — every AI tool handles memory natively now
  - General cleanup and maintenance

- Updated dependencies []:
  - @mycelish/core@0.2.6

## 0.2.5

### Patch Changes

- # v0.2.5

  ## Improvements
  - **Smarter tool detection** — Improved auto-detection logic for installed AI tools, reducing false positives and ensuring only reachable tools are synced
  - **Removed Aider support** — Aider dropped from tool registry (dual-file config was fragile, low adoption)
  - **MigrateWizard fixes** — Dashboard migration wizard now correctly handles edge cases and displays accurate tool state

  ## Internal
  - AI-driven release pipeline for consistent changelogs and versioning

- Updated dependencies []:
  - @mycelish/core@0.2.5

## 0.2.4

### Patch Changes

- 🚀 **Release pipeline** — non-interactive, AI-friendly release flow via `make release`
  - 📦 Added `scripts/release.sh` + Makefile targets (`release`, `release-minor`, `release-major`)
  - 📝 AI writes the changelog, script handles versioning → build → push → GitHub Actions publishes
  - 🧹 Cleaned up accidental `bin/` build artifacts, updated `.gitignore`

- Updated dependencies []:
  - @mycelish/core@0.2.4

## 0.2.0

### Minor Changes

- MCP Server: expose Mycelium as MCP server (`mycelium mcp`) with 14 tools, 2 resources, 2 prompts, self-registration across all 9 tools
- Universal item sync: all 6 item types (skills, MCPs, agents, rules, commands, memory) now sync across tools
- Plugin takeover: per-component disable within Claude Code plugins (universal across skills/agents/commands)
- Observability: SQLite trace DB with 16 indexed dimensions, auto-snapshot on ERROR, `mycelium report` command
- Smart memory: compression, deduplication, SKILL.md parser, memory scope routing
- Manifest state: single source of truth with universal state verification
- Makefile: `make dev` (Vite HMR), `make prod`, `make stop`, `make build`, `make test`

### Patch Changes

- Fix sidebar layout flash: synchronous toggle state computation via useMemo
- Fix Enable/Disable All button UX: highlight actionable state instead of no-op
- Fix uniform graph node spacing: measured dimensions with second-pass layout
- Fix dashboard plugin toggle reverting: live state from manifest instead of stale cache
- Fix disable/enable now properly adds/removes MCPs from tool configs
- Audit-driven cleanup of config-merger, manifest-state, enable/disable

## 0.1.0

### Minor Changes

- [`63b66f6`](https://github.com/bytemines/mycelium/commit/63b66f6b799656b286b16ffad76931da9b97e7df) Thanks [@bytemines](https://github.com/bytemines)! - Initial public release of Mycelium — Universal AI Tool Orchestrator

### Patch Changes

- Updated dependencies [[`63b66f6`](https://github.com/bytemines/mycelium/commit/63b66f6b799656b286b16ffad76931da9b97e7df)]:
  - @mycelish/core@0.1.0
