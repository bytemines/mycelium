# Mycelium: Universal AI Tool Orchestrator

**Plan Date:** 2026-02-03
**Status:** Approved
**Author:** Brainstorming Session

> "One Ring to Rule Them All" - A unified orchestration system for AI coding tools

## Executive Summary

**Mycelium** is a cross-platform orchestration system that synchronizes skills, MCP servers, and memory across all major AI coding tools (Claude Code, Codex CLI, Gemini CLI, OpenCode, OpenClaw, Aider).

### Key Differentiators:
- **First to unify memory sync** across tools with scoped privacy controls
- **Merge-based config** (project adds to global, not replaces)
- **Interactive dashboard** with graph visualization
- **Git-native** (source of truth is version controlled)

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                           MYCELIUM                                    │
│           "The Fungal Network for AI Tool Orchestration"             │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │            Web Dashboard (Vite + React + shadcn)                │ │
│  │  ┌─────────────────────────────────────────────────────────┐   │ │
│  │  │              Interactive Graph Overview                  │   │ │
│  │  │   [Tools] ←──→ [Skills] ←──→ [MCPs] ←──→ [Memory]       │   │ │
│  │  │   Click any node to drill down and manage                │   │ │
│  │  └─────────────────────────────────────────────────────────┘   │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                              │                                        │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │                    CLI (mycelium / myc)                         │ │
│  │  sync │ status │ add │ enable │ disable │ doctor │ init        │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                              │                                        │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │                    Core Engine (TypeScript)                     │ │
│  │  • Config Merger (Global + Machine + Project)                  │ │
│  │  • Symlink Manager (Skills)                                    │ │
│  │  • MCP Injector (Per-tool config generation)                   │ │
│  │  • Memory Scoper (Shared vs Coding vs Personal)                │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                              │                                        │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │                 Git Repository (Source of Truth)                │ │
│  │  ~/.mycelium/                                                   │ │
│  │  ├── manifest.yaml       # What's installed, versions          │ │
│  │  ├── .env.example        # Template for secrets                │ │
│  │  ├── .env.local          # Actual secrets (gitignored)         │ │
│  │  ├── global/                                                    │ │
│  │  │   ├── skills/         # Shared skills                       │ │
│  │  │   ├── mcps.yaml       # Global MCP configs                  │ │
│  │  │   └── memory/                                                │ │
│  │  │       ├── MEMORY.md   # Shared knowledge                    │ │
│  │  │       └── coding/     # Coding-specific context             │ │
│  │  └── machines/           # Per-machine overrides               │ │
│  │      └── {hostname}/                                            │ │
│  │          └── overrides.yaml                                     │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                              │                                        │
│         ┌────────────────────┼────────────────────┐                  │
│         ▼                    ▼                    ▼                  │
│  ┌────────────┐      ┌────────────┐      ┌────────────┐             │
│  │Claude Code │      │ Codex CLI  │      │ Gemini CLI │             │
│  │            │      │            │      │            │             │
│  │.claude/    │      │~/.codex/   │      │~/.gemini/  │             │
│  │├─skills/   │      │├─skills/   │      │├─GEMINI.md │             │
│  │├─mcp.json  │      │├─config.toml│     │└─extensions│             │
│  │└─CLAUDE.md │      │└─AGENTS.md │      │            │             │
│  └────────────┘      └────────────┘      └────────────┘             │
│         │                    │                    │                  │
│  ┌────────────┐      ┌────────────┐      ┌────────────┐             │
│  │ OpenCode   │      │  OpenClaw  │      │   Aider    │             │
│  │            │      │            │      │            │             │
│  │.opencode/  │      │~/.openclaw/│      │~/.aider/   │             │
│  │├─plugin/   │      │├─skills/   │      │            │             │
│  │└─context.md│      │└─MEMORY.md │      │            │             │
│  └────────────┘      └────────────┘      └────────────┘             │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

| Component | Technology | Rationale |
|-----------|------------|-----------|
| **CLI** | TypeScript + Node.js | Fast development, same language as dashboard |
| **Dashboard** | Vite + React + shadcn/ui | Modern, fast, beautiful components |
| **Graph Viz** | **React Flow** | Proven by Stripe/Zapier, 35K stars, 4M weekly downloads |
| **Config** | YAML (manifest) + JSON (tool-specific) | Human-readable, Git-friendly |
| **Symlinks** | Native OS symlinks/junctions | Zero overhead, real-time sync |
| **Package** | npm (global install) | Easy distribution: `npm i -g mycelium` |

