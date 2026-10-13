# Migration Guide

## How Migration Works

Mycelium migration is **non-destructive**: it reads from your tools and writes only to Mycelium's own store (`~/.mycelium/`). Your tool configs are never modified during scan.

```
Source Tools → scan → ~/.mycelium/ → overlay sync → Target Tools
```

## Commands

```bash
# Preview what will be imported (dry-run)
mycelium migrate

# Execute migration
mycelium migrate --apply

# Migrate from one tool only
mycelium migrate --tool claude-code --apply

# Migrate only skills or MCPs
mycelium migrate --skills-only --apply
mycelium migrate --mcps-only --apply

# Handle conflicts
mycelium migrate --strategy interactive --apply   # pick per conflict
mycelium migrate --strategy latest --apply        # newest wins
mycelium migrate --strategy all --apply           # keep all

# Remove all mycelium-managed entries
mycelium migrate --clear          # dry-run
mycelium migrate --clear --apply  # execute
```

## What Gets Migrated

| Source | What's Imported |
|--------|----------------|
| Skills directories | SKILL.md files with metadata |
| MCP config files | Server definitions (name, command, args, env) |


## Migration Manifest

Every migration is tracked at `~/.mycelium/migration-manifest.json`:
- Which skills/MCPs came from which tool
- Marketplace provenance (which plugin, which source)
- Timestamps for each migration run

## Safe Testing Workflow

```bash
mycelium migrate --snapshot "before-experiment"
mycelium migrate --apply
mycelium sync
# Test your tools...
# If something breaks:
mycelium migrate --restore "before-experiment"
mycelium sync
```

## Snapshots

Stored at `~/.mycelium/snapshots/<name>/`:
- `metadata.json` — name, date, captured-file list, configuration presence, and skill-link targets.
- Selected global configuration files: `manifest.yaml`, `global/mcps.yaml`,
  `global/hooks.yaml`, `migration-manifest.json`, and `marketplaces.yaml` when present.

Snapshots are **selective**, not full backups. They do not copy ordinary skill-directory
contents, project configurations, or `.env.local`. Restoration preserves uncaptured
ordinary directories and unrelated files. New snapshots also record when a known
configuration file was absent, so restoring can remove that later-created file safely.
Legacy snapshots without presence metadata do not infer absence. Back up important
local edits and secrets separately before experimentation.
