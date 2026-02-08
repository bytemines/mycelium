import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../core/migrator/index.js", () => ({
  scanAllTools: vi.fn(),
  scanTool: vi.fn(),
  generateMigrationPlan: vi.fn(),
  executeMigration: vi.fn(),
  clearMigration: vi.fn(),
  writeHooksYaml: vi.fn(),
}));

vi.mock("../core/snapshot.js", () => ({
  createSnapshot: vi.fn(),
  restoreSnapshot: vi.fn(),
  listSnapshots: vi.fn(),
  deleteSnapshot: vi.fn(),
}));

describe("migrateCommand", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("exports a Command named 'migrate'", async () => {
    const { migrateCommand } = await import("./migrate.js");
    expect(migrateCommand.name()).toBe("migrate");
  });

  it("has --apply option", async () => {
    const { migrateCommand } = await import("./migrate.js");
    const opt = migrateCommand.options.find((o) => o.long === "--apply");
    expect(opt).toBeDefined();
  });

  it("has --tool option", async () => {
    const { migrateCommand } = await import("./migrate.js");
    const opt = migrateCommand.options.find((o) => o.long === "--tool");
    expect(opt).toBeDefined();
  });

  it("has --skills-only and --mcps-only options", async () => {
    const { migrateCommand } = await import("./migrate.js");
    const skillsOpt = migrateCommand.options.find((o) => o.long === "--skills-only");
    const mcpsOpt = migrateCommand.options.find((o) => o.long === "--mcps-only");
    expect(skillsOpt).toBeDefined();
    expect(mcpsOpt).toBeDefined();
  });

  it("has --clear option", async () => {
    const { migrateCommand } = await import("./migrate.js");
    const opt = migrateCommand.options.find((o) => o.long === "--clear");
    expect(opt).toBeDefined();
  });

  it("has --strategy option with default 'latest'", async () => {
    const { migrateCommand } = await import("./migrate.js");
    const opt = migrateCommand.options.find((o) => o.long === "--strategy");
    expect(opt).toBeDefined();
    expect(opt!.defaultValue).toBe("latest");
  });

  it("has snapshot-related options", async () => {
    const { migrateCommand } = await import("./migrate.js");
    const snapshot = migrateCommand.options.find((o) => o.long === "--snapshot");
    const restore = migrateCommand.options.find((o) => o.long === "--restore");
    const snapshots = migrateCommand.options.find((o) => o.long === "--snapshots");
    const del = migrateCommand.options.find((o) => o.long === "--snapshot-delete");
    expect(snapshot).toBeDefined();
    expect(restore).toBeDefined();
    expect(snapshots).toBeDefined();
    expect(del).toBeDefined();
  });
});
