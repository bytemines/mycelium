export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  ts: number;
  traceId: string;
  level: LogLevel;

  // Core dimensions
  cmd: string;
  scope: string;
  op: string;
  tool?: string;
  item?: string;

  // Manifest v2 dimensions
  itemType?: string;
  state?: string;
  source?: string;
  configLevel?: string;

  // Operation context
  phase?: string;
  method?: string;
  format?: string;
  entryShape?: string;
  path?: string;
  progress?: string;
  project?: string;

  // Payload
  msg: string;
  dur?: number;
  error?: string;
  data?: Record<string, unknown>;
}

export type LogEntryInput = Omit<LogEntry, "ts"> & { ts?: number };

export function createLogEntry(input: LogEntryInput): LogEntry {
  return {
    ...input,
    ts: input.ts ?? Date.now(),
  };
}
