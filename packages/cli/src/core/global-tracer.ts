import path from "node:path";
import os from "node:os";
import { Tracer } from "./tracer.js";

const MYCELIUM_DIR = path.join(os.homedir(), ".mycelium");
const TRACES_DIR = path.join(MYCELIUM_DIR, "traces");
const DB_PATH = path.join(TRACES_DIR, "trace.db");
const SNAPSHOT_DIR = path.join(TRACES_DIR, "snapshots");

let _tracer: Tracer | null = null;

export function getTracer(): Tracer {
  if (!_tracer) {
    _tracer = new Tracer(DB_PATH, {
      snapshotDir: SNAPSHOT_DIR,
      debugMode: process.argv.includes("--debug"),
    });
  }
  return _tracer;
}

export function closeTracer(): void {
  if (_tracer) {
    _tracer.vacuum();
    _tracer.close();
    _tracer = null;
  }
}

// Auto-vacuum on process exit
process.on("exit", () => {
  if (_tracer) {
    try { _tracer.vacuum(); _tracer.close(); } catch { /* ignore */ }
    _tracer = null;
  }
});
