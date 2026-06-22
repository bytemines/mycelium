import { createRequire } from "node:module";
import type { DatabaseSync, StatementSync } from "node:sqlite";
import type { LogEntry } from "@mycelish/core";

// Uses Node's built-in SQLite (node:sqlite, Node >= 22) — no native module to compile,
// so no ABI breakage on Node upgrades. node:sqlite is loaded LAZILY (not a static import)
// so that even if it's absent/flag-gated on an older Node, the failure is caught by the
// constructor and tracing degrades to a no-op — it can never crash a core command like `sync`.
const requireCjs = createRequire(import.meta.url);

export interface TraceQueryOptions {
  traceId?: string;
  level?: string;
  cmd?: string;
  scope?: string;
  op?: string;
  tool?: string;
  item?: string;
  itemType?: string;
  state?: string;
  source?: string;
  configLevel?: string;
  phase?: string;
  method?: string;
  format?: string;
  project?: string;
  since?: number;
  limit?: number;
}

export interface TraceStoreOptions {
  maxRows?: number;
}

/** Default row cap for a query when no explicit limit is given. */
const DEFAULT_QUERY_LIMIT = 500;

const COLUMNS = [
  "ts", "trace_id", "level", "cmd", "scope", "op", "tool", "item",
  "item_type", "state", "source", "config_level", "phase", "method",
  "format", "entry_shape", "path", "progress", "project",
  "msg", "dur", "error", "data",
] as const;

export class TraceStore {
  private db: DatabaseSync | null = null;
  private maxRows: number;
  private insertStmt: StatementSync | null = null;
  private static warned = false;

  constructor(dbPath: string, opts?: TraceStoreOptions) {
    this.maxRows = opts?.maxRows ?? 50_000;
    try {
      const sqlite = requireCjs("node:sqlite") as typeof import("node:sqlite");
      this.db = new sqlite.DatabaseSync(dbPath);
      this.db.exec("PRAGMA journal_mode = WAL");
      this.db.exec("PRAGMA synchronous = NORMAL");
      this.init();
      this.insertStmt = this.db.prepare(`
        INSERT INTO events (${COLUMNS.join(", ")})
        VALUES (${COLUMNS.map(() => "?").join(", ")})
      `);
    } catch (err) {
      // Tracing is optional — never let a SQLite problem crash the command.
      this.db = null;
      this.insertStmt = null;
      if (!TraceStore.warned) {
        TraceStore.warned = true;
        console.warn(`[mycelium] tracing disabled: ${(err as Error).message.split("\n")[0]}`);
      }
    }
  }

  /** True when the backing store is usable. */
  get enabled(): boolean {
    return this.db !== null;
  }

