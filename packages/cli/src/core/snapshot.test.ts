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
