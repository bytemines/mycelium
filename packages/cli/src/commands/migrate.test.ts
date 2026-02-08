import { describe, it, expect, vi, beforeEach } from "vitest";

const mockScanAllTools = vi.fn();
const mockScanTool = vi.fn();
const mockGenerateMigrationPlan = vi.fn();
const mockExecuteMigration = vi.fn();
const mockClearMigration = vi.fn();
const mockWriteHooksYaml = vi.fn();
const mockCreateSnapshot = vi.fn();
const mockRestoreSnapshot = vi.fn();
const mockListSnapshots = vi.fn();
const mockDeleteSnapshot = vi.fn();

vi.mock("../core/migrator/index.js", () => ({
  scanAllTools: mockScanAllTools,
  scanTool: mockScanTool,
  generateMigrationPlan: mockGenerateMigrationPlan,
  executeMigration: mockExecuteMigration,
  clearMigration: mockClearMigration,
  writeHooksYaml: mockWriteHooksYaml,
}));

vi.mock("../core/snapshot.js", () => ({
  createSnapshot: mockCreateSnapshot,
  restoreSnapshot: mockRestoreSnapshot,
  listSnapshots: mockListSnapshots,
  deleteSnapshot: mockDeleteSnapshot,
}));

const emptyScan = {
  toolName: "claude-code",
  installed: true,
  skills: [],
  mcps: [],
  memory: [],
  hooks: [],
};

const emptyPlan = {
  skills: [],
  mcps: [],
  memory: [],
  conflicts: [],
};

describe("migrateCommand", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
    mockScanAllTools.mockResolvedValue([emptyScan]);
    mockGenerateMigrationPlan.mockReturnValue(emptyPlan);
    mockExecuteMigration.mockResolvedValue({ skillsImported: 0, mcpsImported: 0, memoryImported: 0, errors: [] });
  });

  it("exports a Command named 'migrate'", async () => {
    const { migrateCommand } = await import("./migrate.js");
    expect(migrateCommand.name()).toBe("migrate");
  });

  it("dry-run scans all tools and generates plan without executing", async () => {
    const { migrateCommand } = await import("./migrate.js");
    await migrateCommand.parseAsync([], { from: "user" });

    expect(mockScanAllTools).toHaveBeenCalled();
    expect(mockGenerateMigrationPlan).toHaveBeenCalled();
    expect(mockExecuteMigration).not.toHaveBeenCalled();
  });

  it("--apply triggers executeMigration", async () => {
    const { migrateCommand } = await import("./migrate.js");
    await migrateCommand.parseAsync(["--apply"], { from: "user" });

    expect(mockScanAllTools).toHaveBeenCalled();
    expect(mockExecuteMigration).toHaveBeenCalledWith(emptyPlan);
  });

  it("--tool scans only that tool", async () => {
    mockScanTool.mockResolvedValue(emptyScan);
    const { migrateCommand } = await import("./migrate.js");
    await migrateCommand.parseAsync(["--tool", "codex"], { from: "user" });

    expect(mockScanTool).toHaveBeenCalledWith("codex");
    expect(mockScanAllTools).not.toHaveBeenCalled();
  });

  it("--clear --apply triggers clearMigration", async () => {
    mockClearMigration.mockResolvedValue({ cleared: [], errors: [] });
    const { migrateCommand } = await import("./migrate.js");
    await migrateCommand.parseAsync(["--clear", "--apply"], { from: "user" });

    expect(mockClearMigration).toHaveBeenCalledWith(undefined);
    expect(mockScanAllTools).not.toHaveBeenCalled();
  });

  it("--snapshot creates a snapshot", async () => {
    mockCreateSnapshot.mockResolvedValue({ name: "v1", fileList: ["a"], skillSymlinks: {} });
    const { migrateCommand } = await import("./migrate.js");
    await migrateCommand.parseAsync(["--snapshot", "v1"], { from: "user" });

    expect(mockCreateSnapshot).toHaveBeenCalledWith("v1");
  });

  it("--restore restores a snapshot", async () => {
    const { migrateCommand } = await import("./migrate.js");
    await migrateCommand.parseAsync(["--restore", "v1"], { from: "user" });

    expect(mockRestoreSnapshot).toHaveBeenCalledWith("v1");
  });

  it("--snapshots lists snapshots", async () => {
    mockListSnapshots.mockResolvedValue([]);
    const { migrateCommand } = await import("./migrate.js");
    await migrateCommand.parseAsync(["--snapshots"], { from: "user" });

    expect(mockListSnapshots).toHaveBeenCalled();
  });

  it("--snapshot-delete deletes a snapshot", async () => {
    const { migrateCommand } = await import("./migrate.js");
    await migrateCommand.parseAsync(["--snapshot-delete", "old"], { from: "user" });

    expect(mockDeleteSnapshot).toHaveBeenCalledWith("old");
  });

  it("--apply writes hooks when scans contain hooks", async () => {
    const scanWithHooks = { ...emptyScan, hooks: [{ event: "pre-commit", command: "lint" }] };
    mockScanAllTools.mockResolvedValue([scanWithHooks]);
    const { migrateCommand } = await import("./migrate.js");
    await migrateCommand.parseAsync(["--apply"], { from: "user" });

    expect(mockWriteHooksYaml).toHaveBeenCalledWith([{ event: "pre-commit", command: "lint" }]);
  });
});
