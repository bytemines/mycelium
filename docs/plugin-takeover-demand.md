# Plugin Takeover: Community Demand

## The Problem

AI coding tools lack granular control over plugin skills and MCP tools. Users install plugins that bundle many skills but can only toggle entire plugins on/off — there is no way to disable individual skills within a plugin or individual tools within an MCP server. Even the plugin-level toggle is broken in Claude Code.

## GitHub Issues (anthropics/claude-code)

| Issue | Title | Upvotes | Comments | Status |
|-------|-------|---------|----------|--------|
| [#7328](https://github.com/anthropics/claude-code/issues/7328) | MCP Tool Filtering: Allow Selective Enable/Disable of Individual Tools from Servers | 204 | 74 | Open |
| [#14920](https://github.com/anthropics/claude-code/issues/14920) | Add ability to disable individual Claude plugin skills | 14 | 4 | Open |
| [#13344](https://github.com/anthropics/claude-code/issues/13344) | Plugin enable/disable ignored — all skills loaded regardless of settings | 9 | 6 | Open |
| [#9996](https://github.com/anthropics/claude-code/issues/9996) | Plugin marketplace UI shows plugins as disabled but their tools remain available | 4 | 9 | Closed |

**Total community signal: 231+ upvotes across 4 issues, 93 comments.**

### Issue #7328 — MCP Tool Filtering (204 upvotes)

The highest-voted open feature request. Users with large MCP servers (e.g., filesystem server with 20+ tools) cannot restrict which tools are active. This causes context pollution, performance degradation, and security concerns. The reporter notes GitHub Copilot already solved this with a "Configure Tools" UI.

### Issue #14920 — Per-Skill Disable (14 upvotes)

Users who install a plugin like `commit-commands` only want specific skills (e.g., `:commit`) but are forced to load all of them (`:commit-push-pr`, `:clean_gone`, etc.).

### Issue #13344 — Plugin Toggle Broken (9 upvotes)

Claude Code recursively scans the entire plugin source directory for SKILL.md files, ignoring the explicit `skills` array whitelist in `marketplace.json`. Disabling a plugin has zero effect — all skills from the directory are loaded regardless. The reporter calls the architecture "broken."

### Issue #9996 — UI State Mismatch (4 upvotes)

The `/plugin` UI shows plugins as disabled but their MCP tools and skills remain available in the session. Restarting Claude Code does not fix it.

## Existing Solutions

Some tools have implemented per-skill or per-tool filtering: GitHub Copilot offers a "Configure Tools" UI with per-tool checkboxes, MetaMCP provides namespace-based filtering with per-tool enable/disable, and OpenSkills supports per-skill management via `openskills manage`. Claude Code does not yet offer this granularity natively.

## How Mycelium Solves This

Mycelium's **plugin takeover** feature provides the missing granularity:

1. **`mycelium disable <plugin>/<skill>`** — Disable a single skill from a plugin while keeping the rest enabled
2. **`mycelium disable <plugin>/<mcp-tool>`** — Disable a single MCP tool from a server
3. **Manifest-tracked state** — All per-item state is stored in `manifest.yaml` with `pluginOrigin` tracking
4. **Sync-aware** — Disabled items are excluded from sync-writer output, so tools never see them
5. **Dashboard toggle** — Visual per-item switches in the React Flow graph
6. **Cross-tool** — Works across all 8 supported tools, not just Claude Code

This directly addresses issues #7328, #14920, #13344, and #9996 without requiring any changes to Claude Code itself.

For full technical details, see [docs/plugin-takeover.md](./plugin-takeover.md).
