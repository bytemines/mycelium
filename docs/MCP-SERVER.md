# Mycelium MCP Server

Mycelium exposes itself as an [MCP](https://modelcontextprotocol.io/) (Model Context Protocol) server, allowing any AI tool to manage configs, memory, and marketplace through the standard protocol.

## Quick Start

Mycelium registers itself automatically during setup:

```bash
mycelium init
```

This writes a `mycelium` entry into the MCP config of every detected tool. Restart your AI tool and the mycelium tools will be available.

### Manual Registration

If you need to register manually, add this to your tool's MCP config:

**Using npx (no global install needed):**

```json
{
  "mycelium": {
    "command": "npx",
    "args": ["-y", "@mycelish/cli", "mcp"]
  }
}
```

**Using global install:**

```json
{
  "mycelium": {
    "command": "mycelium",
    "args": ["mcp"]
  }
}
```

### Config Locations by Tool

| Tool | Config File | Format |
|------|-------------|--------|
| Claude Code | `~/.claude.json` or `.claude/mcp.json` | JSON |
| Cursor | `~/.cursor/mcp.json` | JSON |
| VS Code | `.vscode/mcp.json` | JSONC |
| Codex CLI | `~/.codex/config.toml` | TOML |
| Gemini CLI | `~/.gemini/settings.json` | JSON |
| OpenCode | `~/.config/opencode/config.json` | JSON |
| OpenClaw | `~/.openclaw/config.json` | JSON |
| Aider | `~/.aider/mcp.yaml` | YAML |
| Antigravity | `~/.gemini/antigravity/mcp.json` | JSON |

## Available Tools

### Config Management

| Tool | Description | Parameters |
|------|-------------|------------|
| `mycelium_status` | Show merged config state -- MCPs, skills, memory scopes with state and source | `tool?` (filter by tool ID), `json?` |
| `mycelium_sync` | Push config to all tools (overlay sync -- only touches mycelium-managed sections) | `tool?` (sync only this tool) |
| `mycelium_doctor` | Run health checks -- tool detection, MCP connectivity, config integrity, memory size | `json?` |

### Item Management

| Tool | Description | Parameters |
|------|-------------|------------|
| `mycelium_enable` | Enable a skill, MCP, or plugin and trigger sync | `name`, `type` (mcp/skill/plugin), `scope?` |
| `mycelium_disable` | Disable a skill, MCP, or plugin and trigger sync | `name`, `type`, `scope?` |
| `mycelium_add` | Add a new MCP server or skill to config | `name`, `type`, `command?`, `args?`, `env?`, `scope?` |
| `mycelium_remove` | Remove an item (sets state to "deleted") | `name`, `type`, `scope?` |

### Memory

| Tool | Description | Parameters |
|------|-------------|------------|
| `mycelium_memory_list` | List memory files by scope (shared, coding, personal) | `scope?` |
| `mycelium_memory_read` | Read a memory file's contents | `scope`, `name` |
| `mycelium_memory_write` | Create or overwrite a memory file (synced on next `sync`) | `scope`, `name`, `content` |

Memory files live in `~/.mycelium/global/memory/{shared,coding,personal}/` and are synced to each tool's memory location. See [Memory Architecture](memory-architecture.md) for details.

### Marketplace

| Tool | Description | Parameters |
|------|-------------|------------|
| `mycelium_marketplace_search` | Search configured marketplace sources for skills, MCPs, and plugins | `query`, `source?` |
| `mycelium_marketplace_list_sources` | List all marketplace sources and their status | -- |

### Observability

| Tool | Description | Parameters |
|------|-------------|------------|
| `mycelium_report` | Query the trace database with filters | `tool?`, `level?`, `cmd?`, `scope?`, `item?`, `since?`, `limit?` |

The `since` parameter accepts human-friendly durations: `1h`, `30m`, `1d`, `60s`.

## Resources

MCP resources provide read-only snapshots of Mycelium state:

| Resource | URI | Description |
|----------|-----|-------------|
| Config | `mycelium://config` | Current merged configuration (MCPs, skills, memory scopes with state and source) |
| Tools | `mycelium://tools` | Full tool registry -- all 9 supported tools with capabilities, paths, and formats |

Access resources from any MCP client:

```json
{ "jsonrpc": "2.0", "method": "resources/read", "id": 1, "params": { "uri": "mycelium://config" } }
```

## Prompts

Prompts provide guided workflows that AI tools can use:

| Prompt | Description |
|--------|-------------|
| `debug_mycelium` | Step-by-step diagnostic workflow for troubleshooting Mycelium issues (loads the bundled debug skill) |
| `mycelium_setup` | Interactive setup guide for new users -- walks through doctor, status, init, marketplace, and sync |

## Usage Examples

### From Claude Code

Once registered, you can ask Claude naturally:

- "Use mycelium to check what tools are configured"
- "Search the mycelium marketplace for git-related skills"
- "Write a memory file with our project patterns"
- "Disable the docker MCP and sync to all tools"
- "Show me recent mycelium errors from the last hour"
- "Run mycelium doctor to check system health"
- "Add a new MCP server for my database"

### From Any MCP Client (JSON-RPC)

**List available tools:**

```json
{ "jsonrpc": "2.0", "method": "tools/list", "id": 1 }
```

**Call a tool:**

```json
{
  "jsonrpc": "2.0", "method": "tools/call", "id": 2,
  "params": {
    "name": "mycelium_status",
    "arguments": { "tool": "claude-code" }
  }
}
```

**Sync a specific tool:**

```json
{
  "jsonrpc": "2.0", "method": "tools/call", "id": 3,
  "params": {
    "name": "mycelium_sync",
    "arguments": { "tool": "cursor" }
  }
}
```

**Write a memory file:**

```json
{
  "jsonrpc": "2.0", "method": "tools/call", "id": 4,
  "params": {
    "name": "mycelium_memory_write",
    "arguments": {
      "scope": "shared",
      "name": "patterns.md",
      "content": "# Project Patterns\n\n- Use dependency injection\n- Prefer composition over inheritance"
    }
  }
}
```

**Query traces:**

```json
{
  "jsonrpc": "2.0", "method": "tools/call", "id": 5,
  "params": {
    "name": "mycelium_report",
    "arguments": { "level": "error", "since": "1h", "limit": 20 }
  }
}
```

## Architecture

```
AI Tool (Claude Code, Cursor, VS Code, Gemini CLI, ...)
    |
    | stdio (JSON-RPC over stdin/stdout)
    |
    v
mycelium mcp            <-- @modelcontextprotocol/sdk, StdioServerTransport
    |
    |-- tools/config-tools.ts      -> config-merger, sync-writer
    |-- tools/item-tools.ts        -> config-writer
    |-- tools/memory-tools.ts      -> fs (direct read/write)
    |-- tools/marketplace-tools.ts -> marketplace-registry
    |-- tools/observe-tools.ts     -> trace-store (SQLite)
    |-- resources.ts               -> config-merger, TOOL_REGISTRY
    |-- prompts.ts                 -> bundled skills
    |
    v
Existing Mycelium Business Logic
    |
    v
Tool-native config files (symlinks + overlay sections)
```

The MCP server is a thin layer over existing business logic. Each tool handler validates input with Zod, calls the existing module, and returns JSON. No business logic is duplicated.

### Transport

The server uses **stdio transport** -- the AI tool spawns `mycelium mcp` as a child process and communicates via stdin/stdout using JSON-RPC 2.0. This is the standard MCP transport and works with all MCP-compatible clients.

### Self-Registration

During `mycelium init`, Mycelium writes itself as an MCP entry into every detected tool's config. It detects whether `mycelium` is in PATH (uses direct binary) or falls back to `npx -y @mycelish/cli mcp`. The `mycelium doctor` command includes a health check that verifies self-registration status.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Tools not showing up in AI tool | Run `mycelium doctor` -- check "MCP Self-Registration" section |
| Server not responding | Test: `echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' \| mycelium mcp` |
| Errors in tool calls | Run `mycelium report --cmd mcp --level error --since 1h` |
| Need to re-register | Run `mycelium init` (safe to re-run) |
| Tool shows stale config | Run `mycelium_sync` from the AI tool, or `mycelium sync` from terminal |
| Memory files not syncing | Check scope directories exist: `ls ~/.mycelium/global/memory/` |
| Permission errors | Ensure `~/.mycelium/` is writable; check file ownership |

For more diagnostic workflows, use the `debug_mycelium` prompt or see [Reporting Issues](reporting-issues.md).

## Adding New MCP Tools (Contributors)

To expose a new Mycelium operation as an MCP tool:

1. Choose the appropriate handler file in `packages/cli/src/mcp/tools/` (or create a new one for a new category)
2. Add a `server.registerTool()` call following the existing pattern:
   - Define `inputSchema` using Zod schemas
   - Call existing business logic (never duplicate it)
   - Return `{ content: [{ type: "text", text: JSON.stringify(result) }] }`
3. If you created a new handler file, import and call its register function in `packages/cli/src/mcp/server.ts`
4. Add the tool to the tables in this document
5. Run `pnpm typecheck && pnpm test` to verify
