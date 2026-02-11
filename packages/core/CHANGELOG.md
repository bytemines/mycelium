# @mycelish/core

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
