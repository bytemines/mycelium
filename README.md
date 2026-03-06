<p align="center">
  <h1 align="center">🍄 Mycelium</h1>
  <p align="center"><strong>One config. Every AI tool. Every machine.</strong></p>
  <p align="center">Define your skills, MCPs, agents, rules, and hooks once — sync everywhere.</p>
</p>

<p align="center">
  <a href="https://github.com/bytemines/mycelium/actions"><img src="https://img.shields.io/badge/CI-passing-brightgreen?logo=github" alt="CI" /></a>
  <a href="https://www.npmjs.com/package/@mycelish/cli"><img src="https://img.shields.io/npm/v/@mycelish/cli?color=cb3837&logo=npm" alt="npm" /></a>
  <img src="https://img.shields.io/badge/tools-8%20supported-blueviolet" alt="8 Tools" />
  <img src="https://img.shields.io/badge/tests-775%20passing-brightgreen" alt="775 Tests" />
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License" /></a>
</p>

<p align="center">
  <img src="demo.gif" alt="Mycelium demo" width="720" />
</p>

---

## 🚀 Quick Start

```bash
npm install -g @mycelish/cli
mycelium init
```

`init` detects your tools, migrates existing configs, syncs everything, and registers Mycelium as an MCP server in every tool. New machine? Run `init` again.

```bash
mycelium sync              # Push config to all tools
mycelium sync --watch      # Auto-sync on changes
mycelium serve             # Launch visual dashboard
```

---

## ✨ What It Does

| | |
|---|---|
| 🔄 **Universal Sync** | 6 item types × 8 tools. One command. Your manual settings are preserved. |
| 🏗️ **3-Tier Config** | Project > Machine > Global. Different MCPs per project, different paths per machine. |
| 🧩 **Plugin Takeover** | Disable individual skills, agents, or commands within a plugin — without disabling the entire plugin. |
| 💻 **Multi-PC Sync** | Push/pull via Git. MCP paths auto-detected per hostname. Secrets gitignored, templates tracked. |
| 🪄 **Migration Wizard** | Scans all tools, generates a plan, imports everything. Dry-run by default. |
| 🛡️ **Security Scanner** | 80+ rules scan every skill before install. Catches prompt injection, credential harvesting, and more. |
| 🔌 **MCP Server** | Mycelium registers itself as MCP — any AI tool can manage its own config via natural language. |
| 📊 **Observability** | SQLite traces, auto-snapshots on errors, queryable reports. |
| 🖥️ **Dashboard** | React Flow graph, toggle switches, migration wizard, marketplace browser. |
| 🩺 **Doctor** | 8 health modules catch broken symlinks, missing MCPs, and config drift. |

---

## 🎯 Supported Tools

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

---

## 📋 Commands

| Command | Description |
|---------|-------------|
| `mycelium init` | Auto-setup: detect, migrate, sync, register MCP |
| `mycelium sync [--watch]` | Sync to all tools |
| `mycelium status` | Show sync status across tools |
| `mycelium doctor [--security]` | Health checks + security scan |
| `mycelium add / remove` | Add or remove skills and MCPs |
| `mycelium enable / disable` | Enable or disable items (with plugin takeover) |
| `mycelium migrate [--apply]` | Scan and import from existing tools |
| `mycelium marketplace` | Browse and manage marketplace |
| `mycelium push / pull` | Git-based multi-PC sync |
| `mycelium env` | Environment variable management |
| `mycelium report` | Query traces and generate reports |
| `mycelium serve` | Start dashboard on port 3378 |

Alias: `myc` — e.g., `myc sync`, `myc status`

---

## 📚 Docs

- [Capability Matrix](docs/capability-matrix.md) — Full tool × item type support
- [MCP Server](docs/MCP-SERVER.md) — Tools, resources, prompts reference
- [Plugin Takeover](docs/plugin-takeover.md) — Per-component plugin control
- [Multi-PC Sync](docs/MULTI-PC.md) — Machine overrides, env templates
- [Migration Guide](docs/MIGRATION.md) — Workflow and strategies
- [Reporting Issues](docs/reporting-issues.md) — Diagnostics and bug reports

---

📄 MIT License
