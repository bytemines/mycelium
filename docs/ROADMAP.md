# Mycelium Roadmap — AI Tool Orchestration

> Brainstorming outcomes and feature direction for Mycelium's evolution from config sync to intelligent AI tool management platform.

---

## Vision

Mycelium currently syncs configurations across 8 AI tools. The next evolution is becoming the **control plane** — not just syncing configs, but understanding, optimizing, and visualizing your entire AI tool setup.

**Core principle**: Mycelium manages everything BEFORE the LLM runs. Setup, visibility, optimization. The LLM handles execution. Mycelium never interferes with the model's process.

---

## Feature: Unified Setup Intelligence

### The Problem
You have 5 MCPs, 12 skills, 3 agents across 4 AI tools. What's connected to what? What's redundant? What's broken? Nobody knows. You `cat` config files and pray.

### The Solution
`mycelium status --deep` gives you a complete picture of your AI setup in one command.

### What It Shows

```
$ mycelium status --deep

📊 Your AI Setup
━━━━━━━━━━━━━━━━━━━━━━━━━━━
Tools:     4 configured (Claude Code, Cursor, Codex, VS Code)
MCPs:      7 servers (3 shared, 4 tool-specific)
Skills:    23 (18 synced, 5 orphaned)
Agents:    2
Rules:     11
CLI Tools: 4 registered

💰 Token Overhead (estimated per turn)
━━━━━━━━━━━━━━━━━━━━━━━━━━━
Claude Code: ~22,400 tokens
├── 5 MCPs (47 tools): 18,200 tokens
├── 8 skills loaded: 4,200 tokens
└── ⚠️  3 tools overlap (filesystem in 2 servers)

Cursor: ~14,100 tokens
├── 3 MCPs (22 tools): 11,800 tokens
└── 6 rules: 2,300 tokens

🔴 Issues Found
━━━━━━━━━━━━━━━━━━━━━━━━━━━
• 5 orphan skills (exist but not loaded by any tool)
• 2 duplicate MCPs (same server, different names)
• 1 dead MCP (configured but not responding)
• 3 skills reference CLI tools not installed
```

### Why This Matters
- Every developer with 2+ AI tools has this problem
- Mycelium already scans all tool configs — just surface the data
- Unique: nobody else provides this unified view
- Low implementation effort, high "wow" factor

### Implementation
- Aggregate data from existing tool scanners
- Add token estimation logic (4 chars ≈ 1 token heuristic)
- Detect duplicates (same MCP command+args across tools)
- Detect orphans (skills not referenced by any tool config)
- Dead server check (attempt MCP handshake)

---

## Feature: XML Skill Tag Standard

### The Problem
Skills across all AI tools are static markdown documents. No way to declare dependencies, conditionals, or relationships between skills. No tooling can understand skill structure.

### The Solution
A lightweight XML tag standard embedded in skill markdown. The LLM reads and follows the tags naturally. Mycelium parses them for validation and visualization.

### Tag Specification

```markdown
# Deploy Skill

<skill:meta>
  <requires skill="testing" />
  <requires skill="docker-build" />
  <requires tool="docker" />
  <requires tool="gh" />
  <category>devops</category>
  <complexity>advanced</complexity>
</skill:meta>

First, run the test suite:

<skill:invoke ref="testing" trigger="before-deploy" />

After tests pass, build the container...

<skill:gate condition="env:CI">
  Use the CI/CD pipeline for deployment.
</skill:gate>
<skill:gate condition="!env:CI">
  Use local Docker deployment instead.
</skill:gate>
```

### Tags

| Tag | Purpose | Example |
|-----|---------|---------|
| `<skill:meta>` | Metadata block (dependencies, category, complexity) | Top of skill |
| `<skill:requires>` | Declares a dependency on another skill or tool | `<requires skill="testing" />` |
| `<skill:invoke>` | Suggests invoking another skill | `<skill:invoke ref="lint" />` |
| `<skill:gate>` | Conditional section (LLM evaluates condition) | `<skill:gate condition="env:CI">` |
| `<skill:track>` | Opt-in usage tracking via Mycelium MCP | `<skill:track id="deploy" />` |

### How Each Consumer Uses the Tags

| Consumer | What it does |
|----------|-------------|
| **LLM** | Reads tags as instructions — follows invoke/gate naturally |
| **Mycelium parser** | Extracts dependency graph, validates references exist |
| **Mycelium doctor** | Warns about missing dependencies, circular refs |
| **Mycelium dashboard** | Renders interactive skill graph (React Flow) |
| **Mycelium marketplace** | Resolves transitive dependencies on install |

### Skill Graph Visualization

```
$ mycelium graph

deploy ──requires──▶ testing
  │                    │
  │──requires──▶ docker-build
  │                    │
  ├── tool: docker     ├── tool: docker
  └── tool: gh         └── skill: dockerfile-lint

17 skills │ 4 CLI tools │ 3 MCPs
2 orphan skills (no inbound references)
1 circular dependency ⚠️: lint ↔ format
```

### Dashboard Integration
The React Flow dashboard already exists. Feed it skill relationships from parsed XML tags:
- Nodes = skills, CLI tools, MCPs
- Edges = requires, invokes
- Color coding by category
- Click to view skill content

