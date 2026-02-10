import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createLogEntry, type LogEntry, type LogEntryInput, type LogLevel } from "@mycelish/core";
import { TraceStore, type TraceQueryOptions } from "./trace-store.js";

export interface TracerOptions {
  snapshotDir?: string;
  debugMode?: boolean;
  maxRows?: number;
}

export interface TraceLogger {
  debug: (fields: Omit<LogEntryInput, "traceId" | "level" | "cmd">) => void;
  info: (fields: Omit<LogEntryInput, "traceId" | "level" | "cmd">) => void;
  warn: (fields: Omit<LogEntryInput, "traceId" | "level" | "cmd">) => void;
  error: (fields: Omit<LogEntryInput, "traceId" | "level" | "cmd">) => void;
  traceId: string;
}

export class Tracer {
  private store: TraceStore;
  private snapshotDir?: string;
  private debugMode: boolean;

  constructor(dbPath: string, opts?: TracerOptions) {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    this.store = new TraceStore(dbPath, { maxRows: opts?.maxRows });
    this.snapshotDir = opts?.snapshotDir;
    this.debugMode = opts?.debugMode ?? false;
  }

  createTrace(cmd: string): TraceLogger {
    const traceId = `${cmd}-${randomBytes(4).toString("hex")}`;

    const log = (level: LogLevel, fields: Omit<LogEntryInput, "traceId" | "level" | "cmd">) => {
      if (level === "debug" && !this.debugMode) return;
      const entry = createLogEntry({ ...fields, traceId, level, cmd });
      this.store.insert(entry);
      if (level === "error") this.snapshot(traceId);
    };

    return {
      debug: (f) => log("debug", f),
      info: (f) => log("info", f),
      warn: (f) => log("warn", f),
      error: (f) => log("error", f),
      traceId,
    };
  }

  private snapshot(traceId: string): void {
    if (!this.snapshotDir) return;
    if (!fs.existsSync(this.snapshotDir)) fs.mkdirSync(this.snapshotDir, { recursive: true });
    const entries = this.store.query({ traceId, limit: 1000 });
    if (entries.length === 0) return;
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `${ts}_${traceId}.jsonl`;
    const content = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
    fs.writeFileSync(path.join(this.snapshotDir, filename), content);
  }

  query(opts: TraceQueryOptions): LogEntry[] {
    return this.store.query(opts);
  }

  exportJsonl(opts: TraceQueryOptions): string {
    return this.store.exportJsonl(opts);
  }

  vacuum(): void {
    this.store.vacuum();
  }

  close(): void {
    this.store.close();
  }
}