  private init(): void {
    if (!this.db) return;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER NOT NULL,
        trace_id TEXT NOT NULL,
        level TEXT NOT NULL,
        cmd TEXT,
        scope TEXT,
        op TEXT,
        tool TEXT,
        item TEXT,
        item_type TEXT,
        state TEXT,
        source TEXT,
        config_level TEXT,
        phase TEXT,
        method TEXT,
        format TEXT,
        entry_shape TEXT,
        path TEXT,
        progress TEXT,
        project TEXT,
        msg TEXT NOT NULL,
        dur INTEGER,
        error TEXT,
        data TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_trace ON events(trace_id);
      CREATE INDEX IF NOT EXISTS idx_level ON events(level);
      CREATE INDEX IF NOT EXISTS idx_cmd ON events(cmd);
      CREATE INDEX IF NOT EXISTS idx_scope ON events(scope);
      CREATE INDEX IF NOT EXISTS idx_tool ON events(tool);
      CREATE INDEX IF NOT EXISTS idx_item ON events(item);
      CREATE INDEX IF NOT EXISTS idx_state ON events(state);
      CREATE INDEX IF NOT EXISTS idx_source ON events(source);
      CREATE INDEX IF NOT EXISTS idx_project ON events(project);
      CREATE INDEX IF NOT EXISTS idx_ts ON events(ts);
    `);
  }

  insert(entry: LogEntry): void {
    if (!this.insertStmt) return;
    // node:sqlite rejects `undefined` bindings (better-sqlite3 coerced them to NULL),
    // and a tracing insert must never throw into the calling command — so coerce
    // every nullable field to null and swallow any bind/exec error.
    try {
      this.insertStmt.run(
        entry.ts,
        entry.traceId,
        entry.level,
        entry.cmd ?? null,
        entry.scope ?? null,
        entry.op ?? null,
        entry.tool ?? null,
        entry.item ?? null,
        entry.itemType ?? null,
        entry.state ?? null,
        entry.source ?? null,
        entry.configLevel ?? null,
        entry.phase ?? null,
        entry.method ?? null,
        entry.format ?? null,
        entry.entryShape ?? null,
        entry.path ?? null,
        entry.progress ?? null,
        entry.project ?? null,
        entry.msg,
        entry.dur ?? null,
        entry.error ?? null,
        entry.data ? JSON.stringify(entry.data) : null,
      );
    } catch {
      // Optional tracing — never crash the caller over a bad row.
    }
  }

  query(opts: TraceQueryOptions): LogEntry[] {
    if (!this.db) return [];
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    const addFilter = (col: string, val: string | undefined) => {
      if (val !== undefined) {
        if (val.includes(",")) {
          const values = val.split(",").map((v) => v.trim());
          conditions.push(`${col} IN (${values.map(() => "?").join(", ")})`);
          params.push(...values);
        } else {
          conditions.push(`${col} = ?`);
          params.push(val);
        }
      }
    };

    addFilter("trace_id", opts.traceId);
    addFilter("level", opts.level);
    addFilter("cmd", opts.cmd);
    addFilter("scope", opts.scope);
    addFilter("op", opts.op);
    addFilter("tool", opts.tool);
    addFilter("item", opts.item);
    addFilter("item_type", opts.itemType);
    addFilter("state", opts.state);
    addFilter("source", opts.source);
    addFilter("config_level", opts.configLevel);
    addFilter("phase", opts.phase);
    addFilter("method", opts.method);
    addFilter("format", opts.format);
    addFilter("project", opts.project);

    if (opts.since !== undefined) {
      conditions.push("ts >= ?");
      params.push(opts.since);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = `LIMIT ${opts.limit ?? DEFAULT_QUERY_LIMIT}`;

    const rows = this.db.prepare(`SELECT * FROM events ${where} ORDER BY ts DESC ${limit}`).all(...params) as Record<string, unknown>[];

    return rows.map((row) => ({
      ts: row.ts as number,
      traceId: row.trace_id as string,
      level: row.level as LogEntry["level"],
      cmd: row.cmd as string,
      scope: row.scope as string,
      op: row.op as string,
      tool: row.tool as string | undefined,
      item: row.item as string | undefined,
      itemType: row.item_type as string | undefined,
      state: row.state as string | undefined,
      source: row.source as string | undefined,
      configLevel: row.config_level as string | undefined,
      phase: row.phase as string | undefined,
      method: row.method as string | undefined,
      format: row.format as string | undefined,
      entryShape: row.entry_shape as string | undefined,
      path: row.path as string | undefined,
      progress: row.progress as string | undefined,
      project: row.project as string | undefined,
      msg: row.msg as string,
      dur: row.dur as number | undefined,
      error: row.error as string | undefined,
      data: row.data ? JSON.parse(row.data as string) : undefined,
    }));
  }

  exportJsonl(opts: TraceQueryOptions): string {
    const entries = this.query(opts);
    return entries.map((e) => JSON.stringify(e)).join("\n");
  }

  vacuum(): void {
    if (!this.db) return;
    const count = (this.db.prepare("SELECT COUNT(*) as c FROM events").get() as { c: number }).c;
    if (count > this.maxRows) {
      const deleteCount = count - this.maxRows;
      this.db.prepare("DELETE FROM events WHERE id IN (SELECT id FROM events ORDER BY ts ASC LIMIT ?)").run(deleteCount);
    }
  }

  close(): void {
    this.db?.close();
  }
}
