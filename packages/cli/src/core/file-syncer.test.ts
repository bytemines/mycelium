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

  it.each(["agents", "commands"])("cleans current-project %s links after filtering, including missing sources", async section => {
    const projectRoot = path.join(tmpDir, "project");
    const source = path.join(projectRoot, ".mycelium", section, "foo.md");
    await fs.mkdir(path.dirname(source), { recursive: true });
    await fs.writeFile(source, "managed");
    const options = { removeOrphans: true, projectRoot };
    expect((await syncFilesToDir([{ name: "foo", path: source }], targetDir, strategy, options)).success).toBe(true);
    const outside = await createSource("outside.md");
    const otherProject = path.join(tmpDir, "other-project", ".mycelium", section, "other.md");
    await fs.symlink(outside, path.join(targetDir, "outside.md"));
    await fs.symlink(otherProject, path.join(targetDir, "other.md"));
    const disabled = await syncFilesToDir([], targetDir, strategy, options);
    expect(disabled.success).toBe(true);
    expect(disabled.removed).toEqual(["foo.md"]);
    await syncFilesToDir([{ name: "foo", path: source }], targetDir, strategy, options);
    await fs.unlink(source);
    const deleted = await syncFilesToDir([], targetDir, strategy, options);
    expect(deleted.success).toBe(true);
    expect(deleted.removed).toEqual(["foo.md"]);
    expect(await fs.readlink(path.join(targetDir, "outside.md"))).toBe(outside);
    expect(await fs.readlink(path.join(targetDir, "other.md"))).toBe(otherProject);
  });

  it("preserves ordinary native files and unmanaged orphan symlinks", async () => {
    const src = await createSource("a.md");
    await fs.mkdir(targetDir);
    await fs.writeFile(path.join(targetDir, "a.md"), "native");
    await fs.symlink(src, path.join(targetDir, "unmanaged.md"));
    const result = await syncFilesToDir([{ name: "a", path: src }], targetDir, strategy, { removeOrphans: true });
    expect(result.success).toBe(false);
    expect(await fs.readFile(path.join(targetDir, "a.md"), "utf8")).toBe("native");
    expect(await fs.readlink(path.join(targetDir, "unmanaged.md"))).toBe(src);
  });

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
    const { MYCELIUM_HOME } = await import("./fs-helpers.js");
    await fs.symlink(path.join(MYCELIUM_HOME, "old.md"), target);

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
    const { MYCELIUM_HOME } = await import("./fs-helpers.js");
    await fs.symlink(path.join(MYCELIUM_HOME, "orphan.md"), path.join(targetDir, "orphan.md"));

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

  it("rejects a destination symlink escape and preserves the outside sentinel", async () => {
    const src = await createSource("a.md");
    const sentinel = path.join(tmpDir, "sentinel");
    await fs.writeFile(sentinel, "keep");
    await fs.mkdir(targetDir);
    await fs.symlink(sentinel, path.join(targetDir, "a.md"));
    const result = await syncFilesToDir([{ name: "a", path: src }], targetDir, strategy);
    expect(result.success).toBe(false);
    expect(await fs.readFile(sentinel, "utf8")).toBe("keep");
  });

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

  it("updates owned copies repeatedly by content, even with older source mtimes", async () => {
    const src = await createSource("r.md", "v1");
    const items: FileSyncItem[] = [{ name: "r", path: src }];

    await syncFilesToDir(items, targetDir, strategy);

    await fs.writeFile(src, "v2");
    await fs.utimes(src, new Date(0), new Date(0));

    const result = await syncFilesToDir(items, targetDir, strategy);
    expect(result.success).toBe(true);
    expect(result.updated).toEqual(["r"]);

    const content = await fs.readFile(path.join(targetDir, "r.md"), "utf8");
    expect(content).toBe("v2");
    await fs.writeFile(src, "v3");
    const again = await syncFilesToDir(items, targetDir, strategy);
    expect(again.success).toBe(true);
    expect(again.updated).toEqual(["r"]);
    expect(await fs.readFile(path.join(targetDir, "r.md"), "utf8")).toBe("v3");
  });

  it.each(["disabled", "deleted"] as const)("removes unchanged owned copies for %s items", async state => {
    const src = await createSource("a.md");
    const items: FileSyncItem[] = [{ name: "a", path: src }];
    await syncFilesToDir(items, targetDir, strategy);

    const deleted: FileSyncItem[] = [{ name: "a", path: src, state }];
    const result = await syncFilesToDir(deleted, targetDir, strategy);
    expect(result.success).toBe(true);
    expect(result.removed).toContain("a");
    await expect(fs.lstat(path.join(targetDir, "a.md"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("preserves orphan files in copy mode", async () => {
    await fs.mkdir(targetDir, { recursive: true });
    await fs.writeFile(path.join(targetDir, "orphan.md"), "old");

    const result = await syncFilesToDir([], targetDir, strategy, {
      removeOrphans: true,
    });

    expect(result.removed).not.toContain("orphan.md");
    expect(await fs.readFile(path.join(targetDir, "orphan.md"), "utf8")).toBe("old");
  });

  it("removes only unchanged owned orphans, retaining native files and user edits", async () => {
    const clean = await createSource("clean.md");
    const edited = await createSource("edited.md");
    await syncFilesToDir([{ name: "clean", path: clean }, { name: "edited", path: edited }], targetDir, strategy);
    await fs.writeFile(path.join(targetDir, "edited.md"), "user edit");
    await fs.writeFile(path.join(targetDir, "native.md"), "native");
    const result = await syncFilesToDir([], targetDir, strategy, { removeOrphans: true });
    expect(result.success).toBe(true);
    expect(result.removed).toEqual(["clean.md"]);
    expect(await fs.readFile(path.join(targetDir, "edited.md"), "utf8")).toBe("user edit");
    expect(await fs.readFile(path.join(targetDir, "native.md"), "utf8")).toBe("native");
  });

  it("preserves user edits during update and disable", async () => {
    const src = await createSource("a.md", "original");
    const item = { name: "a", path: src };
    await syncFilesToDir([item], targetDir, strategy);
    await fs.writeFile(path.join(targetDir, "a.md"), "user edit");
    await fs.writeFile(src, "source update");
    expect((await syncFilesToDir([item], targetDir, strategy)).success).toBe(false);
    const disabled = await syncFilesToDir([{ ...item, state: "disabled" }], targetDir, strategy);
    expect(disabled.removed).toEqual([]);
    expect(await fs.readFile(path.join(targetDir, "a.md"), "utf8")).toBe("user edit");
  });

  it("preserves unowned copies on disable and does not adopt identical native files", async () => {
    const src = await createSource("a.md");
    await fs.mkdir(targetDir);
    await fs.copyFile(src, path.join(targetDir, "a.md"));
    expect((await syncFilesToDir([{ name: "a", path: src }], targetDir, strategy)).unchanged).toEqual(["a"]);
    const result = await syncFilesToDir([{ name: "a", path: src, state: "disabled" }], targetDir, strategy);
    expect(result.removed).toEqual([]);
    expect(await fs.readFile(path.join(targetDir, "a.md"), "utf8")).toBe("hello");
  });

  it("preserves an owned copy when a different source claims the same filename", async () => {
    const src = await createSource("a.md", "original source");
    await syncFilesToDir([{ name: "a", path: src }], targetDir, strategy);
    const other = path.join(tmpDir, "other", "a.md");
    await fs.mkdir(path.dirname(other));
    await fs.writeFile(other, "different source");
    expect((await syncFilesToDir([{ name: "a", path: other }], targetDir, strategy)).success).toBe(false);
    expect((await syncFilesToDir([{ name: "a", path: other, state: "disabled" }], targetDir, strategy)).removed).toEqual([]);
    expect(await fs.readFile(path.join(targetDir, "a.md"), "utf8")).toBe("original source");
  });

  it("backs up legacy/native content once, then permits owned updates without replacing the backup", async () => {
    const src = await createSource("a.md", "source1");
    const item = { name: "a", path: src };
    await fs.mkdir(targetDir);
    await fs.writeFile(path.join(targetDir, "a.md"), "native original");
    expect((await syncFilesToDir([item], targetDir, strategy)).success).toBe(true);
    await fs.writeFile(src, "source2");
    expect((await syncFilesToDir([item], targetDir, strategy)).success).toBe(true);
    await fs.writeFile(src, "source3");
    expect((await syncFilesToDir([item], targetDir, strategy)).success).toBe(true);
    expect(await fs.readFile(path.join(targetDir, "a.md"), "utf8")).toBe("source3");
    expect(await fs.readFile(path.join(targetDir, "a.md.mycelium-backup"), "utf8")).toBe("native original");
  });

  it("does not overwrite existing native backups or adopt failed writes", async () => {
    const src = await createSource("a.md", "source");
    await fs.mkdir(targetDir);
    await fs.writeFile(path.join(targetDir, "a.md"), "native");
    await fs.writeFile(path.join(targetDir, "a.md.mycelium-backup"), "existing backup");
    expect((await syncFilesToDir([{ name: "a", path: src }], targetDir, strategy)).success).toBe(false);
    expect(await fs.readFile(path.join(targetDir, "a.md"), "utf8")).toBe("native");
    expect(await fs.readFile(path.join(targetDir, "a.md.mycelium-backup"), "utf8")).toBe("existing backup");
    expect((await syncFilesToDir([], targetDir, strategy, { removeOrphans: true })).removed).toEqual([]);
  });

  it.each(["not-json", JSON.stringify({ version: 1, files: { "../outside": { source: "/source", hash: "a".repeat(64) } } })])("fails closed on invalid ownership metadata", async metadata => {
    const src = await createSource("a.md");
    await syncFilesToDir([{ name: "a", path: src }], targetDir, strategy);
    await fs.writeFile(path.join(targetDir, ".mycelium-copy-ownership.json"), metadata);
    expect((await syncFilesToDir([{ name: "a", path: src, state: "deleted" }], targetDir, strategy, { removeOrphans: true })).success).toBe(false);
    expect(await fs.readFile(path.join(targetDir, "a.md"), "utf8")).toBe("hello");
    expect(await fs.readFile(path.join(targetDir, ".mycelium-copy-ownership.json"), "utf8")).toBe(metadata);
  });

  it("rejects symlinked ownership metadata without touching its outside target", async () => {
    const src = await createSource("a.md");
    await fs.mkdir(targetDir);
    const outside = path.join(tmpDir, "outside");
    await fs.writeFile(outside, "sentinel");
    await fs.symlink(outside, path.join(targetDir, ".mycelium-copy-ownership.json"));
    expect((await syncFilesToDir([{ name: "a", path: src }], targetDir, strategy)).success).toBe(false);
    expect(await fs.readFile(outside, "utf8")).toBe("sentinel");
  });

  it("supports an intentionally symlinked target root", async () => {
    const src = await createSource("a.md");
    const real = path.join(tmpDir, "real-target");
    await fs.mkdir(real);
    await fs.symlink(real, targetDir);
    expect((await syncFilesToDir([{ name: "a", path: src }], targetDir, strategy)).success).toBe(true);
    expect(await fs.readFile(path.join(real, "a.md"), "utf8")).toBe("hello");
    expect((await syncFilesToDir([], targetDir, strategy, { removeOrphans: true })).removed).toEqual(["a.md"]);
  });
});
