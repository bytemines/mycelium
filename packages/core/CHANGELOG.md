# @mycelish/core

## 0.3.2

### Patch Changes

- ## v0.3.2

  ### New Features
  - **Root-level SKILL.md support** — single-skill repos (e.g., `blader/humanizer`) are now detected and installable directly
  - **Installed status tracking** extended to all item types (agents, commands, rules, hooks) + plugin bundle detection
  - **Dashboard improvements** — Bezier default edges, persistent MarketplaceBrowser state across tab switches, favicon, Brave browser compositing fix
  - **Auto-sync** after `mycelium add skill` and `mycelium add mcp`

  ### Fixes
  - **Complete memory system removal** — cleaned 20 files with leftover memory references in API routes, dashboard components, CLI init scaffolding, descriptions, MCP tool metadata, and test fixtures
  - Debounced search and initial load on mount in MarketplaceBrowser
  - URL pass-through in install flow for proper path resolution

## 0.3.1

### Patch Changes

- ## 🔌 Native Plugin Removal & Type-Aware Registration

  **Plugin removal now works for all plugin types** — both native Claude Code plugins and Mycelium-managed takeover plugins. Previously, removing a native plugin like GLM silently failed because it only checked `takenOverPlugins`.

  **Marketplace installs register items in the correct manifest section.** Skills go to `manifest.skills`, agents to `manifest.agents`, MCPs to `manifest.mcps` — no more phantom entries from bundle-type installs.

  ## 📊 Agents, Commands & Rules in Dashboard Graph

  The dashboard graph now renders **agents** (amber), **commands** (cyan), and **rules** (violet) as first-class nodes with distinct edge colors, toggle switches, and sidebar click handling. Marketplace-sourced item groups (e.g., SherpAI) appear as plugin nodes even when they're not Claude Code plugins.

  ## 🧹 DRY Refactors
  - Extracted `loadFileItems()` helper in `state.ts` (3 copy-paste blocks → 1 function + `Promise.all`)
  - Consolidated agent/command/rule graph node generation into a single loop
  - Added `rules` to `ManifestConfig`, `ItemType`, and `ITEM_SECTIONS`

## 0.3.0

### Minor Changes

- # v0.3.0

  ## ⭐ Star Enrichment & Smart URL Resolution
  - **ungh.cc priority chain** — fetch GitHub stars via free ungh.cc API first, falling back to GitHub API (with token → unauth). No more silent rate-limit failures.
  - **npm → GitHub URL resolution** — MCP Registry entries with npm packages but no repository URL now get their GitHub repo resolved automatically via npm registry metadata.
  - **Batch limit bumped** from 10 → 30 repos per enrichment pass, so more items get stars.
  - **Path traversal protection** — owner/repo validation in `parseGitHubUrl` rejects crafted URLs.

  ## 🔒 Secret Protection
  - **Auto-extract hardcoded API keys** from `mcps.yaml` — detects secrets in MCP config values, moves them to `.env.local`, and replaces with `${ENV_VAR}` references.

  ## 🛒 Marketplace UX v2
  - **Deep refactor** of marketplace browse, search, and remove commands with improved output formatting.
  - **Plugin update detection** from marketplace repos + URL display for popular skills.
  - **Generic marketplace cache** with 48h TTL for faster repeated searches.
  - **Generic GitHub marketplace searcher** with auto-sync for community skill repos.
  - **Trust badges** and security scanner for marketplace entries.

  ## 🔄 Version Tracking & Updates
  - **Version tracking** with update notifications — `mycelium status` shows when newer versions are available.
  - **Plugin-origin version tracking** with hash-based migration for existing installs.

  ## 🎨 Dashboard
  - **Clean URL routing** — switched from hash URLs to clean paths (`/migrate`, `/marketplace`, etc.).

  ## 🐛 Fixes
  - Plugin skill toggle now shows partial state instead of incorrectly disabling the whole plugin.
  - Plugin update detection from marketplace repos works correctly.
  - Purge support added to `remove` command.

## 0.2.8

### Patch Changes

- ## v0.2.8

  ### Generic GitHub Marketplace

  Any GitHub repo added as a marketplace source now **automatically becomes searchable and installable** — no hardcoded searchers needed.
  - Add a GitHub repo URL via dashboard or CLI → Mycelium scans it for skills, agents, and commands
  - Install items directly from any GitHub marketplace (downloads from `raw.githubusercontent.com`)
  - **Auto-sync after install**: items are immediately symlinked to Claude Code, Codex, and all other enabled tools
  - Dynamic GitHub marketplaces appear in popular/browse alongside built-in sources

  ### Purge Command

  New `--purge` flag for `mycelium remove` that **permanently deletes files** instead of just marking as deleted:
  - Removes source files from `~/.mycelium/global/`
  - Cleans up symlinks from all tool directories
  - Dashboard: one-click purge with confirmation dialog
  - Deleted items are now fully hidden from the dashboard graph

  ### Bug Fixes
  - **Fix skill directory scanning** — `loadSkillItems` now correctly scans `skills/name/SKILL.md` directories (was only scanning files)
  - **Fix dashboard source filtering** — marketplace pills, dropdown, and results grid all filter correctly by source
  - **Fix auto-sync pipeline** — installing from marketplace now triggers sync to all tools automatically
  - **Clean up memory system remnants** — removed `memory` from `ItemType`, `ITEM_SECTIONS`, and `state-verifier`
  - **Fix test mock leakage** — config-merger tests properly isolate between test cases

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

## 0.2.6

### Patch Changes

- ## v0.2.6
  - Dropped memory support — every AI tool handles memory natively now
  - General cleanup and maintenance

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
