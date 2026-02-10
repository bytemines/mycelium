import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { loadItemsFromDir } from "./item-loader.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "item-loader-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("loadItemsFromDir", () => {
  it("loads .md, .yaml, .yml files by default", async () => {
    await fs.writeFile(path.join(tmpDir, "agent.md"), "# Agent");
    await fs.writeFile(path.join(tmpDir, "config.yaml"), "key: val");
    await fs.writeFile(path.join(tmpDir, "rules.yml"), "rules:");
    await fs.writeFile(path.join(tmpDir, "ignore.txt"), "nope");

    const items = await loadItemsFromDir(tmpDir);

    expect(items).toHaveLength(3);
    const names = items.map((i) => i.name).sort();
    expect(names).toEqual(["agent", "config", "rules"]);
  });

  it("returns full paths", async () => {
    await fs.writeFile(path.join(tmpDir, "a.md"), "");
    const items = await loadItemsFromDir(tmpDir);
    expect(items[0].path).toBe(path.join(tmpDir, "a.md"));
  });

  it("skips hidden files", async () => {
    await fs.writeFile(path.join(tmpDir, ".hidden.md"), "");
    await fs.writeFile(path.join(tmpDir, "visible.md"), "");

    const items = await loadItemsFromDir(tmpDir);
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("visible");
  });

  it("returns empty array for missing directory", async () => {
    const items = await loadItemsFromDir("/tmp/nonexistent-dir-xyz");
    expect(items).toEqual([]);
  });

  it("returns empty array for empty directory", async () => {
    const items = await loadItemsFromDir(tmpDir);
    expect(items).toEqual([]);
  });

  it("filters by custom extensions", async () => {
    await fs.writeFile(path.join(tmpDir, "a.json"), "{}");
    await fs.writeFile(path.join(tmpDir, "b.md"), "");

    const items = await loadItemsFromDir(tmpDir, [".json"]);
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("a");
  });
});
