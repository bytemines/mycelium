# Overlay Sync

How Mycelium syncs configurations to each tool without overwriting existing settings.

## Strategy

When `mycelium sync` runs, it uses three overlay strategies:

```
                    mycelium sync
                         |
          +--------------+--------------+
          |              |              |
     Skills Sync    MCP Injection   Memory Merge
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

### Memory — Managed Blocks

Memory content is appended as a delimited block at the end of each tool's memory file:

```markdown
# My notes          ← untouched
Custom content       ← untouched
<!-- mycelium -->    ← marker
Shared memory...     ← managed by mycelium
<!-- /mycelium -->   ← marker
```

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
| Memory files | Yes | Appended as managed blocks |
| Env vars / flags | No | Tool-specific |
| Hooks | No | Claude Code-specific lifecycle |
| Plugin versions | No | Marketplace metadata |
| Tool settings | No | Keybindings, themes, UI prefs |
