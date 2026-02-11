# @mycelish/cli

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