---

## Graph Visualization: React Flow

### Why React Flow?

After evaluating 10+ options (D3.js, Cytoscape.js, vis.js, Deck.gl, etc.), **React Flow** emerged as the clear winner:

| Aspect | Score | Why |
|--------|-------|-----|
| Interactivity | 9/10 | Drag, zoom, pan, selection built-in |
| Visual Appeal | 8/10 | Custom nodes with React components |
| Ease | 8/10 | Well-documented, active community |
| Performance | 8/10 | Good for 100-500 nodes |
| Mastermind Feel | 9/10 | Powers Stripe, Zapier, Typeform |

### "Mastermind Command Center" Design:

```
┌──────────────────────────────────────────────────────────────────┐
│  MYCELIUM CONTROL CENTER                    🟢 All Systems Go    │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│   ┌─────────────────────────────────────────────────────────┐    │
│   │                   React Flow Canvas                      │    │
│   │                                                          │    │
│   │    ┌───────────┐         ┌───────────┐                  │    │
│   │    │ 🟢 Claude │─────────│   TDD     │                  │    │
│   │    │   Code    │    ┌────│  Skill    │────┐             │    │
│   │    └───────────┘    │    └───────────┘    │             │    │
│   │          │          │          │          │             │    │
│   │    ┌─────┴─────┐    │    ┌─────┴─────┐    │             │    │
│   │    │ 🟢 Codex  │────┘    │  git-mcp  │    │             │    │
│   │    │    CLI    │─────────│  🟢 OK    │────┤             │    │
│   │    └───────────┘         └───────────┘    │             │    │
│   │          │                     │          │             │    │
│   │    ┌─────┴─────┐         ┌─────┴─────┐    │             │    │
│   │    │ 🟢 Gemini │─────────│ MEMORY.md │────┘             │    │
│   │    │    CLI    │         │  shared   │                  │    │
│   │    └───────────┘         └───────────┘                  │    │
│   │                                                          │    │
│   │   [Click any node to manage • Drag to rearrange]        │    │
│   └─────────────────────────────────────────────────────────┘    │
│                                                                   │
│   ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│   │ Skills   │ │  MCPs    │ │ Memory   │ │ Machines │           │
│   │   12     │ │    8     │ │  3 files │ │    2     │           │
│   │ 🟢 synced│ │ 🟢 active│ │ 🟢 synced│ │ 🟢 online│           │
│   └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
└──────────────────────────────────────────────────────────────────┘
```

### Custom Node Types:

```typescript
// Tool Node (Claude Code, Codex, etc.)
const ToolNode = ({ data }) => (
  <div className="tool-node">
    <StatusIndicator status={data.status} />
    <Icon name={data.icon} />
    <span>{data.name}</span>
    <Badge count={data.syncedItems} />
  </div>
);

// Resource Node (Skill, MCP, Memory)
const ResourceNode = ({ data }) => (
  <div className="resource-node">
    <StatusIndicator status={data.status} />
    <span>{data.name}</span>
    <span className="type">{data.type}</span>
  </div>
);
```

### Design Aesthetic:
- **Dark theme** (navy/purple background - NASA mission control feel)
- **Status colors**: 🟢 Green (OK), 🟡 Yellow (Warning), 🔴 Red (Error)
- **Glowing node borders** for active/selected state
- **Animated edges** showing data flow direction
- **Glassmorphic cards** for stats (inspired by n8n)

---

## Configuration Merge Strategy

### The Problem:
Project configs should **ADD** to globals, not replace them.

### The Solution: Three-Level Merge

```
Priority: Project > Machine > Global

MERGE RULES:
1. Global provides base set of skills/mcps/memory
2. Machine can add/override for hardware-specific needs
3. Project can add/override/DISABLE specific items
```

### Example:

```yaml
# ~/.mycelium/global/mcps.yaml (GLOBAL)
mcps:
  git-mcp:
    command: npx
    args: ["@anthropics/git-mcp"]
    enabled: true

  filesystem:
    command: npx
    args: ["@anthropics/filesystem-mcp"]
    enabled: true

# ~/project/.mycelium/mcps.yaml (PROJECT)
mcps:
  database:              # ADD new MCP
    command: npx
    args: ["@myorg/database-mcp"]
    env:
      DB_URL: ${DB_URL}  # From .env.local

  git-mcp:               # OVERRIDE global with custom args
    args: ["@anthropics/git-mcp", "--verbose"]

  filesystem:            # DISABLE for this project
    enabled: false

# RESULT after merge:
# - git-mcp (project args)
# - database (new)
# - filesystem DISABLED
```

