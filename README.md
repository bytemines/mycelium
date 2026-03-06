<p align="center">
  <h1 align="center">🍄 Mycelium</h1>
  <p align="center"><strong>One config. Every AI tool. Every machine.</strong></p>
  <p align="center">The universal config orchestrator for AI coding tools.<br/>Define your skills, MCPs, agents, rules, and hooks once — sync everywhere.</p>
</p>

<p align="center">
  <a href="https://github.com/bytemines/mycelium/actions"><img src="https://img.shields.io/badge/CI-passing-brightgreen?logo=github" alt="CI" /></a>
  <a href="https://www.npmjs.com/package/@mycelish/cli"><img src="https://img.shields.io/npm/v/@mycelish/cli?color=cb3837&logo=npm" alt="npm" /></a>
  <img src="https://img.shields.io/badge/tools-8%20supported-blueviolet" alt="8 Tools" />
  <img src="https://img.shields.io/badge/tests-732%20passing-brightgreen" alt="732 Tests" />
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License" /></a>
</p>

<p align="center">
  <a href="#-quick-start">Quick Start</a> · <a href="#-why-mycelium">Why Mycelium</a> · <a href="#-features">Features</a> · <a href="#-dashboard">Dashboard</a> · <a href="docs/MCP-SERVER.md">MCP Server</a></p>

<p align="center">
  <img src="demo.gif" alt="Mycelium demo" width="720" />
</p>

---

## The Problem

You use Claude Code, Cursor, Codex, Gemini CLI, and VS Code. Each has its own config format. Each stores skills, MCPs, and agents in different locations. You add an MCP server — now you update 5 config files. You switch machines — now you do it all again.

**Mycelium fixes this.** One config → synced to every tool → on every machine.

---

## 🚀 Quick Start

```bash
npm install -g @mycelish/cli

mycelium init
```

That's it. `init` detects your tools, migrates your existing configs, creates a sync repo, and registers Mycelium as an MCP server in every tool.

```bash
mycelium sync              # Push config to all tools
mycelium sync --watch      # Auto-sync on changes
mycelium serve             # Launch visual dashboard
```

> **New machine?** Run `mycelium init` again — it finds your repo and pulls everything down.

---

## 💡 Why Mycelium

### What makes it different from every other tool

| | Capability | What it means |
|---|-----------|--------------|
| 🎯 | **Per-skill plugin control** | Disable individual skills, agents, or commands within a plugin — without disabling the entire plugin. The only tool that does this. |
| 🧬 | **6 item types sync** | Skills + MCPs + Agents + Rules + Commands + Hooks. Competitors sync 1–2 types. |
| 🛡️ | **Built-in security scanner** | 80+ detection rules scan skills before install. Catches prompt injection, reverse shells, credential harvesting, data exfiltration. |
| 🏗️ | **3-tier config merge** | Project > Machine > Global. Different MCPs per project, different paths per machine. Automatic. |
| 🖥️ | **Visual control plane** | React Flow dashboard — see your entire tool landscape, toggle items, migrate, browse marketplace. |
| 🔌 | **Self-registering MCP server** | Mycelium exposes itself as MCP — any AI tool can manage its own config through natural language. |
| 🩺 | **Doctor with 8 health modules** | Config integrity, MCP connectivity, plugin invariants, tool versions, self-registration, symlinks. |
| 📊 | **Built-in observability** | SQLite trace DB with 16 indexed dimensions, auto-snapshots on errors, queryable reports. |
| 🔄 | **Zero-friction migration** | Scan existing tools, generate a plan, import everything. Dry-run by default. |

---

## ✨ Features

### Plugin Takeover

The most-requested missing feature in Claude Code — granular control over plugin components:

```bash
# Disable a specific skill from a plugin
mycelium disable commit-push-pr
# → Plugin taken over: 'commit-push-pr' disabled, all other skills preserved

# Re-enable it
mycelium enable commit-push-pr
# → Plugin released: all components restored to native mode
```

