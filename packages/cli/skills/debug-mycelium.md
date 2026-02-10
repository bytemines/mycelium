---
name: debug-mycelium
description: Use when mycelium sync fails, items not appearing in tools, enable/disable not working, MCP not connecting, config conflicts between levels, EACCES permission errors, or any unexpected mycelium CLI behavior.
---

# Debug Mycelium

Systematic diagnostic workflow using Mycelium's built-in SQLite trace database. Traces capture 16 dimensions per operation — filter to the exact slice that matters, never read the full DB.

## When to Use

- `mycelium sync` fails or skips items
- Item shows as enabled but doesn't appear in tool config
- Enable/disable has no effect
- MCP server not connecting after sync
- Config conflicts between global/machine/project levels
- Permission errors (EACCES, EPERM)
- Migration imports wrong or missing items
- "It worked before but stopped" scenarios

## Step 1: Gather Context

Ask the user:
- What command were you running? (sync, enable, disable, add, remove, migrate)
- What item is affected? (MCP name, skill name, plugin name)
- Which tool? (cursor, claude-code, vscode, etc.)
- What did you expect vs what happened?

## Step 2: Pull Filtered Traces

Run the `mycelium report` command with appropriate filters. Always start narrow:

```bash
# If user mentions a specific item:
mycelium report --item <name> --since 1h --format table

# If user mentions a specific tool:
mycelium report --tool <tool> --level error,warn --since 1h --format table

# If user mentions a specific command:
mycelium report --cmd <command> --since 1h --format table

# For full context (JSONL for analysis):
mycelium report --item <name> --full --format jsonl
```

**Important**: Always use `--since` to limit results. Never pull the full DB.

## Step 3: Check Health

```bash
mycelium doctor --json
```

Look for:
- Failed config checks (broken YAML/JSON/TOML)
- Broken symlinks (skills not properly linked)
- Missing directories
- MCP connectivity failures

## Step 4: Check Manifest State

```bash
# Read the manifest directly
cat ~/.mycelium/global/manifest.yaml

# Or for project-level:
cat .mycelium/manifest.yaml
```

Look for:
- `state` field: is the item `enabled`, `disabled`, or `deleted`?
- `source` field: where did this item come from?
- Missing items: was the item never added?

## Step 5: Check Tool Config

Read the tool's native config file to verify the sync result:

| Tool | Config Path |
|------|------------|
| Claude Code | `~/.claude.json` or `.claude/settings.json` |
| Cursor | `~/.cursor/mcp.json` |
| VS Code | `~/.vscode/settings.json` |
| Codex | `~/.codex/config.toml` |
| Gemini CLI | `~/.gemini/settings.json` |
| OpenCode | `~/.opencode/config.json` |
| OpenClaw | `~/.openclaw/plugins.json` |
| Aider | `~/.aider/mcp-servers.json` |

Verify the MCP entry exists and has correct structure for that tool's format.

## Step 6: Analyze the Trace

Read the JSONL output from Step 2. Look for these patterns:

### Common Issues

**Item not syncing (state bug)**:
- Check trace for `op: "filter"` entries — was the item filtered out?
- Check `state` dimension — is it `disabled` or `deleted`?
- Check `source` — was it from a plugin that got removed?

**Permission errors**:
- Check trace for `error` containing "EACCES" or "EPERM"
- Check `path` dimension — which file had the permission issue?
- Fix: `chmod` the file or run with appropriate permissions

**Config parse errors**:
- Check trace for `format` dimension — which format failed?
- Check `path` — which config file is malformed?
- Validate the file manually: `cat <path> | python3 -m json.tool`

**Adapter method fallback**:
- Check `method` dimension — did it try "cli" then fall back to "file"?
- Check if the tool's CLI is installed and accessible

**Merge conflicts**:
- Check trace for `configLevel` — which level caused the conflict?
- Check `phase: "merge"` entries for warnings
- Read all 3 config levels: global, machine, project

**Item not found (typo)**:
- Check `item` dimension — does the name have a typo? (e.g., `postgress-mcp` vs `postgres-mcp`)
- Query with LIKE: `mycelium report --item postgres` to find all variants
- Compare against manifest to find the correct name

## Step 7: Generate Report

Once you've identified the issue, create a structured report:

```markdown
## Problem
[1-2 sentence summary of what's broken]

## Root Cause
[What the trace analysis revealed]

## Relevant Trace
\`\`\`
[Paste the key 5-10 trace entries that show the problem]
\`\`\`

## Doctor Output
[Any relevant failed/warning checks]

## Manifest State
[Item state and source from manifest]

## Environment
- OS: [from mycelium report --full]
- Node: [version]
- Mycelium: [version]
- Tool: [affected tool and version]

## Fix
[Suggested fix — either a command to run or a code change to make]
```

## Step 8: Apply Fix or File Issue

If the fix is a user action (config change, permission fix):
- Guide the user through the fix
- Run `mycelium sync` to verify
- Run `mycelium report --item <name> --since 5m` to confirm no more errors

If the fix requires a code change:
- Save the report to a file: `mycelium report --item <name> --full --output /tmp/mycelium-report.jsonl`
- The user can paste the report into a GitHub issue
- Or create a PR directly with the fix

## MCP Server Issues

If the Mycelium MCP server isn't working in an AI tool:

### Tool not showing mycelium MCP tools
1. Check self-registration: `mycelium doctor` (look for "MCP Self-Registration" section)
2. Re-register: `mycelium init` (re-runs self-registration)
3. Check traces: `mycelium report --cmd mcp --level error`

### MCP server hanging or not responding
1. Check if process exists: `ps aux | grep "mycelium mcp"`
2. Test manually: `echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | mycelium mcp`
3. Check for port conflicts if using HTTP transport

### MCP tools returning errors
1. Query recent MCP traces: `mycelium report --cmd mcp --level error,warn --since 1h`
2. Verify config is valid: `mycelium status --json`
3. Run doctor: `mycelium doctor`

## Dimension Reference

These are the filterable dimensions in `mycelium report`:

| Flag | Description | Values |
|------|------------|--------|
| `--cmd` | CLI command | sync, enable, disable, add, remove, migrate, doctor |
| `--scope` | What type | mcp, skill, config, memory, hook, plugin |
| `--tool` | Which tool | claude-code, cursor, vscode, codex, gemini, opencode, openclaw, aider, antigravity |
| `--item` | Item name | any MCP/skill/hook name |
| `--level` | Severity | debug, info, warn, error |
| `--state` | Manifest state | enabled, disabled, deleted |
| `--source` | Item source | plugin name or "manual" |
| `--trace` | Trace ID | sync-abc123 (from trace output) |
| `--project` | Project name | directory name |
| `--since` | Time range | 1h, 30m, 7d, 2026-02-10 |
