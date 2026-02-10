import { describe, it, expect } from "vitest";
import { getWatchPaths, shouldTriggerSync } from "./watcher.js";

describe("watcher", () => {
  it("returns correct paths to watch", () => {
    const paths = getWatchPaths("/home/user");
    expect(paths).toContain("/home/user/.mycelium");
    // Watches directories, not individual files
    expect(paths.some((p) => p.includes("manifest.yaml"))).toBe(false);
  });

  it("includes global config path", () => {
    const paths = getWatchPaths("/home/user");
    expect(paths.some((p) => p.includes(".mycelium"))).toBe(true);
  });

  it("shouldTriggerSync returns true for config file changes", () => {
    expect(shouldTriggerSync("manifest.yaml")).toBe(true);
    expect(shouldTriggerSync("mcps.yaml")).toBe(true);
    expect(shouldTriggerSync("skills.yaml")).toBe(true);
    expect(shouldTriggerSync(".env.local")).toBe(true);
  });

  it("shouldTriggerSync returns false for non-config files", () => {
    expect(shouldTriggerSync("random.txt")).toBe(false);
    expect(shouldTriggerSync("README.md")).toBe(false);
    expect(shouldTriggerSync("package.json")).toBe(false);
  });

  it("shouldTriggerSync returns true for .md files in memory scope dirs", () => {
    expect(shouldTriggerSync("global/memory/shared/notes.md")).toBe(true);
    expect(shouldTriggerSync("global/memory/coding/style.md")).toBe(true);
    expect(shouldTriggerSync("global/memory/personal/diary.md")).toBe(true);
  });

  it("shouldTriggerSync returns false for .md files outside memory dirs", () => {
    expect(shouldTriggerSync("README.md")).toBe(false);
    expect(shouldTriggerSync("docs/plan.md")).toBe(false);
  });
});
