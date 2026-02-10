# Mycelium Architecture

> Universal AI Tool Orchestrator — syncs skills, MCPs, and memory across 9 AI coding tools.

## Design Philosophy

**Non-destructive overlay.** Mycelium never owns tool config files. It writes only the sections it manages (MCPs, skills, memory) and preserves everything else. Tools remain fully functional without Mycelium installed.

**CLI-first, dashboard-optional.** All operations work through `mycelium` CLI commands. The dashboard is a read-heavy visualization layer that calls the same core functions, served via an Express API on port 3378.

**Git as source of truth.** The canonical configuration lives in `~/.mycelium/`, which is a git repository. Multi-PC sync uses `git push`/`git pull` rather than a proprietary sync service. Machine-specific differences (binary paths, local secrets) are handled through overrides and env templates that stay out of git.

## Package Structure

```
packages/
  core/     Types, Zod schemas, shared constants. Zero business logic.
            No workspace dependencies — imported by both cli and dashboard.
  cli/      Commander.js commands, core business logic, Express API server.
            All Node.js-only code lives here.
  dashboard/ React + React Flow + Zustand. Vite SPA served by the CLI server.
             Communicates with cli via REST API only.
```

Dependencies flow one way: `core` <- `cli`, `core` <- `dashboard`. The CLI and dashboard never import from each other.

## Data Flow

```
~/.mycelium/                          Tool configs
  manifest.yaml    ──> mycelium sync ──> ~/.claude.json (mcpServers)
  global/mcps.yaml                       ~/.codex/config.toml
  global/skills/                         ~/.gemini/settings.json
  global/memory/                         ~/.config/opencode/opencode.json
  machines/{hostname}/overrides.yaml     ~/.openclaw/openclaw.json
  .env.local (gitignored)               ~/.aider/mcp-servers.json
```

Configuration merges three levels with clear precedence: **Project > Machine > Global**. Project configs add to or override globals; they never replace the entire global set. All manifest items (skills, MCPs, plugins) have unified `state: ItemState` ("enabled"|"disabled"|"deleted") and `source: string` fields. State merges follow priority rules, with higher-priority configs overriding lower ones.

## Overlay Sync Strategy

The sync process is designed to be safe and reversible using **read-preserve-write**:

1. **Read** the tool's existing config file in full, preserving user-set properties that Mycelium doesn't manage.
2. **Replace only the Mycelium-managed section** (e.g., `mcpServers` key in JSON, `[mcp.servers.*]` sections in TOML). All other content is preserved byte-for-byte.
3. **Write** the merged result back, maintaining both Mycelium-managed and user-managed properties.

For tools with a native CLI (Claude Code, Codex, Gemini), Mycelium prefers the CLI path (`claude mcp add-json`) over direct file editing. This prevents the tool from overwriting Mycelium's changes on restart. The `ToolAdapter` abstraction routes each operation through CLI when available, falling back to file editing otherwise.

Snapshots are taken before any destructive write, stored in `~/.mycelium/snapshots/`. The `mycelium snapshot restore` command rolls back to any previous state.

## Tool Registry & Auto-Adapter

All tool knowledge lives in `packages/core/src/tools/` as **ToolDescriptor** objects — one file per tool. Each descriptor declares paths, MCP config format, CLI commands, capabilities, memory scopes, and display metadata.

```
packages/core/src/tools/
  _types.ts       ToolDescriptor interface
  _registry.ts    TOOL_REGISTRY + helper functions
  claude-code.ts  codex.ts  gemini-cli.ts  opencode.ts
  openclaw.ts     aider.ts  cursor.ts      vscode.ts  antigravity.ts
```

The **auto-adapter factory** (`packages/cli/src/core/auto-adapter.ts`) generates a `GenericAdapter` from any descriptor, handling JSON/JSONC/TOML formats and all MCP entry shapes automatically. Tools with non-standard formats (OpenClaw's array-based plugins, Aider's dual-file write) provide custom adapters.

**Adding a new tool requires:**
1. One descriptor file in `packages/core/src/tools/` (~30 lines)
2. One import in `_registry.ts`
3. One SVG icon in `packages/dashboard/src/components/icons/svg/`

Everything else — schema validation, adapters, dashboard, memory scoping, sync — is derived from the registry.

## Migration Design

Migration (`mycelium migrate`) follows three principles:

1. **Read-only scan.** Scanners (`scanClaudeCode`, `scanCodex`, etc.) only read tool configs. They never modify source tools.
2. **Snapshot before write.** Before `--apply` writes anything, a full snapshot is created automatically.
3. **Clean removal.** `mycelium migrate --clear` removes only what Mycelium added, tracked via a migration manifest at `~/.mycelium/migration-manifest.json`.

The migration plan is generated first, shown to the user, and only applied with explicit `--apply`. Each migrated item records its provenance (source tool, original path).

## Marketplace Architecture

The marketplace is **registry-driven and pluggable**. Instead of hardcoded source URLs:

1. A YAML registry at `~/.mycelium/marketplace-registry.yaml` lists all marketplace sources.
2. On first run, auto-discovery finds known sources (SkillsMP, MCP Registry, Anthropic skills repo).
3. Users add custom registries via `mycelium marketplace add <name> <url>`.
4. Each registry entry has a type (`remote`, `local`, `github`), an optional URL, and an enabled flag.

Search fans out to all enabled registries in parallel. Install downloads the skill/MCP and registers it in the manifest. The dashboard's MarketplaceBrowser renders results from all sources with source badges.

## Multi-PC Strategy

Problem: MCP server binary paths differ between machines (e.g., `/opt/homebrew/bin/npx` vs `/usr/local/bin/npx`), and API keys should not be in git.

Solution — three mechanisms:

1. **Machine overrides.** `~/.mycelium/machines/{hostname}/overrides.yaml` is auto-detected by hostname. Override files can specify different command paths for MCPs.
2. **Env templates.** `.env.template` is git-tracked with placeholder values. `.env.local` holds real secrets and is gitignored. MCP configs reference variables with `${VAR_NAME}` syntax, resolved at sync time.
3. **Git-based sync.** `mycelium push` and `mycelium pull` wrap git operations. The `.env.local` and `machines/` override files ensure the same git repo works on different machines without manual editing.

## Memory Scoping

Memory files are organized into three scopes:

- **shared** — synced to all tools (preferences, project knowledge)
- **coding** — synced to coding tools only, excluded from OpenClaw (code patterns, architecture decisions)
- **personal** — synced to OpenClaw only (contacts, schedule)

Smart memory compression keeps files within tool-specific line limits (e.g., Claude Code's 200-line MEMORY.md limit) by prioritizing headers and key insights over verbose session logs. Deduplication prevents the same fact from appearing in multiple merged sections.

## Key Technical Decisions

| Decision | Rationale |
|----------|-----------|
| TypeScript monorepo | Same language for CLI and dashboard; shared types via core package |
| React Flow for graph viz | Custom React node components, built-in pan/zoom/minimap, ELK auto-layout |
| Zustand over Redux | Right-sized for a single-page dashboard with optimistic updates |
| Commander.js for CLI | Battle-tested, well-typed, one-file-per-command pattern |
| Express for API server | Serves both REST API and dashboard static files from one process |
| YAML for manifests, JSON for tool configs | YAML is human-editable for Mycelium's own config; JSON matches what most tools expect |
| Symlinks for skills | Zero-copy, real-time sync; changes to skill files are immediately visible to all tools |
| Tool Registry + auto-adapter | One descriptor per tool; auto-adapter handles standard formats; adding a tool is 1 file + 1 SVG |
