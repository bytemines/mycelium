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

OpenCode exports translate unresolved `${VAR}` references in MCP environment values to
`{env:VAR}`; literal values and other tools' exports are unchanged. OpenCode must inherit
those variables from its launching process. To load local secrets before starting it:

```bash
set -a
source ~/.mycelium/.env.local
set +a
opencode
```

Only source a trusted `.env.local` containing shell-compatible assignments. An already
running OpenCode service may need restarting from that environment to inherit changes.

Keep MCP dependency compatibility pins in `~/.mycelium/global/mcps.yaml`, not just the
generated tool config, so sync preserves them. For example, `mcp_massive` v0.6.0 is
incompatible with Python MCP SDK v2. Preserve its versioned Git source as well as
the SDK constraint until that server supports v2:

```bash
uvx --with 'mcp<2' \
  --from git+https://github.com/massive-com/mcp_massive@v0.6.0 \
  mcp_massive
```

The corresponding `args` are `["--with", "mcp<2", "--from",
"git+https://github.com/massive-com/mcp_massive@v0.6.0", "mcp_massive"]`.

## New Machine Checklist

```bash
npm install -g @mycelish/cli
mycelium init                    # clones config, detects tools
mycelium env setup               # fill in secrets
mycelium sync                    # apply to all tools
mycelium doctor                  # verify everything
```
