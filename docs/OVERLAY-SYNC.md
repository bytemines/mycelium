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

MCPs are reconciled by explicitly managed name. JSON/JSONC and TOML updates preserve
unmanaged MCP entries and unrelated settings; explicit tombstones remove known names.
Managed entries are rebuilt from their declared configuration. JSON rewriting may
change formatting, so this is not byte-for-byte preservation.

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

Copied files have a small ownership record containing source identity and content
hash. Unowned files, user-edited copies, and original backups are preserved; only
verified unchanged managed copies can be updated or removed automatically.

## Key Guarantees

- **Read-only scan**: `mycelium migrate` never modifies source tool configs
- **Selective snapshots**: Create one explicitly with `mycelium migrate --snapshot <name>`;
  ordinary sync does not create a full-state snapshot. Trace snapshots on errors are diagnostics.
- **Overlay, not blanket overwrite**: Managed names and verified ownership delimit changes;
  malformed configurations fail rather than being replaced with empty objects.
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
