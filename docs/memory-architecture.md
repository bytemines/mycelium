# Memory Architecture

## Overview

Mycelium manages memory across 9 AI coding tools using a scope-based routing system.
Memory files (Markdown) are stored centrally and distributed to each tool during sync.

## How It Works

### Storage

```
~/.mycelium/global/memory/
├── shared/      # Synced to ALL 9 tools
│   └── *.md
├── coding/      # Synced to 8 tools (excludes OpenClaw)
│   └── *.md
└── personal/    # Synced to OpenClaw only
    └── *.md
```

### Sync Flow

1. `mycelium sync` (or watch mode) triggers memory sync
2. For each enabled tool, Mycelium:
   a. Loads `.md` files from applicable scope directories
   b. Merges and deduplicates across scopes (line-level)
   c. Compresses if tool has a line limit (Claude Code: 200 lines)
   d. Writes to tool's global memory path

### Tool Memory Paths

| Tool | Memory Path | Scopes | Max Lines |
|------|-------------|--------|-----------|
| Claude Code | `~/.claude/CLAUDE.md` | shared, coding | 200 |
| Codex | `~/.codex/AGENTS.md` | shared, coding | — |
| Gemini CLI | `~/.gemini/GEMINI.md` | shared, coding | — |
| OpenClaw | `~/.openclaw/MEMORY.md` | shared, personal | — |
| OpenCode | `~/.opencode/context.md` | shared, coding | — |
| Aider | `~/.aider/MEMORY.md` | shared, coding | — |
| Cursor | _(no global memory)_ | shared, coding | — |
| VS Code | _(no global memory)_ | shared, coding | — |
| Antigravity | `~/.gemini/antigravity/rules.md` | shared, coding | — |

### Watch Mode

`mycelium sync --watch` monitors `~/.mycelium/` for changes.
When `.md` files in memory scope directories change, sync re-runs automatically.

### Compression

When a tool has a line limit, content is compressed by priority:
1. **Headers** (lines starting with `#`) — always kept
2. **Key insights** (lines matching `Bug:`, `Fix:`, `Pattern:`, etc.) — kept
3. **Recent content** — fills remaining space

## Migration

`mycelium migrate` scans tool configs and imports memory files to
`~/.mycelium/global/memory/shared/`. Tracked in `~/.mycelium/migration-manifest.json`.

## Future: Anthropic Memory Tool Integration

Mycelium includes types for the Anthropic Memory Tool protocol (`memory_20250818`),
defined in `packages/core/src/memory-tool-types.ts`.

### What is the Anthropic Memory Tool?

A client-side tool (beta) that lets Claude store and retrieve information across
conversations through a `/memories` file directory. Claude makes tool_use calls,
your application executes them locally.

- **Beta header:** `context-management-2025-06-27`
- **Tool type:** `memory_20250818`
- **6 commands:** `view`, `create`, `str_replace`, `insert`, `delete`, `rename`
- **Supported models:** Opus 4-4.6, Sonnet 4-4.5, Haiku 4.5
- **SDK helpers:** `betaMemoryTool` (TypeScript), `BetaAbstractMemoryTool` (Python)
- **Integrates with:** Context editing, compaction for indefinite-length workflows

### How Mycelium Will Use It

When Mycelium is exposed as an MCP server (planned feature A4), it can implement
this protocol to serve as the memory backend for any Claude-powered agent. This
bridges native tool memory with the Anthropic API's memory system — the same
scoped memory files that sync to 9 tools can also serve Claude API agents.

See: https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool
