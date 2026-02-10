/**
 * Seed a test trace DB with realistic failure scenarios.
 * Usage: npx tsx packages/cli/skills/debug-mycelium/seed-test-db.ts [output-path]
 * Default output: /tmp/mycelium-test-trace.db
 */
import { TraceStore } from "../../src/core/trace-store.js";
import { createLogEntry } from "@mycelish/core";

const dbPath = process.argv[2] ?? "/tmp/mycelium-test-trace.db";
const store = new TraceStore(dbPath);

const now = Date.now();
const min = 60_000;
const hr = 3_600_000;

// ─── Scenario 1: Item disabled but user thinks it's enabled ───
// User ran `mycelium disable postgres-mcp` a day ago, forgot, now wonders why it's not syncing
const s1 = "sync-aabb1122";
store.insert(createLogEntry({ ts: now - 25 * hr, traceId: "disable-cc001122", level: "info", cmd: "disable", scope: "mcp", op: "state-change", msg: "Disabled postgres-mcp", item: "postgres-mcp", state: "disabled", source: "manual", itemType: "mcp" }));
store.insert(createLogEntry({ ts: now - 10 * min, traceId: s1, level: "info", cmd: "sync", scope: "config", op: "merge", msg: "Loaded and merged config", configLevel: "all" }));
store.insert(createLogEntry({ ts: now - 10 * min + 50, traceId: s1, level: "debug", cmd: "sync", scope: "mcp", op: "filter", msg: "Skipped: state=disabled", item: "postgres-mcp", state: "disabled", source: "manual", itemType: "mcp" }));
store.insert(createLogEntry({ ts: now - 10 * min + 100, traceId: s1, level: "info", cmd: "sync", scope: "mcp", op: "write", msg: "Writing 3 MCPs", tool: "cursor", progress: "0/3" }));
store.insert(createLogEntry({ ts: now - 10 * min + 200, traceId: s1, level: "info", cmd: "sync", scope: "config", op: "sync", msg: "Synced 3 MCPs, 5 skills", tool: "cursor", dur: 45 }));
store.insert(createLogEntry({ ts: now - 10 * min + 300, traceId: s1, level: "info", cmd: "sync", scope: "config", op: "sync", msg: "Synced 3 MCPs, 5 skills", tool: "claude-code", dur: 32 }));

// ─── Scenario 2: Permission error writing to Cursor config ───
const s2 = "sync-ddee3344";
store.insert(createLogEntry({ ts: now - 5 * min, traceId: s2, level: "info", cmd: "sync", scope: "config", op: "merge", msg: "Loaded and merged config", configLevel: "all" }));
store.insert(createLogEntry({ ts: now - 5 * min + 100, traceId: s2, level: "info", cmd: "sync", scope: "mcp", op: "write", msg: "Writing 4 MCPs", tool: "cursor", progress: "0/4" }));
store.insert(createLogEntry({ ts: now - 5 * min + 200, traceId: s2, level: "error", cmd: "sync", scope: "mcp", op: "write", msg: "EACCES: permission denied, open '/Users/dev/.cursor/mcp.json'", tool: "cursor", item: "playwright", method: "file", format: "json", entryShape: "standard", path: "/Users/dev/.cursor/mcp.json", error: "EACCES: permission denied, open '/Users/dev/.cursor/mcp.json'", source: "manual", state: "enabled" }));
store.insert(createLogEntry({ ts: now - 5 * min + 300, traceId: s2, level: "info", cmd: "sync", scope: "config", op: "sync", msg: "Synced 4 MCPs, 5 skills", tool: "claude-code", dur: 28 }));
store.insert(createLogEntry({ ts: now - 5 * min + 400, traceId: s2, level: "error", cmd: "sync", scope: "config", op: "sync", msg: "Sync failed for cursor", tool: "cursor", error: "EACCES: permission denied" }));

// ─── Scenario 3: Config parse error in Codex TOML ───
const s3 = "sync-ff556677";
store.insert(createLogEntry({ ts: now - 3 * min, traceId: s3, level: "info", cmd: "sync", scope: "config", op: "merge", msg: "Loaded and merged config", configLevel: "all" }));
store.insert(createLogEntry({ ts: now - 3 * min + 100, traceId: s3, level: "info", cmd: "sync", scope: "mcp", op: "write", msg: "Writing 4 MCPs", tool: "codex", progress: "0/4" }));
store.insert(createLogEntry({ ts: now - 3 * min + 200, traceId: s3, level: "error", cmd: "sync", scope: "mcp", op: "write", msg: "Expected '=' but found '\\n' at line 15", tool: "codex", method: "file", format: "toml", path: "/Users/dev/.codex/config.toml", error: "TOML parse error at line 15", source: "manual" }));

