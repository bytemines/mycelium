/**
 * Tests for the Snapshot module
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

// We mock os.homedir to point to a temp directory so snapshot.ts operates in isolation
let tmpDir: string;

vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof os>("node:os");
  return {
    ...actual,
    homedir: () => tmpDir,
  };
});

// Mock fs-helpers to avoid MYCELIUM_HOME evaluation at import time (os.homedir() is undefined then)
vi.mock("./fs-helpers.js", async () => {
  const fsp = await import("node:fs/promises");
  const osMod = await import("node:os");
  const pathMod = await import("node:path");
  return {
    mkdirp: (dir: string) => fsp.mkdir(dir, { recursive: true }),
    get MYCELIUM_HOME() { return pathMod.join(osMod.homedir(), ".mycelium"); },
    DEFAULT_PORT: 3378,
    MEMORY_LINE_LIMIT: 200,
    readFileIfExists: vi.fn(),
  };
});

// Must import after mock setup
const { createSnapshot, restoreSnapshot, listSnapshots, deleteSnapshot } =
  await import("./snapshot.js");

async function setupMyceliumDir(): Promise<string> {
  const myceliumDir = path.join(tmpDir, ".mycelium");
  await fs.mkdir(path.join(myceliumDir, "global", "skills"), { recursive: true });

  await fs.writeFile(
    path.join(myceliumDir, "global", "mcps.yaml"),
    "mcps:\n  test: {}\n",
  );
  await fs.writeFile(
    path.join(myceliumDir, "global", "hooks.yaml"),
    "hooks: []\n",
  );
  await fs.writeFile(
    path.join(myceliumDir, "migration-manifest.json"),
    '{"version":"1","entries":[]}',
  );
  await fs.writeFile(
    path.join(myceliumDir, "marketplaces.yaml"),
    "sources: {}\n",
  );

  // Create a symlink in skills
  const targetDir = path.join(tmpDir, "skill-target");
  await fs.mkdir(targetDir, { recursive: true });
  await fs.symlink(
    targetDir,
    path.join(myceliumDir, "global", "skills", "my-skill"),
  );

  return myceliumDir;
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "snapshot-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("createSnapshot", () => {
  it("captures files and symlink targets in metadata", async () => {
    await setupMyceliumDir();
    const meta = await createSnapshot("test-snap", "A test snapshot");

    expect(meta.name).toBe("test-snap");
    expect(meta.description).toBe("A test snapshot");
    expect(meta.fileList).toContain("global/mcps.yaml");
    expect(meta.skillSymlinks["my-skill"]).toBeDefined();

    // Verify metadata.json was written
    const raw = await fs.readFile(
      path.join(tmpDir, ".mycelium", "snapshots", "test-snap", "metadata.json"),
      "utf-8",
    );
    const saved = JSON.parse(raw);
    expect(saved.name).toBe("test-snap");
  });

  it("throws on duplicate name", async () => {
    await setupMyceliumDir();
    await createSnapshot("dup");
    await expect(createSnapshot("dup")).rejects.toThrow("already exists");
  });

  it("throws on invalid name with spaces", async () => {
    await setupMyceliumDir();
    await expect(createSnapshot("bad name")).rejects.toThrow("Invalid snapshot name");
  });

  it("throws on invalid name with slashes", async () => {
    await setupMyceliumDir();
    await expect(createSnapshot("bad/name")).rejects.toThrow("Invalid snapshot name");
  });
});

describe("restoreSnapshot", () => {
  it("restores recorded config absence and old contents while preserving uncaptured directories", async () => {
    const root = await setupMyceliumDir();
    const mcps = path.join(root, "global", "mcps.yaml");
    await fs.unlink(mcps);
    await createSnapshot("absent");
    const metadata = JSON.parse(await fs.readFile(path.join(root, "snapshots", "absent", "metadata.json"), "utf8"));
    expect(metadata.formatVersion).toBe(2);
    expect(metadata.configFiles).toEqual({ "manifest.yaml": false, "global/mcps.yaml": false, "global/hooks.yaml": true, "migration-manifest.json": true, "marketplaces.yaml": true });
    await fs.writeFile(mcps, "new config");
    await fs.writeFile(path.join(root, "global", "hooks.yaml"), "new hooks");
    const native = path.join(root, "global", "skills", "native");
    await fs.mkdir(native);
    await fs.writeFile(path.join(native, "SKILL.md"), "keep");
    await fs.writeFile(path.join(root, "unmanaged.yaml"), "unmanaged");
    await restoreSnapshot("absent");
    await expect(fs.lstat(mcps)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await fs.readFile(path.join(root, "global", "hooks.yaml"), "utf8")).toBe("hooks: []\n");
    expect(await fs.readFile(path.join(native, "SKILL.md"), "utf8")).toBe("keep");
    expect(await fs.readFile(path.join(root, "unmanaged.yaml"), "utf8")).toBe("unmanaged");
  });

  it("does not infer absence from legacy metadata", async () => {
    const root = await setupMyceliumDir();
    const mcps = path.join(root, "global", "mcps.yaml");
    await fs.unlink(mcps);
    await createSnapshot("legacy");
    const metadataPath = path.join(root, "snapshots", "legacy", "metadata.json");
    const metadata = JSON.parse(await fs.readFile(metadataPath, "utf8"));
    delete metadata.formatVersion;
    delete metadata.configFiles;
    await fs.writeFile(metadataPath, JSON.stringify(metadata));
    await fs.writeFile(mcps, "keep legacy unknown");
    await fs.writeFile(path.join(root, "manifest.yaml"), "keep uncaptured manifest");
    await restoreSnapshot("legacy");
    expect(await fs.readFile(mcps, "utf8")).toBe("keep legacy unknown");
    expect(await fs.readFile(path.join(root, "manifest.yaml"), "utf8")).toBe("keep uncaptured manifest");
  });

  it("restores captured enabled manifest state after a later removal", async () => {
    const root = await setupMyceliumDir();
    const manifest = path.join(root, "manifest.yaml");
    const original = JSON.stringify({ version: "1", mcps: { server: { state: "enabled" } } });
    await fs.writeFile(manifest, original);
    const metadata = await createSnapshot("enabled");
    expect(metadata.fileList).toContain("manifest.yaml");
    await fs.writeFile(manifest, JSON.stringify({ version: "1", mcps: { server: { state: "deleted" } } }));
    await restoreSnapshot("enabled");
    expect(await fs.readFile(manifest, "utf8")).toBe(original);
  });

  it.each(["symlink", "directory"])("preflights recorded absence and preserves a new %s destination", async kind => {
    const root = await setupMyceliumDir();
    const mcps = path.join(root, "global", "mcps.yaml");
    await fs.unlink(mcps);
    await createSnapshot("absent");
    const hooks = path.join(root, "global", "hooks.yaml");
    await fs.writeFile(hooks, "current hooks");
    const sentinel = path.join(tmpDir, "sentinel");
    await fs.writeFile(sentinel, "outside");
    if (kind === "symlink") await fs.symlink(sentinel, mcps);
    else await fs.mkdir(mcps);
    await expect(restoreSnapshot("absent")).rejects.toThrow();
    expect(await fs.readFile(hooks, "utf8")).toBe("current hooks");
    expect(await fs.readFile(sentinel, "utf8")).toBe("outside");
    expect((await fs.lstat(mcps)).isSymbolicLink()).toBe(kind === "symlink");
  });

  it("rejects incomplete absence states before deleting any config", async () => {
    const root = await setupMyceliumDir();
    const mcps = path.join(root, "global", "mcps.yaml");
    await fs.unlink(mcps);
    await createSnapshot("absent");
    await fs.writeFile(mcps, "keep");
    const metadataPath = path.join(root, "snapshots", "absent", "metadata.json");
    const metadata = JSON.parse(await fs.readFile(metadataPath, "utf8"));
    delete metadata.configFiles["marketplaces.yaml"];
    await fs.writeFile(metadataPath, JSON.stringify(metadata));
    await expect(restoreSnapshot("absent")).rejects.toThrow("Invalid snapshot config states");
    expect(await fs.readFile(mcps, "utf8")).toBe("keep");
  });

  it("preserves ordinary skill directories that snapshots do not capture", async () => {
    const root = await setupMyceliumDir();
    await createSnapshot("safe");
    const native = path.join(root, "global", "skills", "native");
    await fs.mkdir(native);
    await fs.writeFile(path.join(native, "SKILL.md"), "keep");
    await restoreSnapshot("safe");
    expect(await fs.readFile(path.join(native, "SKILL.md"), "utf8")).toBe("keep");
  });

  it("validates every metadata path and reads every source before updating config", async () => {
    const root = await setupMyceliumDir();
    const metadata = await createSnapshot("unsafe");
    const metadataFile = path.join(root, "snapshots", "unsafe", "metadata.json");
    const current = path.join(root, "global", "mcps.yaml");
    await fs.writeFile(current, "current");
    metadata.fileList.push("../../../victim");
    await fs.writeFile(metadataFile, JSON.stringify(metadata));
    await expect(restoreSnapshot("unsafe")).rejects.toThrow("Invalid snapshot file");
    expect(await fs.readFile(current, "utf8")).toBe("current");
    metadata.fileList.pop();
    metadata.skillSymlinks["../../victim"] = "/outside";
    await fs.writeFile(metadataFile, JSON.stringify(metadata));
    await expect(restoreSnapshot("unsafe")).rejects.toThrow("Unsafe path component");
    expect(await fs.readFile(current, "utf8")).toBe("current");
    delete metadata.skillSymlinks["../../victim"];
    await fs.writeFile(metadataFile, JSON.stringify(metadata));
    await fs.unlink(path.join(root, "snapshots", "unsafe", "global", "hooks.yaml"));
    await expect(restoreSnapshot("unsafe")).rejects.toThrow();
    expect(await fs.readFile(current, "utf8")).toBe("current");
  });

  it("rejects restore destination-parent symlink escapes", async () => {
    const root = await setupMyceliumDir();
    await createSnapshot("safe");
    await fs.rename(path.join(root, "global"), path.join(root, "original"));
    const outside = path.join(tmpDir, "outside");
    await fs.mkdir(outside);
    await fs.writeFile(path.join(outside, "mcps.yaml"), "sentinel");
    await fs.symlink(outside, path.join(root, "global"));
    await expect(restoreSnapshot("safe")).rejects.toThrow("Path escapes root");
    expect(await fs.readFile(path.join(outside, "mcps.yaml"), "utf8")).toBe("sentinel");
  });

  it("rejects traversal names for restore and delete", async () => {
    const root = await setupMyceliumDir();
    await expect(restoreSnapshot("../global")).rejects.toThrow("Invalid snapshot name");
    await expect(deleteSnapshot("../global")).rejects.toThrow("Invalid snapshot name");
    expect(await fs.readFile(path.join(root, "global", "mcps.yaml"), "utf8")).toContain("mcps:");
  });
  it("recreates files and symlinks", async () => {
    const myceliumDir = await setupMyceliumDir();
    await createSnapshot("restore-test");

    // Delete the originals
    await fs.rm(path.join(myceliumDir, "global", "mcps.yaml"));
    await fs.rm(path.join(myceliumDir, "global", "skills", "my-skill"));
    await restoreSnapshot("restore-test");

    // Verify restored
    const mcps = await fs.readFile(
      path.join(myceliumDir, "global", "mcps.yaml"),
      "utf-8",
    );
    expect(mcps).toContain("mcps:");

    const symlinkTarget = await fs.readlink(
      path.join(myceliumDir, "global", "skills", "my-skill"),
    );
    expect(symlinkTarget).toContain("skill-target");
  });

  it("throws on non-existent snapshot", async () => {
    await setupMyceliumDir();
    await expect(restoreSnapshot("nope")).rejects.toThrow("not found");
  });
});

describe("listSnapshots", () => {
  it("returns snapshots sorted by date descending", async () => {
    await setupMyceliumDir();
    await createSnapshot("first");
    // Small delay to ensure different timestamps
    await new Promise((r) => setTimeout(r, 10));
    await createSnapshot("second");

    const list = await listSnapshots();
    expect(list).toHaveLength(2);
    expect(list[0].name).toBe("second");
    expect(list[1].name).toBe("first");
  });

  it("returns empty array when no snapshots exist", async () => {
    await setupMyceliumDir();
    const list = await listSnapshots();
    expect(list).toEqual([]);
  });
});

describe("deleteSnapshot", () => {
  it("removes snapshot directory", async () => {
    await setupMyceliumDir();
    await createSnapshot("to-delete");
    await deleteSnapshot("to-delete");

    const list = await listSnapshots();
    expect(list).toHaveLength(0);
  });

  it("throws on non-existent snapshot", async () => {
    await setupMyceliumDir();
    await expect(deleteSnapshot("nope")).rejects.toThrow("not found");
  });
});
