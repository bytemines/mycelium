import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("report command", () => {
  it("parseSince converts relative times to timestamps", async () => {
    const { parseSince } = await import("./report.js");
    const now = Date.now();
    const result = parseSince("1h");
    expect(result).toBeGreaterThan(now - 3_700_000);
    expect(result).toBeLessThan(now - 3_500_000);
  });

  it("parseSince handles absolute dates", async () => {
    const { parseSince } = await import("./report.js");
    const result = parseSince("2026-02-10");
    expect(result).toBe(new Date("2026-02-10").getTime());
  });

  it("buildReportSections adds env section when full=true", async () => {
    const { buildEnvSection } = await import("./report.js");
    const section = buildEnvSection();
    expect(section._section).toBe("env");
    expect(section.os).toBeTruthy();
    expect(section.node).toBeTruthy();
  });
});
