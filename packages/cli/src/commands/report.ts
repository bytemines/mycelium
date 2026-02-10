import { Command } from "commander";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import type { LogEntry } from "@mycelish/core";
import { getTracer } from "../core/global-tracer.js";
import type { TraceQueryOptions } from "../core/trace-store.js";

export function parseSince(since: string): number {
  const match = since.match(/^(\d+)(m|h|d)$/);
  if (match) {
    const [, num, unit] = match;
    const ms = { m: 60_000, h: 3_600_000, d: 86_400_000 }[unit as "m" | "h" | "d"]!;
    return Date.now() - parseInt(num) * ms;
  }
  return new Date(since).getTime();
}

export function buildEnvSection(): Record<string, unknown> {
  return {
    _section: "env",
    os: `${os.platform()} ${os.release()}`,
    node: process.version,
    arch: os.arch(),
    hostname: os.hostname(),
  };
}

export async function checkGhCli(): Promise<boolean> {
  try {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execFileAsync = promisify(execFile);
    await execFileAsync("gh", ["--version"]);
    return true;
  } catch {
    return false;
  }
}

export function buildIssueReport(entries: LogEntry[], env: Record<string, unknown>): string {
  const errors = entries.filter((e) => e.level === "error");
  const warnings = entries.filter((e) => e.level === "warn");
  const title = errors.length > 0
    ? `${errors[0].cmd}: ${errors[0].msg}`
    : "Bug report";

  return `# ${title}

## Problem
<!-- Describe what you were trying to do and what happened instead -->

## Trace (${entries.length} entries, ${errors.length} errors, ${warnings.length} warnings)

\`\`\`jsonl
${entries.slice(0, 30).map((e) => JSON.stringify(e)).join("\n")}
\`\`\`

## Environment
- OS: ${env.os}
- Node: ${env.node}
- Arch: ${env.arch}

## Additional Context
<!-- Add any other context about the problem here -->
`;
}

export const reportCommand = new Command("report")
  .description("Query trace logs and generate bug reports")
  .option("--tool <tool>", "Filter by tool ID")
  .option("--scope <scope>", "Filter by scope (mcp, skill, config, memory, hook)")
  .option("--item <item>", "Filter by item name")
  .option("--cmd <cmd>", "Filter by command")
  .option("--level <level>", "Filter by log level (debug, info, warn, error)")
  .option("--state <state>", "Filter by item state (enabled, disabled, deleted)")
  .option("--source <source>", "Filter by item source")
  .option("--trace <traceId>", "Filter by trace ID")
  .option("--project <project>", "Filter by project name")
  .option("--since <time>", "Time filter: 1h, 30m, 7d, or ISO date", "1h")
  .option("--limit <n>", "Max entries to return", "100")
  .option("--format <fmt>", "Output format: jsonl, table, json", "jsonl")
  .option("--full", "Include doctor + env context sections", false)
  .option("--output <path>", "Write report to file instead of stdout")
  .option("--issue", "Generate a GitHub issue report (auto-detects gh CLI)", false)
  .action(async (opts) => {
    const tracer = getTracer();
    const query: TraceQueryOptions = {
      tool: opts.tool,
      scope: opts.scope,
      item: opts.item,
      cmd: opts.cmd,
      level: opts.level,
      state: opts.state,
      source: opts.source,
      traceId: opts.trace,
      project: opts.project,
      since: opts.since ? parseSince(opts.since) : undefined,
      limit: parseInt(opts.limit),
    };

    const entries = tracer.query(query);
    const lines: string[] = [];

    if (opts.format === "jsonl") {
      for (const e of entries) {
        lines.push(JSON.stringify({ _section: "trace", ...e }));
      }
    } else if (opts.format === "json") {
      lines.push(JSON.stringify(entries, null, 2));
    } else if (opts.format === "table") {
      console.log(`${"TIME".padEnd(24)} ${"LEVEL".padEnd(6)} ${"CMD".padEnd(10)} ${"SCOPE".padEnd(8)} ${"TOOL".padEnd(14)} ${"ITEM".padEnd(20)} MSG`);
      console.log("\u2500".repeat(110));
      for (const e of entries) {
        const time = new Date(e.ts).toISOString().slice(0, 23);
        console.log(`${time.padEnd(24)} ${(e.level ?? "").padEnd(6)} ${(e.cmd ?? "").padEnd(10)} ${(e.scope ?? "").padEnd(8)} ${(e.tool ?? "\u2014").padEnd(14)} ${(e.item ?? "\u2014").padEnd(20)} ${e.msg}`);
      }
      if (!opts.issue) return;
    }

    if (opts.full || opts.issue) {
      lines.push(JSON.stringify(buildEnvSection()));
    }

    // --issue: generate markdown report, auto-detect gh, create or save
    if (opts.issue) {
      const report = buildIssueReport(entries, buildEnvSection());
      const reportPath = opts.output ?? path.join(os.tmpdir(), `mycelium-report-${Date.now()}.md`);
      fs.writeFileSync(reportPath, report);

      const hasGh = await checkGhCli();
      if (hasGh) {
        console.log("\u2713 gh CLI detected. Creating GitHub issue...");
        console.log(`  Report saved to: ${reportPath}`);
        console.log(`  Run: gh issue create --title "Bug report" --body-file ${reportPath}`);
        console.log(`  Or edit the report first, then run the command above.`);
      } else {
        console.log(`\u2713 Report saved to: ${reportPath}`);
        console.log("  gh CLI not found. To file an issue:");
        console.log("  1. Review the report for sensitive data");
        console.log("  2. Open https://github.com/bytemines/mycelium/issues/new");
        console.log("  3. Paste the report contents");
      }
      return;
    }

    const output = lines.join("\n") + "\n";

    if (opts.output) {
      fs.writeFileSync(opts.output, output);
      console.log(`Report written to ${opts.output}`);
    } else {
      process.stdout.write(output);
    }
  });
