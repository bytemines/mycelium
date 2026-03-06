# Overlay Sync

How Mycelium syncs configurations to each tool without overwriting existing settings.

## Strategy

When `mycelium sync` runs, it uses three overlay strategies:

```
                    mycelium sync
                         |
          +--------------+--------------+
          |              |              |
     Skills Sync    MCP Injection    File Sync
```

### Skills — Symlinks

Skills are symlinked from `~/.mycelium/skills/<name>` into each tool's skills directory. The original skills directory is untouched.

```
tool/skills/my-skill → ~/.mycelium/skills/my-skill
```

### MCPs — Section Injection

MCP configs are injected into each tool's native config file (JSON, TOML, or YAML) using section markers. Only the managed section is replaced on each sync.

```json
{
  "mcpServers": {
    "user-mcp": {},       // untouched — user's own config
    "mycelium-mcp": {}    // injected by mycelium
  }
}
```

### File-Based Items — Symlink / Copy

Agents, rules, and commands are synced as files into each tool's directory:

- **Agents**: Symlinked from `~/.mycelium/agents/` into each tool's agents directory
- **Rules**: Copied into each tool's rules directory (VS Code exception: symlinked)
- **Commands**: Symlinked from `~/.mycelium/commands/` into each tool's commands directory

## Key Guarantees

- **Read-only scan**: `mycelium migrate` never modifies source tool configs
- **Snapshot before write**: Every sync creates a snapshot you can restore
- **Overlay, not overwrite**: Symlinks and injected sections are clearly marked
- **Clean removal**: `mycelium migrate --clear` removes only mycelium-managed entries

## Portable vs Non-Portable

| Config Type | Portable | Notes |
|-------------|:--------:|-------|
| Skills (SKILL.md) | Yes | Symlinked to all enabled tools |
| MCP servers | Yes | Translated to each tool's format |
| Agents | Yes | Symlinked to all tools with agents capability |
| Rules | Yes | Copied to all tools with rules capability |
| Commands | Yes | Symlinked to all tools with commands capability |
| Hooks | Yes | Synced across Claude Code, Codex, Gemini, OpenCode, OpenClaw, Cursor |
| Env vars / flags | No | Tool-specific |
| Plugin versions | No | Marketplace metadata |
| Tool settings | No | Keybindings, themes, UI prefs |