---

## Secrets Management

```
~/.mycelium/
├── .env.example          # Template, committed to git
│   # Example:
│   # OPENAI_API_KEY=your-key-here
│   # DATABASE_URL=postgresql://...
│
├── .env.local            # Actual secrets, GITIGNORED
│   OPENAI_API_KEY=sk-xxx
│   DATABASE_URL=postgresql://user:pass@localhost/db
│
└── global/mcps.yaml
    mcps:
      openai-mcp:
        env:
          OPENAI_API_KEY: ${OPENAI_API_KEY}  # Resolved from .env.local
```

---

## Memory Scoping Architecture

### Why Scopes?
- OpenClaw shouldn't see coding patterns (noise)
- Coding tools shouldn't see personal WhatsApp chats (privacy)
- Some knowledge is universal (preferences, projects)

### Three Scopes:

```yaml
# ~/.mycelium/manifest.yaml
memory:
  scopes:
    shared:                    # → All tools
      sync_to: [claude-code, codex, gemini-cli, opencode, openclaw, aider]
      path: global/memory/shared/
      files:
        - preferences.md       # Coding style, tone, etc.
        - knowledge/*.md       # Technical knowledge
        - projects/*.md        # Project context

    coding:                    # → Coding tools only
      sync_to: [claude-code, codex, gemini-cli, opencode, aider]
      exclude_from: [openclaw]
      path: global/memory/coding/
      files:
        - patterns.md          # Code patterns, idioms
        - architecture.md      # System design decisions
        - debugging.md         # Common issues, solutions

    personal:                  # → OpenClaw only
      sync_to: [openclaw]
      exclude_from: [claude-code, codex, gemini-cli, opencode, aider]
      path: global/memory/personal/
      files:
        - contacts.md          # People context
        - schedule.md          # Calendar, reminders
```

### Memory File Mapping:

| Mycelium Source | Claude Code | Codex | Gemini | OpenCode | OpenClaw |
|-----------------|-------------|-------|--------|----------|----------|
| `shared/preferences.md` | CLAUDE.md | AGENTS.md | GEMINI.md | context.md | MEMORY.md |
| `coding/patterns.md` | CLAUDE.md | AGENTS.md | GEMINI.md | context.md | ❌ |
| `personal/contacts.md` | ❌ | ❌ | ❌ | ❌ | MEMORY.md |

---

## Tool Configuration Mapping

Each tool has different config locations and formats:

| Tool | Skills Location | MCP Config | Memory File |
|------|-----------------|------------|-------------|
| **Claude Code** | `~/.claude/skills/` | `~/.claude/mcp.json` | `~/.claude/CLAUDE.md` |
| **Codex CLI** | `~/.codex/skills/` | `~/.codex/config.toml` | `~/.codex/AGENTS.md` |
| **Gemini CLI** | Extensions via JSON | `gemini-extension.json` | `~/.gemini/GEMINI.md` |
| **OpenCode** | `~/.config/opencode/plugin/` | Config | `~/.opencode/context.md` |
| **OpenClaw** | `~/.openclaw/skills/` | MCP via config | `~/.openclaw/MEMORY.md` |
| **Aider** | Via IDE plugins | N/A | N/A |

---

## CLI Commands

### Core Commands (P0):

```bash
# Initialize mycelium in current directory or globally
mycelium init [--global]

# Sync all configurations to all tools
mycelium sync

# Show status of what's synced where
mycelium status

# Show detailed status with graph
mycelium status --graph

# Check system health and fix issues
mycelium doctor
```

### Management Commands (P1):

```bash
# Add a skill from GitHub or local path
mycelium add skill owner/repo
mycelium add skill ./local/skill

# Add an MCP server
mycelium add mcp @anthropics/git-mcp

# Enable/disable for specific tool
mycelium enable skill-name --tool claude-code
mycelium disable mcp-name --tool codex

# Enable/disable globally
mycelium enable skill-name --global
mycelium disable mcp-name --global

# List all installed
mycelium list skills
mycelium list mcps
mycelium list memory
```

### Dashboard Command:

```bash
# Start web dashboard
mycelium dashboard
# Opens http://localhost:3377
```

