import Database from "better-sqlite3";
import type { LogEntry } from "@mycelish/core";

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

const COLUMNS = [
  "ts", "trace_id", "level", "cmd", "scope", "op", "tool", "item",
  "item_type", "state", "source", "config_level", "phase", "method",
  "format", "entry_shape", "path", "progress", "project",
  "msg", "dur", "error", "data",
] as const;

export class TraceStore {
  private db: Database.Database;
  private maxRows: number;
  private insertStmt: Database.Statement;

  constructor(dbPath: string, opts?: TraceStoreOptions) {
    this.maxRows = opts?.maxRows ?? 50_000;
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");
    this.init();
    this.insertStmt = this.db.prepare(`
      INSERT INTO events (${COLUMNS.join(", ")})
      VALUES (${COLUMNS.map(() => "?").join(", ")})
    `);
  }

  private init(): void {
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
    this.insertStmt.run(
      entry.ts,
      entry.traceId,
      entry.level,
      entry.cmd,
      entry.scope,
      entry.op,
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
  }

  query(opts: TraceQueryOptions): LogEntry[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    const addFilter = (col: string, val: string | undefined) => {
      if (val !== undefined) {
        conditions.push(`${col} = ?`);
        params.push(val);
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
    const limit = opts.limit ? `LIMIT ${opts.limit}` : "LIMIT 500";

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
    const count = (this.db.prepare("SELECT COUNT(*) as c FROM events").get() as { c: number }).c;
    if (count > this.maxRows) {
      const deleteCount = count - this.maxRows;
      this.db.prepare("DELETE FROM events WHERE id IN (SELECT id FROM events ORDER BY ts ASC LIMIT ?)").run(deleteCount);
    }
  }

  close(): void {
    this.db.close();
  }
}