How it works: When you disable any component from a Claude Code plugin, Mycelium disables the plugin natively, then symlinks all the _enabled_ components from cache. You get per-item control that Claude Code doesn't support natively.

### Universal Sync

```bash
mycelium sync
```

One command writes your config into every tool's native format:

| Tool | Skills | MCPs | Agents | Rules | Hooks | Commands |
|------|:------:|:----:|:------:|:-----:|:-----:|:--------:|
| Claude Code | ✅ | ✅ | ✅ | — | ✅ | — |
| Codex CLI | ✅ | ✅ | — | ✅ | ✅ | — |
| Gemini CLI | ✅ | ✅ | — | — | ✅ | — |
| OpenCode | ✅ | ✅ | ✅ | — | ✅ | ✅ |
| OpenClaw | ✅ | ✅ | — | — | ✅ | — |
| Cursor | — | ✅ | ✅ | ✅ | ✅ | ✅ |
| VS Code | ✅ | ✅ | ✅ | ✅ | — | — |
| Antigravity | ✅ | ✅ | ✅ | — | — | — |

Mycelium never overwrites your config. It uses **overlay sync** — symlinks for skills/agents/commands, section-only writes for MCPs/hooks. Your manual settings are preserved.

### 3-Tier Config Merge

```
~/.mycelium/global/       ← Your base config (everywhere)
~/.mycelium/machines/     ← Per-hostname overrides (different paths per machine)
.mycelium/                ← Per-project config (different MCPs per project)
```

Priority: **Project > Machine > Global**. Conflicts are detected and surfaced.

### Multi-PC Sync

```bash
mycelium push             # Save config to GitHub
mycelium pull             # Pull on another machine
```

Machine-specific paths (like MCP binary locations) are auto-detected per hostname. Secrets stay in `.env.local` (gitignored), templates in `.env.template` (tracked).

### Migration Wizard

```bash
mycelium migrate          # Dry-run: see what would be imported
mycelium migrate --apply  # Import everything
```

Scans all 8 tools for existing skills, MCPs, and hooks. Generates a plan. Handles conflicts with configurable strategies (`--strategy latest|interactive|all`).

### Security Scanner

