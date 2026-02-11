# Capability Matrix

This document maps every supported tool to its capabilities, sync mechanisms, and file paths. It is derived from the **Tool Registry** (`packages/core/src/tools/`), the single source of truth.

## Matrix Overview

| Tool | Skills | MCPs | Agents | Rules | Hooks | Commands | Memory |
|------|--------|------|--------|-------|-------|----------|--------|
| Claude Code | Symlink | Config (json) | Symlink | - | Config | - | Write |
| Codex CLI | Symlink | Config (toml) | - | Copy | Config | - | Write |
| Gemini CLI | Symlink | Config (json) | - | - | Config | - | Write |
| OpenCode | Symlink | Config (json) | Symlink | - | Config | Symlink | Write |
| OpenClaw | Symlink | Config (json) | - | - | Copy | - | Write |
| Cursor | - | Config (json) | Symlink | Copy | Config | Symlink | Write |
| VS Code | Symlink | Config (jsonc) | Symlink | Symlink | - | - | Write |
| Antigravity | Symlink | Config (json) | Symlink | - | - | - | Write |

**Legend:**
- **Symlink** — Mycelium creates symlinks from the central store into the tool's directory
- **Config** — Mycelium writes entries into the tool's native config file (format in parentheses)
- **Copy** — Mycelium copies files into the tool's directory (used when the tool doesn't support symlinks)
- **Write** — Mycelium writes/appends to the tool's memory file
- **-** — Not supported by this tool

## Detailed Paths

### Claude Code

| Item Type | Mechanism | Global Path | Project Path |
|-----------|-----------|-------------|--------------|
| Skills | Symlink | `~/.claude/skills/` | `.claude/skills/` |
| MCPs | Config (json) | `~/.claude.json` (`mcpServers`) | `.claude/mcp.json` |
| Agents | Symlink | `~/.claude/agents/` | `.claude/agents/` |
| Hooks | Config | `~/.claude/settings.json` | - |
| Memory | Write | `~/.claude/CLAUDE.md` | `CLAUDE.md` |

### Codex CLI

| Item Type | Mechanism | Global Path | Project Path |
|-----------|-----------|-------------|--------------|
| Skills | Symlink | `~/.codex/skills/` | - |
| MCPs | Config (toml) | `~/.codex/config.toml` (`mcp.servers`) | - |
| Rules | Copy | - | `.codex/rules/` |
| Hooks | Config | `~/.codex/config.toml` | - |
| Memory | Write | `~/.codex/AGENTS.md` | `AGENTS.md` |

### Gemini CLI

| Item Type | Mechanism | Global Path | Project Path |
|-----------|-----------|-------------|--------------|
| Skills | Symlink | `~/.gemini/extensions/` | - |
| MCPs | Config (json) | `~/.gemini/settings.json` (`mcpServers`) | - |
| Hooks | Config | `~/.gemini/settings.json` | - |
| Memory | Write | `~/.gemini/GEMINI.md` | `GEMINI.md` |

### OpenCode

| Item Type | Mechanism | Global Path | Project Path |
|-----------|-----------|-------------|--------------|
| Skills | Symlink | `~/.config/opencode/plugin/` | - |
| MCPs | Config (json) | `~/.config/opencode/opencode.json` (`mcp`, opencode shape) | - |
| Agents | Symlink | `~/.config/opencode/agents/` | `.opencode/agents/` |
| Hooks | Config | `~/.config/opencode/settings.json` | - |
| Commands | Symlink | `~/.config/opencode/commands/` | - |
| Memory | Write | `~/.opencode/context.md` | - |

### OpenClaw

| Item Type | Mechanism | Global Path | Project Path |
|-----------|-----------|-------------|--------------|
| Skills | Symlink | `~/.openclaw/skills/` | - |
| MCPs | Config (json) | `~/.openclaw/openclaw.json` (`plugins.entries`, openclaw shape) | - |
| Hooks | Copy | `~/.openclaw/hooks/` | - |
| Memory | Write | `~/.openclaw/MEMORY.md` | - |

### Cursor

| Item Type | Mechanism | Global Path | Project Path |
|-----------|-----------|-------------|--------------|
| MCPs | Config (json) | `~/.cursor/mcp.json` (`mcpServers`) | `.cursor/mcp.json` |
| Agents | Symlink | - | `.cursor/agents/` |
| Rules | Copy (.mdc) | - | `.cursor/rules/` |
| Hooks | Config | - | `.cursor/hooks.json` |
| Commands | Symlink | - | `.cursor/commands/` |
| Memory | Write | - | `.cursorrules` |

**Note:** Cursor rules use `.mdc` format (Markdown Components). Cursor has no global skills path.

### VS Code (GitHub Copilot)

| Item Type | Mechanism | Global Path | Project Path |
|-----------|-----------|-------------|--------------|
| Skills | Symlink | - | `.github/skills/` |
| MCPs | Config (jsonc) | Platform-dependent (see below) | `.vscode/mcp.json` |
| Agents | Symlink | - | `.github/agents/` |
| Rules | Symlink | - | `.github/instructions/` |
| Memory | Write | - | `.github/copilot-instructions.md` |

**MCP global paths by platform:**
- macOS: `~/Library/Application Support/Code/User/mcp.json`
- Linux: `~/.config/Code/User/mcp.json`
- Windows: `%APPDATA%/Code/User/mcp.json`

**Note:** VS Code uses JSONC format (JSON with comments) and the `servers` key (vscode entry shape).

### Antigravity

| Item Type | Mechanism | Global Path | Project Path |
|-----------|-----------|-------------|--------------|
| Skills | Symlink | `~/.gemini/antigravity/skills/` | `.agent/skills/` |
| MCPs | Config (json) | `~/.gemini/antigravity/mcp_config.json` (`mcpServers`) | - |
| Agents | Symlink | - | `.agent/` |
| Memory | Write | `~/.gemini/antigravity/rules.md` | `.antigravity/rules.md` |

## MCP Entry Shapes

Different tools expect MCP server entries in different JSON structures:

| Shape | Tools | Description |
|-------|-------|-------------|
| `standard` | Claude Code, Codex, Gemini CLI, Cursor, Antigravity | `{ command, args, env }` |
| `openclaw` | OpenClaw | Array-based format under `plugins.entries` |
| `opencode` | OpenCode | Nested under `mcp` key |
| `vscode` | VS Code | Under `servers` key in JSONC format |

## Adding a New Tool

To add tool #9 to Mycelium:

1. Create a new `ToolDescriptor` file in `packages/core/src/tools/` (e.g., `new-tool.ts`)
2. Add the import and registry entry in `packages/core/src/tools/_registry.ts`
3. Add an SVG icon to the dashboard assets

The auto-adapter (`packages/cli/src/core/auto-adapter.ts`) will handle sync automatically for tools using standard JSON/JSONC/TOML formats. Only create a custom adapter if the tool has a unique entry shape (like OpenClaw's array format).

See `packages/core/src/tools/_types.ts` for the full `ToolDescriptor` interface.