---

## Dashboard Design

### Single-Page Overview with Interactive Graph

```
┌──────────────────────────────────────────────────────────────────┐
│  MYCELIUM                                    [Sync] [Settings]   │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │                                                            │   │
│  │                    [Interactive Graph]                     │   │
│  │                                                            │   │
│  │      ┌─────────┐      ┌─────────┐      ┌─────────┐        │   │
│  │      │ Claude  │──────│  TDD    │──────│  Codex  │        │   │
│  │      │  Code   │      │ Skill   │      │   CLI   │        │   │
│  │      └─────────┘      └─────────┘      └─────────┘        │   │
│  │           │                │                │              │   │
│  │           │           ┌────┴────┐           │              │   │
│  │           └───────────│ git-mcp │───────────┘              │   │
│  │                       └─────────┘                          │   │
│  │                            │                               │   │
│  │      ┌─────────┐      ┌────┴────┐      ┌─────────┐        │   │
│  │      │ Gemini  │──────│MEMORY.md│──────│OpenCode │        │   │
│  │      │   CLI   │      └─────────┘      │         │        │   │
│  │      └─────────┘                       └─────────┘        │   │
│  │                                                            │   │
│  │  [Toggle: Tool-Centric / Resource-Centric]                │   │
│  │                                                            │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌───────────┐  │
│  │   Skills    │ │    MCPs     │ │   Memory    │ │  Machines │  │
│  │     12      │ │      8      │ │   3 files   │ │     2     │  │
│  │   synced    │ │   active    │ │   synced    │ │  online   │  │
│  └─────────────┘ └─────────────┘ └─────────────┘ └───────────┘  │
│                                                                   │
│  Click any node in the graph or card below to manage             │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### Interaction Model:
1. **Click tool node** → See all skills/mcps/memory synced to that tool
2. **Click skill/mcp node** → See which tools use it, enable/disable
3. **Click memory node** → See scope, edit content
4. **Drag nodes** → Rearrange graph layout
5. **Toggle view** → Switch between tool-centric and resource-centric

---

## Implementation Phases

### Phase 1: Foundation
**Goal:** Core CLI with sync functionality

```
P0 Tasks:
├── Project setup (TypeScript, ESLint, package.json)
├── Config schema design (manifest.yaml, mcps.yaml)
├── mycelium init command
├── mycelium sync command
│   ├── Skills symlink sync (all 6 tools)
│   ├── MCP config generation (per-tool format)
│   └── Memory.md sync (scoped)
├── mycelium status command
└── .env.example/.env.local pattern
```

### Phase 2: Enhanced CLI
**Goal:** Full CLI experience

```
P1 Tasks:
├── mycelium add skill/mcp
├── mycelium enable/disable
├── mycelium doctor (health checks)
├── Machine-level overrides
├── Manifest version tracking
└── Better error messages and recovery
```

### Phase 3: Dashboard
**Goal:** Visual overview and management

```
P1 Tasks:
├── Vite + React + shadcn setup
├── Interactive graph component (React Flow)
├── Stats cards (skills, mcps, memory, machines)
├── Click-to-manage interactions
├── Toggle between view modes
└── Sync button + status indicators
```

### Phase 4: Polish
**Goal:** Production-ready

```
P2 Tasks:
├── Detailed Skills/MCPs/Memory views
├── Webhooks for CI/CD automation
├── Better conflict detection
└── Documentation and examples

