# @mycelish/core

## 0.2.5

### Patch Changes

- # v0.2.5

  ## Improvements
  - **Smarter tool detection** — Improved auto-detection logic for installed AI tools, reducing false positives and ensuring only reachable tools are synced
  - **Removed Aider support** — Aider dropped from tool registry (dual-file config was fragile, low adoption)
  - **MigrateWizard fixes** — Dashboard migration wizard now correctly handles edge cases and displays accurate tool state

  ## Internal
  - AI-driven release pipeline for consistent changelogs and versioning

## 0.2.4

### Patch Changes

- 🚀 **Release pipeline** — non-interactive, AI-friendly release flow via `make release`
  - 📦 Added `scripts/release.sh` + Makefile targets (`release`, `release-minor`, `release-major`)
  - 📝 AI writes the changelog, script handles versioning → build → push → GitHub Actions publishes
  - 🧹 Cleaned up accidental `bin/` build artifacts, updated `.gitignore`

## 0.2.0

### Minor Changes

- Tool Registry: ToolDescriptor per tool, auto-adapter factory, `resolvePath()`, `toolsWithCapability()`
- Extended capabilities: agents, rules, commands, hooks across all tools
- MCP Server types and memory tool types (`memory_20250818`)
- MergedConfig extended with agents, rules, commands

## 0.1.0

### Minor Changes

- [`63b66f6`](https://github.com/bytemines/mycelium/commit/63b66f6b799656b286b16ffad76931da9b97e7df) Thanks [@bytemines](https://github.com/bytemines)! - Initial public release of Mycelium — Universal AI Tool Orchestrator
