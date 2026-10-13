import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { assertContainedPath, assertSafePathComponent } from "./path-safety.js";

let dir: string;
beforeEach(async () => { dir = await fs.mkdtemp(path.join(os.tmpdir(), "path-safety-")); });
afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }); });

describe("path safety", () => {
  it("rejects traversal and filesystem separators", () => {
    for (const name of ["", ".", "..", "../../../victim", "a/b", "a\\b", "a\0b", "/absolute"]) {
      expect(() => assertSafePathComponent(name)).toThrow();
    }
    expect(() => assertSafePathComponent("safe-name.md")).not.toThrow();
  });

  it("rejects lexical and existing-parent escapes without touching the sentinel", async () => {
    const root = path.join(dir, "root");
    const outside = path.join(dir, "outside");
    await fs.mkdir(root);
    await fs.mkdir(outside);
    await fs.writeFile(path.join(outside, "sentinel"), "keep");
    await fs.symlink(outside, path.join(root, "escape"));
    expect(() => assertContainedPath(root, path.join(root, "escape", "new", "file"))).toThrow();
    expect(() => assertContainedPath(root, outside)).toThrow();
    expect(await fs.readFile(path.join(outside, "sentinel"), "utf8")).toBe("keep");
  });

  it("permits a trusted symlink root and nonexistent children, rejects dangling destinations", async () => {
    const real = path.join(dir, "real");
    const root = path.join(dir, "root");
    await fs.mkdir(real);
    await fs.symlink(real, root);
    expect(() => assertContainedPath(root, path.join(root, "new", "file"))).not.toThrow();
    await fs.symlink(path.join(dir, "missing"), path.join(root, "dangling"));
    expect(() => assertContainedPath(root, path.join(root, "dangling", "file"))).toThrow();
  });
});