Every skill and MCP gets scanned before installation — 80+ rules across 20 categories, adapted from [Cisco AI Defense](https://github.com/cisco-ai-defense/skill-scanner) (Apache 2.0):

```bash
mycelium doctor --security          # Scan all installed skills
mycelium add some-skill             # Auto-scans before install
```

Detection categories include prompt injection, command injection, reverse shells, credential harvesting, data exfiltration, hardcoded secrets, cryptomining, and more. The dashboard shows trust badges (Official / Verified / Community) and an inline Audit button on every marketplace card.

### Marketplace & Presets

```bash
mycelium marketplace list           # Browse available plugins
mycelium marketplace plugins        # See installed plugins
mycelium preset save my-react-setup # Snapshot current config
mycelium preset load my-react-setup # Restore it on any machine
```

Pluggable registry sources — add your own skill/MCP repositories. Default sources include npm (OpenSkills), MCP Registry, Anthropic Skills, and awesome-mcp-servers.

---

## 🖥️ Dashboard

```bash
mycelium serve    # → http://localhost:3378
```

- **Graph View** — React Flow visualization of your entire tool landscape: tools, MCPs, skills, plugins, all connected
- **Toggle switches** — Enable/disable any item directly from the graph
- **Migration Wizard** — 4-step guided import from existing tools
- **Marketplace Browser** — Search, install, and audit from configured sources with trust badges and type filters
- **Plugin Detail Panels** — Click any plugin node to manage individual components

---

## 🔌 MCP Server

Mycelium registers itself as an MCP server in all your tools during `init`. This means any AI tool can manage its own config:

```
"Hey Claude, disable the filesystem MCP for this project"
"Add the postgres MCP server to my global config"
"Run mycelium doctor and tell me what's wrong"
```

14 tools, 2 resources, 2 prompts — [full reference →](docs/MCP-SERVER.md)

---

## 📋 All Commands

| Command | Description |
|---------|-------------|
| `mycelium init` | Auto-setup: detect, migrate, sync, register MCP |
| `mycelium sync [--watch]` | Sync to all tools |
| `mycelium status [--json]` | Show sync status across tools |
| `mycelium doctor [--security]` | Health checks + security scan |
| `mycelium add <skill\|mcp>` | Add items to config |
| `mycelium remove <name>` | Remove items |
| `mycelium enable <name> [--tool]` | Enable items (with plugin release) |
| `mycelium disable <name> [--tool]` | Disable items (with plugin takeover) |
| `mycelium migrate [--apply]` | Scan and import from tools |
| `mycelium marketplace list\|plugins` | Browse and manage marketplace |
| `mycelium preset save\|load\|list` | Config presets/profiles |
| `mycelium snapshot create\|restore` | Named config snapshots |
| `mycelium push / pull` | Git-based multi-PC sync |
| `mycelium env list / setup` | Environment variable management |
| `mycelium report [--level] [--since]` | Query traces and generate reports |
| `mycelium teams generate` | Agent team manifests |
| `mycelium mcp` | Start MCP server |
| `mycelium serve` | Start dashboard (port 3378) |

Alias: `myc` — e.g., `myc sync`, `myc status`

---

## 🔧 How It Works

```
┌─────────────────────────────────────────────────────────────┐
│  Your Config (~/.mycelium/)                                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │  Skills   │ │   MCPs   │ │  Agents  │ │  Rules   │  ...  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
└────────────────────────┬────────────────────────────────────┘
                         │  mycelium sync
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  Config Merger (3-tier: project > machine > global)         │
│  Overlay Sync (symlinks + section-only config writes)       │
└────────────────────────┬────────────────────────────────────┘
                         │
        ┌────────┬───────┼───────┬────────┬────────┐
        ▼        ▼       ▼       ▼        ▼        ▼
   Claude     Codex   Gemini  Cursor   VS Code  OpenCode
    Code      CLI      CLI                       + more
```

- **Skills/Agents/Commands**: Symlinked from central store into each tool's directory
- **MCPs**: Written into each tool's native config file (JSON, JSONC, TOML) — only the managed section
- **Hooks**: Written into tool-specific hook config formats
- **Machine overrides**: Per-hostname MCP paths via `which` auto-detection

---

## 🩺 Troubleshooting

```bash
mycelium doctor                           # Run all health checks
mycelium report --level error --since 1h  # Recent errors
mycelium status                           # Sync state per tool
```

| Problem | Solution |
|---------|----------|
| Sync fails for a tool | `mycelium doctor` — checks tool detection and paths |
| Skills not appearing | Verify tool supports the skill directory |
| MCP not connecting | `mycelium status` — check config format per tool |
| Plugin takeover issue | `mycelium doctor` — runs 8 plugin invariant checks |
| Need a bug report | `mycelium report --issue` — generates diagnostic JSONL |

See [Reporting Issues](docs/reporting-issues.md) for the full diagnostic workflow.

---

## 📚 Docs

| Document | Description |
|----------|-------------|
| [Capability Matrix](docs/capability-matrix.md) | Full tool × item type support matrix with paths |
| [MCP Server](docs/MCP-SERVER.md) | MCP tools, resources, prompts reference |
| [Plugin Takeover](docs/plugin-takeover.md) | Per-component plugin control — how it works |
| [Multi-PC Sync](docs/MULTI-PC.md) | Git-based sync, machine overrides, env templates |
| [Migration Guide](docs/MIGRATION.md) | Migration workflow, strategies, and cleanup |
| [Reporting Issues](docs/reporting-issues.md) | Traces, diagnostics, and filing bug reports |
| [Contributing](CLAUDE.md) | Developer guide: structure, conventions, testing |

---

## 📄 License

**MIT** — Like real mycelium shares nutrients between trees without charging a subscription fee. Fork it, grow it, spread it. 🍄
