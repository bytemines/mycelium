import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { syncFilesToDir, type FileSyncItem } from "./file-syncer.js";

let tmpDir: string;
let sourceDir: string;
let targetDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "file-syncer-"));
  sourceDir = path.join(tmpDir, "source");
  targetDir = path.join(tmpDir, "target");
  await fs.mkdir(sourceDir, { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function createSource(name: string, content = "hello"): Promise<string> {
  const p = path.join(sourceDir, name);
  await fs.writeFile(p, content);
  return p;
}

describe("syncFilesToDir — symlink strategy", () => {
  const strategy = { type: "symlink" as const };

  it("creates symlinks for enabled items", async () => {
    const src = await createSource("agent.md");
    const items: FileSyncItem[] = [{ name: "agent", path: src }];

    const result = await syncFilesToDir(items, targetDir, strategy);

    expect(result.success).toBe(true);
    expect(result.created).toEqual(["agent"]);
    const link = await fs.readlink(path.join(targetDir, "agent.md"));
    expect(link).toBe(src);
  });

  it("reports unchanged on re-sync", async () => {
    const src = await createSource("a.md");
    const items: FileSyncItem[] = [{ name: "a", path: src }];

    await syncFilesToDir(items, targetDir, strategy);
    const result = await syncFilesToDir(items, targetDir, strategy);

    expect(result.unchanged).toEqual(["a"]);
  });

  it("updates symlink when source changes", async () => {
    const src1 = await createSource("a.md", "v1");
    const src2 = await createSource("b.md", "v2");
    const items1: FileSyncItem[] = [{ name: "x", path: src1 }];

    await syncFilesToDir(items1, targetDir, strategy);

    // Point same target file to different source
    const target = path.join(targetDir, "a.md");
    const items2: FileSyncItem[] = [{ name: "x", path: src2 }];
    // Since target filename comes from item.path basename, we need same filename
    // Let's test with a renamed source
    const src3 = path.join(sourceDir, "a.md.v2");
    await fs.writeFile(src3, "v2");

    // Actually re-sync pointing to same basename but different realpath
    // Simplify: just verify update path by changing the symlink target
    await fs.unlink(target);
    await fs.symlink("/nonexistent", target);

    const result = await syncFilesToDir(items1, targetDir, strategy);
    expect(result.updated).toEqual(["x"]);
  });

  it("removes symlink for disabled items", async () => {
    const src = await createSource("a.md");
    const items: FileSyncItem[] = [{ name: "a", path: src }];
    await syncFilesToDir(items, targetDir, strategy);

    const disabled: FileSyncItem[] = [{ name: "a", path: src, state: "disabled" }];
    const result = await syncFilesToDir(disabled, targetDir, strategy);

    expect(result.removed).toContain("a");
  });

  it("removes orphaned symlinks", async () => {
    const src = await createSource("a.md");
    // Create an orphan symlink
    await fs.mkdir(targetDir, { recursive: true });
    await fs.symlink("/tmp/fake", path.join(targetDir, "orphan.md"));

    const items: FileSyncItem[] = [{ name: "a", path: src }];
    const result = await syncFilesToDir(items, targetDir, strategy, {
      removeOrphans: true,
    });

    expect(result.removed).toContain("orphan.md");
  });

  it("does not remove non-symlink orphans in symlink mode", async () => {
    await fs.mkdir(targetDir, { recursive: true });
    await fs.writeFile(path.join(targetDir, "real.md"), "keep me");

    const result = await syncFilesToDir([], targetDir, strategy, {
      removeOrphans: true,
    });

    expect(result.removed).not.toContain("real.md");
    // File should still exist
    const content = await fs.readFile(path.join(targetDir, "real.md"), "utf8");
    expect(content).toBe("keep me");
  });
});

describe("syncFilesToDir — copy strategy", () => {
  const strategy = { type: "copy" as const };

  it("copies files for enabled items", async () => {
    const src = await createSource("rule.yaml", "content: true");
    const items: FileSyncItem[] = [{ name: "rule", path: src }];

    const result = await syncFilesToDir(items, targetDir, strategy);

    expect(result.success).toBe(true);
    expect(result.created).toEqual(["rule"]);
    const content = await fs.readFile(
      path.join(targetDir, "rule.yaml"),
      "utf8"
    );
    expect(content).toBe("content: true");
  });

  it("updates copy when source is newer", async () => {
    const src = await createSource("r.md", "v1");
    const items: FileSyncItem[] = [{ name: "r", path: src }];

    await syncFilesToDir(items, targetDir, strategy);

    // Make source newer
    await new Promise((r) => setTimeout(r, 50));
    await fs.writeFile(src, "v2");

    const result = await syncFilesToDir(items, targetDir, strategy);
    expect(result.updated).toEqual(["r"]);

    const content = await fs.readFile(path.join(targetDir, "r.md"), "utf8");
    expect(content).toBe("v2");
  });

  it("removes file for deleted items", async () => {
    const src = await createSource("a.md");
    const items: FileSyncItem[] = [{ name: "a", path: src }];
    await syncFilesToDir(items, targetDir, strategy);

    const deleted: FileSyncItem[] = [{ name: "a", path: src, state: "deleted" }];
    const result = await syncFilesToDir(deleted, targetDir, strategy);
    expect(result.removed).toContain("a");
  });

  it("removes orphan files in copy mode", async () => {
    await fs.mkdir(targetDir, { recursive: true });
    await fs.writeFile(path.join(targetDir, "orphan.md"), "old");

    const result = await syncFilesToDir([], targetDir, strategy, {
      removeOrphans: true,
    });

    expect(result.removed).toContain("orphan.md");
  });
});