P3 (Future):
├── Vector embeddings for semantic search
├── Real-time Gateway sync
├── Skill dependency management
└── Team collaboration features
```

---

## File Structure

```
mycelium/
├── packages/
│   ├── cli/                    # CLI tool
│   │   ├── src/
│   │   │   ├── commands/
│   │   │   │   ├── init.ts
│   │   │   │   ├── sync.ts
│   │   │   │   ├── status.ts
│   │   │   │   ├── add.ts
│   │   │   │   ├── enable.ts
│   │   │   │   └── doctor.ts
│   │   │   ├── core/
│   │   │   │   ├── config-merger.ts
│   │   │   │   ├── symlink-manager.ts
│   │   │   │   ├── mcp-injector.ts
│   │   │   │   └── memory-scoper.ts
│   │   │   ├── tools/          # Tool-specific adapters
│   │   │   │   ├── claude-code.ts
│   │   │   │   ├── codex.ts
│   │   │   │   ├── gemini.ts
│   │   │   │   ├── opencode.ts
│   │   │   │   ├── openclaw.ts
│   │   │   │   └── aider.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── dashboard/              # Web dashboard
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── Graph.tsx
│   │   │   │   ├── StatsCards.tsx
│   │   │   │   └── DetailPanel.tsx
│   │   │   ├── App.tsx
│   │   │   └── main.tsx
│   │   └── package.json
│   │
│   └── core/                   # Shared types and utilities
│       ├── src/
│       │   ├── types.ts
│       │   ├── schema.ts
│       │   └── utils.ts
│       └── package.json
│
├── examples/                   # Example configs
│   ├── global/
│   │   ├── skills/
│   │   ├── mcps.yaml
│   │   └── memory/
│   └── project/
│       └── .mycelium/
│
├── package.json                # Monorepo root
├── turbo.json                  # Turborepo config
└── README.md
```

---

## Verification Plan

### Manual Testing:

1. **Init Test:**
   ```bash
   mycelium init --global
   # Verify: ~/.mycelium/ created with manifest.yaml
   ```

2. **Sync Test:**
   ```bash
   # Add a skill
   echo "---\nname: test-skill\n---\n# Test" > ~/.mycelium/global/skills/test/SKILL.md

   mycelium sync

   # Verify symlinks created:
   ls -la ~/.claude/skills/test/
   ls -la ~/.codex/skills/test/
   ```

3. **MCP Test:**
   ```bash
   # Add MCP config
   cat >> ~/.mycelium/global/mcps.yaml << EOF
   mcps:
     test-mcp:
       command: echo
       args: ["test"]
   EOF

   mycelium sync

   # Verify MCP injected:
   cat ~/.claude/mcp.json | jq '.mcpServers["test-mcp"]'
   ```

4. **Memory Test:**
   ```bash
   echo "# My Preferences" > ~/.mycelium/global/memory/shared/preferences.md

   mycelium sync

   # Verify memory synced:
   grep "My Preferences" ~/.claude/CLAUDE.md
   grep "My Preferences" ~/.codex/AGENTS.md
   ```

5. **Dashboard Test:**
   ```bash
   mycelium dashboard
   # Open http://localhost:3377
   # Verify: Graph shows tools and resources
   # Click a node, verify detail panel opens
   ```

### Automated Tests:

```typescript
// packages/cli/src/__tests__/sync.test.ts
describe('sync command', () => {
  it('creates symlinks for skills', async () => {
    // Setup
    await createTestSkill('test-skill');

    // Execute
    await runSync();

    // Verify
    expect(symlinkExists('~/.claude/skills/test-skill')).toBe(true);
    expect(symlinkTarget('~/.claude/skills/test-skill'))
      .toBe('~/.mycelium/global/skills/test-skill');
  });

  it('merges MCP configs correctly', async () => {
    // Setup
    await createGlobalMcp('global-mcp');
    await createProjectMcp('project-mcp');

    // Execute
    await runSync();

    // Verify
    const config = readClaudeConfig();
    expect(config.mcpServers['global-mcp']).toBeDefined();
    expect(config.mcpServers['project-mcp']).toBeDefined();
  });

  it('respects memory scopes', async () => {
    // Setup
    await createMemory('shared/prefs.md', 'Preferences');
    await createMemory('personal/contacts.md', 'Contacts');

    // Execute
    await runSync();

    // Verify: Claude gets shared, not personal
    const claudeMemory = readFile('~/.claude/CLAUDE.md');
    expect(claudeMemory).toContain('Preferences');
    expect(claudeMemory).not.toContain('Contacts');

    // Verify: OpenClaw gets both shared and personal
    const openclawMemory = readFile('~/.openclaw/MEMORY.md');
    expect(openclawMemory).toContain('Preferences');
    expect(openclawMemory).toContain('Contacts');
  });
});
```

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Tool config formats change | Adapter pattern isolates changes |
| Symlink issues on Windows | Use NTFS junctions, test on Windows |
| MCP format varies by tool | Tool-specific injectors generate correct format |
| User has existing configs | Doctor command backs up and migrates |
| Dashboard adds complexity | Keep it read-mostly, CLI does the work |

---

## Success Criteria

1. **Sync works:** `mycelium sync` successfully syncs to all 6 tools
2. **Status is accurate:** `mycelium status` shows correct state
3. **Dashboard shows graph:** Interactive visualization works
4. **Memory scoping works:** Coding tools don't see personal memory
5. **Secrets are safe:** .env.local never committed to git
6. **Merge works:** Project configs add to, not replace, global

---

## Next Steps

1. ~~Approve this plan~~
2. Initialize monorepo with TypeScript
3. Implement core config merger and symlink manager
4. Build CLI commands (init, sync, status)
5. Add tool adapters for all 6 tools
6. Build dashboard with graph visualization
7. Test end-to-end across all tools
8. Package and publish to npm

---

## Feature Prioritization Matrix

| Feature | Impact | Effort | Risk | Diff | Score | Priority |
|---------|--------|--------|------|------|-------|----------|
| CLI: sync command | 10 | 8 | 2 | 7 | 21.0 | P0 |
| Skills symlink sync | 10 | 9 | 2 | 6 | 20.5 | P0 |
| MCP config merge | 9 | 7 | 3 | 8 | 15.7 | P0 |
| Memory.md sync | 9 | 8 | 2 | 9 | 21.5 | P0 |
| CLI: status command | 8 | 9 | 1 | 5 | 23.0 | P0 |
| .env.example/.env.local | 8 | 9 | 2 | 6 | 18.5 | P0 |
| Manifest.yaml versioning | 7 | 7 | 2 | 7 | 14.5 | P1 |
| Dashboard: React Flow graph | 8 | 6 | 3 | 8 | 13.7 | P1 |
| CLI: add skill/mcp | 7 | 7 | 2 | 5 | 15.0 | P1 |
| CLI: enable/disable | 7 | 7 | 2 | 6 | 15.5 | P1 |
| Machine-level overrides | 6 | 6 | 3 | 6 | 10.0 | P1 |
| Dashboard: Detail views | 6 | 6 | 2 | 5 | 12.5 | P2 |
| Webhooks for automation | 5 | 5 | 4 | 7 | 7.5 | P2 |
| Vector embeddings | 5 | 4 | 4 | 6 | 6.0 | P3 |
| Real-time Gateway sync | 4 | 3 | 5 | 5 | 4.0 | P3 |

**Scoring Formula:** (Impact × 2 + Effort × 1.5 + Differentiation × 1.5) / Risk

---

## Competitive Analysis Summary

### Existing Solutions (Partial):

| Project | What it does | Gap |
|---------|-------------|-----|
| **Skillshare** | Syncs skills via symlinks | No MCP sync, limited tools |
| **Skillfish** | Skill manager with manifest | Skills only, no memory |
| **mcp-sync** | Syncs MCP configs | MCPs only, no skills/memory |
| **Skills Hub** | Desktop app for skills | No CLI, limited scope |
| **MCP Gateway** | Enterprise registry | Overkill for solo/small teams |

### Features Stolen from Competitors:

| Source | Feature | Why It's Great |
|--------|---------|----------------|
| **Skillshare** | Symlink efficiency | Real-time, no copy overhead |
| **Skillfish** | Manifest + version pinning | `owner/repo@v1.0.0` syntax |
| **mcp-sync** | Hierarchical config | Global → Project cascade |
| **OpenClaw** | Lane queuing | Prevents race conditions |
| **OpenClaw** | JSONL audit trails | Debug and replay |
| **MCP Gateway** | Status indicators | Real-time health monitoring |

### What Makes Mycelium Different:

1. **First to unify memory sync** - No competitor does this well
2. **Merge-based config** - Project ADDS to global (competitors override)
3. **React Flow dashboard** - Interactive graph visualization
4. **All 6 tools from day one** - Claude, Codex, Gemini, OpenCode, OpenClaw, Aider
5. **Scoped memory privacy** - Coding tools don't see personal data

---

## Research Sources

- **Competitors analyzed:** Skillshare, Skillfish, mcp-sync, Code Conductor, Skills Hub, MCP Gateway Registry
- **Architecture inspiration:** OpenClaw (gateway, memory, JSONL audit), mcp-sync (hierarchical config)
- **Standards:** MCP Protocol (modelcontextprotocol.io), Agent Skills Specification (agentskills.io)
- **Dashboard options evaluated:** React Flow, D3.js, Cytoscape.js, vis.js, Tremor, ECharts, Deck.gl, Grafana, Retool, shadcn/ui
- **Tools researched:** Claude Code, Codex CLI, Gemini CLI, OpenCode, OpenClaw, Aider
- **Memory systems researched:** claude-mem, OpenClaw semantic memory, mem0, OpenMemory MCP
