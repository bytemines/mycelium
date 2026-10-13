# Mycelium CLI

Synchronize AI-tool skills, MCP servers, agents, rules and commands from one configuration.

Requires **Node.js 22.13 or newer**. Install from npm:

```bash
npm install -g @mycelish/cli
mycelium --version
mycelium init
mycelium sync
```

`myc` is an alias for `mycelium`. Run `mycelium --help` for available commands.

```bash
mycelium serve  # local dashboard/API on 127.0.0.1:3378
mycelium mcp    # stdio MCP integration
```

The dashboard is a **local, single-user tool**, not an authenticated remote service.
Do not expose its API through an untrusted proxy. Secrets belong in the ignored
`~/.mycelium/.env.local`, never in committed configuration or reports.

Synchronization preserves unmanaged entries and user-edited copies. Explicit item
removal and rollback affect managed entries; snapshots are selective, not full backups
of all skill-directory contents. Back up important local work separately.

[Documentation and source](https://github.com/bytemines/mycelium). MIT license;
the package includes the project license in `dist/LICENSE`.
