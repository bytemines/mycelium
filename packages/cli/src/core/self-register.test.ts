import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
}));

vi.mock("./sync-writer.js", () => ({
  syncToTool: vi.fn().mockResolvedValue({
    configPath: "/test",
    backupPath: "/test.bak",
    sectionsUpdated: ["mcps"],
    success: true,
  }),
}));

describe("buildSelfMcpEntry", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns npx entry when mycelium not in PATH", async () => {
    vi.doMock("node:child_process", () => ({
      execFileSync: vi.fn().mockImplementation(() => {
        throw new Error("not found");
      }),
    }));
    const { buildSelfMcpEntry } = await import("./self-register.js");
    const entry = buildSelfMcpEntry();
    expect(entry.command).toBe("npx");
    expect(entry.args).toContain("@mycelish/cli");
    expect(entry.args).toContain("mcp");
  });

  it("returns direct entry when mycelium is in PATH", async () => {
    vi.doMock("node:child_process", () => ({
      execFileSync: vi.fn().mockReturnValue("/usr/local/bin/mycelium\n"),
    }));
    const { buildSelfMcpEntry } = await import("./self-register.js");
    const entry = buildSelfMcpEntry();
    expect(entry.command).toBe("mycelium");
    expect(entry.args).toEqual(["mcp"]);
  });
});

describe("selfRegister", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("calls syncToTool for each tool and returns results", async () => {
    vi.doMock("node:child_process", () => ({
      execFileSync: vi.fn().mockReturnValue("/usr/local/bin/mycelium\n"),
    }));
    const mockSyncToTool = vi.fn().mockResolvedValue({
      configPath: "/test",
      backupPath: "/test.bak",
      sectionsUpdated: ["mcps"],
      success: true,
    });
    vi.doMock("./sync-writer.js", () => ({
      syncToTool: mockSyncToTool,
    }));
    const { selfRegister } = await import("./self-register.js");
    const results = await selfRegister();
    // Should have called syncToTool for each tool in ALL_TOOL_IDS
    expect(mockSyncToTool).toHaveBeenCalled();
    const successCount = Object.values(results).filter(Boolean).length;
    expect(successCount).toBeGreaterThan(0);
  });

  it("handles syncToTool failures gracefully", async () => {
    vi.doMock("node:child_process", () => ({
      execFileSync: vi.fn().mockReturnValue("/usr/local/bin/mycelium\n"),
    }));
    vi.doMock("./sync-writer.js", () => ({
      syncToTool: vi.fn().mockRejectedValue(new Error("write failed")),
    }));
    const { selfRegister } = await import("./self-register.js");
    const results = await selfRegister();
    // All should be false but no throw
    const allFalse = Object.values(results).every((v) => v === false);
    expect(allFalse).toBe(true);
  });
});
