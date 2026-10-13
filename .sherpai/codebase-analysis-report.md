# Mycelium public-release audit

> Reviewed: 2026-10-13. Baseline: `12fae575`. Scope: core, CLI/MCP, dashboard,
> release workflows, dependency graph and public package artifacts.

## What this repo does

Mycelium manages AI-tool configuration through a local CLI, stdio MCP server and
optional local dashboard. Assumed load: one trusted local user, multiple dashboard
tabs and overlapping CLI/watch activity. Marketplace metadata/content is untrusted.
This is not a remotely authenticated administration service.

The deterministic scanner covered 200 source files; 63 exceeded its 200-line
threshold. Review went deeper on mutation, configuration, process execution,
marketplace, plugin, snapshot and API paths. File size was not itself a reason to
refactor. The original dirty checkout and real tool profiles were not modified.

## Release status

Known findings below have fixes and regression coverage in the security branch.
Publication remains subject to the final quality gate, versioned archive inspection
and CI. Do not retry the earlier failed `0.3.6` build: it predates these corrections.
The linked Changesets plan advances **CLI and core to 0.3.7**; changed core contents
must not be republished as the existing `0.3.5` package.

## Priority actions — implemented

| # | Finding | Smallest implemented correction | Main evidence |
|---|---|---|---|
| 1 | Skill sources reached a shell | Argument-array Git execution, validated source components and bounded clone time | `core/add-helpers.ts`, its tests |
| 2 | Item/snapshot names escaped filesystem roots | Shared component and real-path containment guards before mutation | `core/path-safety.ts`, remove/snapshot/install regressions |
| 3 | Sync/removal deleted native or user-edited files | Scope-aware removal; managed-copy source/hash ownership; native files and backups preserved | `core/file-syncer.ts`, remove security tests |
| 4 | Snapshot restore deleted uncaptured directories or retained post-snapshot config | Selective preflighted restoration; explicit recorded absence and manifest-state capture; legacy snapshots remain conservative | `core/snapshot.ts`, real-directory/state/absence tests |
| 5 | Plugin read errors caused settings replacement or destructive cleanup | Malformed/unreadable settings fail; uncertain installed-index state cannot authorize cleanup | `core/plugin-takeover.ts`, failure-preservation tests |
| 6 | Raw TOML values could create unrelated tables | One shared string/key encoder; name-scoped reconciliation preserves native MCP tables | `core/toml-encoding.ts`, adapter/writer/reference-parser tests |
| 7 | Removed MCPs remained in native registrations | Explicit known-name tombstones, scoped tool exclusions and adapter-failure propagation | `commands/sync.ts`, remove and integration tests |
| 8 | MCP add wrote nested YAML incompatible with its loader | Flat YAML round-trip; duplicates and malformed input rejected without resetting data | `core/add-helpers.test.ts` |
| 9 | Dashboard/marketplace/MCP sync used divergent flows or empty secrets | Central fresh global/project environment loading; all sync entrypoints share the hardened command flow | sync and MCP config-tool tests |
| 10 | Dashboard bound beyond loopback with wildcard browser access | Explicit `127.0.0.1`; Host/Origin checks before parsers and handlers; no wildcard CORS | `local-request-guard.ts`, server tests and isolated artifact HTTP checks |
| 11 | Incomplete marketplace listings authorized deletions | Automatic item-update removal disabled until inventory completeness is established | marketplace partial-listing tests |
| 12 | Preview auditing checked different local content | Scan the displayed content and filename; invalidate stale results | `SkillDetailPanel.test.tsx` |
| 13 | Marketplace requests duplicated work or lacked bounds | Per-key in-flight deduplication, deadlines, streaming size caps and redirect restrictions | marketplace cache/source/route tests |
| 14 | Merge/item queries accepted inherited object properties | Own-property iteration, data-property definition and explicit membership checks | core utils and manifest-state tests |
| 15 | Native CLI diagnostics echoed credential arguments | Redact known environment/key values in results and errors; preserve genuine failures | adapter fake-secret/idempotency tests |
| 16 | Graph controls ignored layout-setting changes | Pure layout module; data-only updates retain dragged positions, settings changes recompute | Graph regression and layout equivalence tests |
| 17 | Public package reported the wrong version or contained inconsistent assets | Read the manifest; dashboard-before-CLI build order; compiler failures propagate; repeated copies replace generated output | shared build helper and archive validator |
| 18 | Release tarballs included tests/maps and lacked package documentation | Build-only TypeScript configs, artifact exclusions, public READMEs and project license text | `check-release-packages.mjs` |
| 19 | Patch verification assumed a local `main` branch | Fresh isolated Git fixture with no source-history/branch dependency or inherited Git overrides | `check-security-patches.mjs` |