### Why This Matters as a Standard
- Right now every AI tool has its own skill format with zero structure
- If Mycelium's XML tags become the way to declare skill relationships, it becomes the **`package.json` of AI skills**
- The metadata layer everyone relies on
- Graceful degradation: tags are valid markdown comments to tools that don't understand them

---

## Feature: Lightweight Usage Analytics

### The Problem
Which skills actually get used? Which MCP tools are burning tokens but never invoked? Developers have zero insight into their tool usage patterns.

### The Easy Solution (No Log Parsing Required)
Mycelium's MCP self-server is already running alongside the agent. Add one tool:

```
mycelium.track(skill_id, event_type)
```

Skills opt in with a tag:

```markdown
<skill:track id="testing" />
```

The LLM reads the tag, calls the MCP tool when it uses the skill. Mycelium stores to a simple YAML log:

```yaml
# ~/.mycelium/analytics.yaml (auto-generated, gitignored)
usage:
  testing: { count: 47, last: "2026-02-20" }
  deploy: { count: 22, last: "2026-02-19" }
  react-patterns: { count: 8, last: "2026-02-15" }
  xml-parser: { count: 0, last: null }
```

### Reporting

```
$ mycelium analytics --last 30d

📊 Skill Usage (last 30 days)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  testing          ████████████████ 47 uses
  git-workflow     ████████████     34 uses
  deploy           ████████         22 uses
  react-patterns   ███               8 uses
  xml-parser       ░                 0 uses ⚠️ never used

💡 Suggestions
  • 2 skills never used → consider removing
  • 3 MCP tools never called → disable to save ~800 tokens
  • "testing" is most-used → consider optimizing its token footprint
```

### Why This Approach Wins
- **Zero infrastructure** — one MCP tool, one YAML file
- **LLM does the tracking** — Mycelium just stores and reports
- **Opt-in** — skills choose to be tracked via `<skill:track>` tag
- **Privacy-friendly** — local file, never leaves the machine, gitignored
- **Actionable** — feeds into doctor suggestions and optimize commands

---

## Implementation Priority

| Priority | Feature | Effort | Impact | Score |
|----------|---------|--------|--------|-------|
| **P0** | Unified Setup Intelligence | Small | High — instant value, uses existing data | 8.4 |
| **P0** | CLI Skill Generator (#5, #6) | Medium | High — immediate productivity gain | 7.8 |
| **P1** | XML Skill Tag Standard | Medium | High — community standard, enables graph | 7.2 |
| **P1** | Token Budget Awareness (#7) | Medium | High — unique differentiator | 7.5 |
| **P2** | Usage Analytics | Small | Medium — unique insight, simple impl | 7.0 |
| **P2** | Tool Groups (#8) | Medium | Medium — UX improvement | 6.8 |
| **P3** | MCP → CLI Migration (#9) | Medium | Medium — adoption tool | 6.5 |

---

## Competitive Landscape

| Feature | Mycelium | MCP Registry | Smithery | Claude Skills |
|---------|----------|-------------|----------|---------------|
| Multi-tool config sync | ✅ 8 tools | ❌ | ❌ | ❌ |
| Unified setup dashboard | 🆕 | ❌ | ❌ | ❌ |
| CLI tool management | 🆕 | ❌ | ❌ | ❌ |
| Skill tag standard | 🆕 | ❌ | ❌ | ❌ |
| Skill dependency graph | 🆕 | ❌ | ❌ | ❌ |
| Token budget tracking | 🆕 | ❌ | ❌ | ❌ |
| Usage analytics | 🆕 | ❌ | ❌ | ❌ |
| Security scanner | ✅ 80+ rules | ❌ | ❌ | ❌ |
| Multi-PC sync | ✅ git-based | ❌ | ❌ | ❌ |
| Skill auto-generation | 🆕 | ❌ | ❌ | ❌ |

---

## Architecture: How It All Connects

```
┌──────────────────────────────────────────────────────────────┐
│                         AI Tools                              │
│  Claude Code ─── Cursor ─── Codex ─── VS Code ─── ...       │
└──────────┬───────────┬────────────┬────────────┬─────────────┘
           │           │            │            │
           ▼           ▼            ▼            ▼
┌──────────────────────────────────────────────────────────────┐
│                    Mycelium Sync Layer                         │
│  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │  MCPs   │  │  Skills   │  │CLI Tools │  │  Agents/Rules│  │
│  │ (sync)  │  │ (sync +   │  │ (registry│  │  (sync)      │  │
│  │         │  │  generate) │  │  + gen)  │  │              │  │
│  └─────────┘  └──────────┘  └──────────┘  └──────────────┘  │
├──────────────────────────────────────────────────────────────┤
│                   Intelligence Layer                          │
│  ┌───────────┐  ┌──────────┐  ┌───────────┐  ┌───────────┐  │
│  │  Setup    │  │  Token   │  │  Skill    │  │  Usage     │  │
│  │Dashboard  │  │ Budget   │  │  Graph    │  │ Analytics  │  │
│  │           │  │          │  │ (XML tags)│  │ (MCP track)│  │
│  └───────────┘  └──────────┘  └───────────┘  └───────────┘  │
├──────────────────────────────────────────────────────────────┤
│                    Presentation                               │
│  CLI (mycelium status/doctor/graph) + Dashboard (React Flow)  │
└──────────────────────────────────────────────────────────────┘
```

---

*Last updated: February 2026*
