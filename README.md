# 🍄 Mycelium

**Universal AI Tool Orchestrator** - Sync skills, MCPs, and memory across Claude Code, Codex CLI, Gemini CLI, OpenCode, OpenClaw, and Aider.

## What is Mycelium?

Just like the fungal networks beneath forest floors connect trees and share nutrients freely, Mycelium connects your AI coding tools and shares configurations across all of them. One config to rule them all.

## Features

- **Skills Sync** - Share skills across all your AI tools via symlinks
- **MCP Injection** - Configure MCP servers once, deploy everywhere
- **Memory Scoping** - Control what each tool knows (shared, coding-only, personal)
- **Config Merging** - Project configs add to globals, not replace them
- **Interactive Dashboard** - React Flow visualization of your entire setup
- **Tool Detection** - Automatically detects which AI tools you have installed

## Quick Start

```bash
# Install globally
npm install -g mycelium

# Initialize
mycelium init --global

# Check status
mycelium status

# Sync everything
mycelium sync
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `mycelium init` | Initialize Mycelium configuration |
| `mycelium sync` | Sync skills, MCPs, and memory to all tools |
| `mycelium status` | Show sync status across all tools |
| `mycelium add skill <name>` | Add a skill from GitHub or local path |
| `mycelium add mcp <name>` | Add an MCP server |
| `mycelium enable <name>` | Enable a skill or MCP |
| `mycelium disable <name>` | Disable a skill or MCP |
| `mycelium doctor` | Check system health and fix issues |

## Supported Tools

- Claude Code
- Codex CLI
- Gemini CLI
- OpenCode
- OpenClaw
- Aider

## License

**MIT** - Just like real mycelium shares nutrients between trees without charging a subscription fee, this project is completely free. No premium spores, no enterprise mushroom edition. Fork it, grow it, spread it. 🍄
