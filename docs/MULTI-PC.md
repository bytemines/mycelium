# Multi-PC Sync

Mycelium uses Git to synchronize configs across machines. Your `~/.mycelium` directory becomes a Git repo.

## Setup

```bash
# Primary machine — init creates the repo
mycelium init

# New machine — init finds your existing repo
mycelium init
# Or explicit:
mycelium init --repo git@github.com:you/mycelium-config.git
```

## Daily Workflow

```bash
mycelium push                          # commit & push to remote
mycelium push --message "added MCP"    # with custom message
mycelium pull                          # pull + detect overrides + auto-sync
mycelium pull --no-sync                # pull only
mycelium pull --rescan                 # force re-detect machine overrides
```

`mycelium pull` automatically:
1. Runs `git pull` in `~/.mycelium`
2. Checks for missing environment variables
3. Detects machine-specific path overrides
4. Runs `mycelium sync` to apply changes

## Machine Overrides

Different machines may have tools at different paths. Mycelium auto-detects this and stores per-hostname overrides at `~/.mycelium/machines/{hostname}.yaml`.

For example, if shared config references `/opt/homebrew/bin/mcp-server` but the current machine has it at `/usr/local/bin/mcp-server`, the override is applied automatically.

Machine override files are `.gitignore`d — each machine keeps its own.

## Environment Templates

Secrets should not be committed. Mycelium tracks `.env.template` (git-tracked) with variable names, while `.env.local` (gitignored) holds actual values.

```bash
mycelium env list     # see all vars and status (set / missing)
mycelium env setup    # generate .env.local with missing vars
```

## New Machine Checklist

```bash
npm install -g mycelium
mycelium init                    # clones config, detects tools
mycelium env setup               # fill in secrets
mycelium sync                    # apply to all tools
mycelium doctor                  # verify everything
```
