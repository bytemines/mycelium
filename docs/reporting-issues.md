# Reporting Mycelium Issues

Mycelium includes built-in tracing and diagnostics to help identify and report issues quickly.

## Quick Start

If something isn't working:

```bash
# See recent errors
mycelium report --level error --since 1h --format table

# Check system health
mycelium doctor
```

## Using `mycelium report`

The `report` command queries the trace database and outputs filtered results.

### Filter by what you're investigating

```bash
# A specific MCP server
mycelium report --item postgres-mcp --format table

# A specific tool
mycelium report --tool cursor --level error --format table

# A specific command
mycelium report --cmd sync --since 30m --format table

# Items from a specific plugin
mycelium report --source superpowers --format table

# Disabled items (manifest v2 state)
mycelium report --state disabled --format table
```

### Combine filters

```bash
# MCP errors in Cursor during sync
mycelium report --cmd sync --scope mcp --tool cursor --level error

# All skill operations in the last day
mycelium report --scope skill --since 1d --format table
```

### Output formats

| Format | Use for |
|--------|---------|
| `--format table` | Human reading in terminal |
| `--format jsonl` | AI tool analysis (default) |
| `--format json` | Programmatic use |

### Generate a full report

```bash
# Full report with environment info
mycelium report --item postgres-mcp --full --output report.jsonl
```

This includes trace entries + environment metadata (OS, Node version, hostname).

## Using the AI Debug Skill

If you use an AI coding tool (Claude Code, Cursor, Codex, etc.), the `debug-mycelium` skill teaches it how to diagnose issues:

1. Describe the problem to your AI tool
2. It will run `mycelium report` with appropriate filters
3. It will run `mycelium doctor` for health checks
4. It will check the manifest state
5. It will produce a structured report with root cause and fix

The skill is automatically synced to your AI tools via `mycelium sync`.

## Filing a Bug Report

1. Generate a report:
   ```bash
   mycelium report --full --since 1h --level warn,error --output /tmp/mycelium-report.jsonl
   ```

2. Review it for sensitive data (the report may contain file paths and environment info)

3. Create an issue at https://github.com/bytemines/mycelium/issues with:
   - What you were trying to do
   - What happened instead
   - The report file contents (or attach the file)

## Trace Snapshots

When an error occurs, Mycelium automatically saves a trace snapshot to:

```
~/.mycelium/traces/snapshots/
```

These are JSONL files containing all trace entries from the command that failed. You can attach these directly to bug reports.

## Privacy

Traces may contain:
- File paths on your system
- MCP server names and commands
- Tool names and versions
- Environment variable names (not values)

They do NOT contain:
- Environment variable values
- File contents
- Authentication tokens
- Config file contents

Review any report before sharing publicly.
