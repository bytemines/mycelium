import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

let home: string;
vi.mock("../core/fs-helpers.js", async importOriginal => ({
  ...await importOriginal<typeof import("../core/fs-helpers.js")>(),
  get MYCELIUM_HOME() { return path.join(home, ".mycelium"); },
}));
vi.mock("@mycelish/core", async importOriginal => ({
  ...await importOriginal<typeof import("@mycelish/core")>(),
  TOOL_REGISTRY: { native: { paths: { skills: "native" } } },
  resolvePath: () => path.join(home, "native"),
}));
vi.mock("../core/global-tracer.js", () => ({
  getTracer: () => ({ createTrace: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }) }),
}));
vi.mock("../core/tool-adapter.js", () => ({ getAdapter: vi.fn() }));
const { removeItem } = await import("./remove.js");

beforeEach(async () => { home = await fs.mkdtemp(path.join(os.tmpdir(), "remove-security-")); });
afterEach(async () => { await fs.rm(home, { recursive: true, force: true }); });

async function manifest(dir: string, name: string): Promise<void> {
  const { stringify } = await import("yaml");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "manifest.yaml"), stringify({ version: "1", skills: { [name]: {} } }));
}

describe("remove filesystem safety", () => {
  it("does not mutate the manifest or outside sentinel on traversal", async () => {
    const dir = path.join(home, ".mycelium");
    await manifest(dir, "../../../victim");
    const before = await fs.readFile(path.join(dir, "manifest.yaml"), "utf8");
    await fs.writeFile(path.join(home, "victim"), "outside");
    expect((await removeItem("../../../victim", { manifestDir: dir })).success).toBe(false);
    expect(await fs.readFile(path.join(home, "victim"), "utf8")).toBe("outside");
    expect(await fs.readFile(path.join(dir, "manifest.yaml"), "utf8")).toBe(before);
  });

  it("rejects an escaping source parent before marking deleted", async () => {
    const dir = path.join(home, ".mycelium");
    const outside = path.join(home, "outside");
    await manifest(dir, "safe");
    await fs.mkdir(path.join(dir, "global"));
    await fs.mkdir(outside);
    await fs.writeFile(path.join(outside, "safe"), "sentinel");
    await fs.symlink(outside, path.join(dir, "global", "skills"));
    expect((await removeItem("safe", { manifestDir: dir })).success).toBe(false);
    expect(await fs.readFile(path.join(outside, "safe"), "utf8")).toBe("sentinel");
    expect(await fs.readFile(path.join(dir, "manifest.yaml"), "utf8")).not.toContain("deleted");
  });

  it("project removal leaves the global source and native skill intact", async () => {
    const project = path.join(home, "project", ".mycelium");
    await manifest(project, "safe");
    const global = path.join(home, ".mycelium", "global", "skills");
    await fs.mkdir(global, { recursive: true });
    await fs.writeFile(path.join(global, "safe.md"), "global");
    await fs.mkdir(path.join(home, "native"));
    await fs.symlink(path.join(global, "safe.md"), path.join(home, "native", "safe.md"));
    expect((await removeItem("safe", { manifestDir: project })).success).toBe(true);
    expect(await fs.readFile(path.join(global, "safe.md"), "utf8")).toBe("global");
    expect(await fs.readlink(path.join(home, "native", "safe.md"))).toBe(path.join(global, "safe.md"));
  });

  it("preserves ordinary native directories and files on global removal", async () => {
    const dir = path.join(home, ".mycelium");
    await manifest(dir, "safe");
    await fs.mkdir(path.join(home, "native", "safe"), { recursive: true });
    await fs.writeFile(path.join(home, "native", "safe", "SKILL.md"), "native directory");
    await fs.writeFile(path.join(home, "native", "safe.md"), "native file");
    expect((await removeItem("safe", { manifestDir: dir })).success).toBe(true);
    expect(await fs.readFile(path.join(home, "native", "safe", "SKILL.md"), "utf8")).toBe("native directory");
    expect(await fs.readFile(path.join(home, "native", "safe.md"), "utf8")).toBe("native file");
  });
});