## Dependency audit

| Graph | Before | After |
|---|---:|---:|
| Production | 98 advisories: 1 critical, 17 high, 68 moderate, 12 low | **0 known advisories** |
| Full, including development tooling | 160 advisories: 2 critical, 44 high, 94 moderate, 20 low | **2 metadata advisories**, locally patched |

Runtime updates stay on supported major lines, including MCP SDK 1.x, Express 5.x
and Mermaid 11.x. Rebuilt dashboard assets contain the refreshed dependency graph;
installing a newer CLI dependency cannot repair an old embedded dashboard bundle.

Two Changesets development dependencies have no official patched release:

- `braces@3.0.3`, GHSA-vfj7-8cjw-p6xm: local patch bounds parser/AST nesting and
  rejects cycles before recursive walkers exhaust the stack.
- `sprintf-js@1.0.3`, GHSA-hp3w-g68c-fv3c: local patch constrains numeric precision
  to ECMAScript-supported ranges while preserving valid formatting.

Both are installed through committed `pnpm.patchedDependencies` with lockfile
integrity and regression checks against the **actual Changesets dependency chains**.
The registry scanner still matches their unchanged version metadata. Nothing is
ignored or version-spoofed; **the full audit is not zero**. These root-private tooling
patches are not shipped in runtime packages. CI checks runtime advisories and the
local patch behavior before publishing.

## Lean and maintainability

- One shared path guard and TOML encoder replace inconsistent boundary handling.
- MCP/CLI/dashboard synchronization reuses one flow rather than parallel writers.
- Graph math is independently testable; combined production layout files decreased
  by 157 lines, including formatting/comments. This is not a claimed speed benchmark.
- Copy ownership is one small per-directory record, not a new storage service.
- No new runtime framework, broker feature, queue or general authentication platform.
- Test files were not split simply for size. Debug force-layout optimization, broad
  directory reorganization and a general server-auth system were deferred.

## Validation and remaining limits

- Frozen dependency install, forced root build, typecheck and security-patch checks.
- **1,016 tests passed on Node 22.13**: CLI 922, core 50, dashboard 44.
- Isolated tarball installation, CLI aliases/help/version, SQLite, MCP initialize/
  tools-list with zero handler calls, and local dashboard/static/API checks.
- No real credentials detected in inspected artifact contents; no secrets/state/
  logs/databases/tests/maps intended for the public packages. GitHub reported zero
  open secret-scanning alerts. This is not an exhaustive Git-history secret audit.
- Draft package versions are not publication approval; recheck linked 0.3.7 archives
  and registry/tag evidence after the version PR.
- Native absent-server normalization is limited to verified tool/version responses;
  unknown CLI errors remain errors rather than being guessed away.
- The dashboard trusts local processes and its approved development origin; it is
  not protected against a malicious process already running as the same user.
- No live broker operations, real-profile takeover battery, external penetration
  test or complete browser/Mermaid adversarial rendering campaign was performed.
- Homebrew Node later became unavailable through a missing dylib; validation used
  an isolated official Node runtime without altering the global installation.

**Verdict:** publish only after the final gate, archive and CI checks. Known findings
have targeted fixes; no claim of absolute security or future vulnerability absence.
