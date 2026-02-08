import { describe, it, expect } from "vitest";
import { detectConflicts } from "./conflict-detector.js";

describe("conflict-detector", () => {
  it("detects duplicate MCP with different configs across levels", () => {
    const global = { mcps: { "git-mcp": { command: "npx", args: ["@v1"] } } };
    const project = { mcps: { "git-mcp": { command: "npx", args: ["@v2"] } } };
    const conflicts = detectConflicts(global, project);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].name).toBe("git-mcp");
    expect(conflicts[0].type).toBe("mcp");
  });

  it("returns empty when no conflicts", () => {
    const global = { mcps: { "git-mcp": { command: "npx" } } };
    const project = { mcps: { "db-mcp": { command: "npx" } } };
    const conflicts = detectConflicts(global, project);
    expect(conflicts).toHaveLength(0);
  });

  it("detects skill conflicts between levels", () => {
    const global = {
      skills: { tdd: { name: "tdd", path: "/global/tdd", enabled: true } },
    };
    const project = {
      skills: { tdd: { name: "tdd", path: "/project/tdd", enabled: true } },
    };
    const conflicts = detectConflicts(global, project);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].type).toBe("skill");
  });

  it("ignores identical configs (no real conflict)", () => {
    const global = { mcps: { "git-mcp": { command: "npx", args: ["@v1"] } } };
    const project = { mcps: { "git-mcp": { command: "npx", args: ["@v1"] } } };
    const conflicts = detectConflicts(global, project);
    expect(conflicts).toHaveLength(0);
  });

  it("handles empty configs gracefully", () => {
    expect(detectConflicts({}, {})).toHaveLength(0);
    expect(detectConflicts(undefined, undefined)).toHaveLength(0);
  });
});