// ─── Scenario 4: Enable command on nonexistent item ───
store.insert(createLogEntry({ ts: now - 2 * min, traceId: "enable-aa112233", level: "info", cmd: "enable", scope: "mcp", op: "enable", msg: "Enabling postgress-mcp", item: "postgress-mcp" }));
store.insert(createLogEntry({ ts: now - 2 * min + 100, traceId: "enable-aa112233", level: "error", cmd: "enable", scope: "mcp", op: "enable", msg: "Item not found in manifest", item: "postgress-mcp", error: "Not found: postgress-mcp" }));

// ─── Scenario 5: Plugin source deleted, items orphaned ───
const s5 = "sync-11223344";
store.insert(createLogEntry({ ts: now - 1 * min, traceId: s5, level: "info", cmd: "sync", scope: "config", op: "merge", msg: "Loaded and merged config", configLevel: "all" }));
store.insert(createLogEntry({ ts: now - 1 * min + 50, traceId: s5, level: "debug", cmd: "sync", scope: "skill", op: "filter", msg: "Skipped: state=deleted", item: "brainstorming", state: "deleted", source: "superpowers", itemType: "skill" }));
store.insert(createLogEntry({ ts: now - 1 * min + 60, traceId: s5, level: "debug", cmd: "sync", scope: "skill", op: "filter", msg: "Skipped: state=deleted", item: "execute-plan", state: "deleted", source: "superpowers", itemType: "skill" }));
store.insert(createLogEntry({ ts: now - 1 * min + 70, traceId: s5, level: "debug", cmd: "sync", scope: "skill", op: "filter", msg: "Skipped: state=deleted", item: "writing-plans", state: "deleted", source: "superpowers", itemType: "skill" }));
store.insert(createLogEntry({ ts: now - 1 * min + 200, traceId: s5, level: "info", cmd: "sync", scope: "config", op: "sync", msg: "Synced 4 MCPs, 2 skills", tool: "claude-code", dur: 35 }));

// ─── Scenario 6: Merge conflict between project and global config ───
const s6 = "sync-55667788";
store.insert(createLogEntry({ ts: now - 30 * min, traceId: s6, level: "info", cmd: "sync", scope: "config", op: "merge", msg: "Loaded and merged config", configLevel: "all" }));
store.insert(createLogEntry({ ts: now - 30 * min + 50, traceId: s6, level: "warn", cmd: "sync", scope: "config", op: "merge", msg: "Conflict: redis-mcp defined in both global and project with different commands", item: "redis-mcp", configLevel: "project", phase: "merge" }));
store.insert(createLogEntry({ ts: now - 30 * min + 100, traceId: s6, level: "info", cmd: "sync", scope: "config", op: "merge", msg: "Resolved: project config wins", item: "redis-mcp", configLevel: "project", phase: "merge" }));
store.insert(createLogEntry({ ts: now - 30 * min + 300, traceId: s6, level: "info", cmd: "sync", scope: "config", op: "sync", msg: "Synced 4 MCPs, 5 skills", tool: "cursor", dur: 40 }));

// ─── Scenario 7: Successful sync (healthy baseline) ───
const s7 = "sync-99aabb00";
store.insert(createLogEntry({ ts: now - 15 * min, traceId: s7, level: "info", cmd: "sync", scope: "config", op: "merge", msg: "Loaded and merged config", configLevel: "all" }));
store.insert(createLogEntry({ ts: now - 15 * min + 100, traceId: s7, level: "info", cmd: "sync", scope: "mcp", op: "write", msg: "Writing 4 MCPs", tool: "cursor", progress: "0/4" }));
store.insert(createLogEntry({ ts: now - 15 * min + 200, traceId: s7, level: "info", cmd: "sync", scope: "config", op: "sync", msg: "Synced 4 MCPs, 5 skills", tool: "cursor", dur: 38 }));
store.insert(createLogEntry({ ts: now - 15 * min + 300, traceId: s7, level: "info", cmd: "sync", scope: "config", op: "sync", msg: "Synced 4 MCPs, 5 skills", tool: "claude-code", dur: 25 }));
store.insert(createLogEntry({ ts: now - 15 * min + 400, traceId: s7, level: "info", cmd: "sync", scope: "config", op: "sync", msg: "Synced 4 MCPs, 5 skills", tool: "codex", dur: 42 }));

store.vacuum();
store.close();

console.log(`Test DB seeded at: ${dbPath}`);
console.log("Scenarios:");
console.log("  1. Disabled item (postgres-mcp) - user forgot they disabled it");
console.log("  2. EACCES permission error writing to Cursor config");
console.log("  3. TOML parse error in Codex config");
console.log("  4. Enable command typo (postgress-mcp instead of postgres-mcp)");
console.log("  5. Plugin source deleted, skills orphaned as state=deleted");
console.log("  6. Merge conflict between global and project config (redis-mcp)");
console.log("  7. Healthy sync (baseline, no errors)");
