---
"@mycelish/core": patch
---

Sync custom slash commands to Claude Code. The `claude-code` tool descriptor was missing the `commands` capability and path (`commands: null`), so `mycelium sync` never wrote to `~/.claude/commands/` even though Claude Code supports project/user slash commands (opencode and cursor already declared it). Adds `commands: "~/.claude/commands/"` and the `"commands"` capability, so commands in `~/.mycelium/global/commands/` now sync to Claude Code.
