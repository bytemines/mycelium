import { describe, expect, it, vi } from "vitest";
const { mockExecFile } = vi.hoisted(() => ({ mockExecFile: vi.fn() }));
vi.mock("node:child_process", () => ({ execFile: mockExecFile }));
vi.mock("node:util", () => ({ promisify: () => mockExecFile }));
import { BaseToolAdapter, execCli, isAbsentCliRemoval } from "./adapter-base.js";

describe("native execution safety", () => {
  it("redacts known env/key arguments and echoed output without changing executed argv", async () => {
    const args = ["mcp", "add", "fixture", "--env", "API_KEY=fake-env-secret", "--api-key", "fake-key-secret"];
    mockExecFile.mockRejectedValueOnce(Object.assign(new Error(`Command failed: fixture-cli ${args.join(" ")}`), {
      code: 1, stdout: "fake-env-secret", stderr: "Permission denied fake-key-secret",
    }));
    try {
      await execCli("fixture-cli", args);
      expect.fail("expected failure");
    } catch (err) {
      const error = err as Error & { code: number; stdout: string; stderr: string };
      expect(error.message).toContain("API_KEY=[REDACTED]");
      expect(error.message).not.toContain("fake-env-secret");
      expect(error.message).not.toContain("fake-key-secret");
      expect(error.code).toBe(1);
      expect(error.stdout).toBe("[REDACTED]");
      expect(error.stderr).toBe("Permission denied [REDACTED]");
    }
    expect(mockExecFile).toHaveBeenCalledWith("fixture-cli", args, { timeout: 30000 });
  });

  it("requires an exact name-specific stderr and normal exit, not a message substring", () => {
    const stderr = "No user-scoped MCP server found with name: vendor/server";
    const fixture = Object.assign(new Error(stderr), { code: 1, stdout: "", stderr });
    expect(isAbsentCliRemoval("claude-code", "vendor/server", fixture)).toBe(true);
    expect(isAbsentCliRemoval("claude-code", "vendor/server", new Error(stderr))).toBe(false);
    expect(isAbsentCliRemoval("claude-code", "vendor/server", { ...fixture, stderr })).toBe(false);
    expect(isAbsentCliRemoval("claude-code", "vendor/server", Object.assign(new Error(stderr), { code: "EACCES", stderr }))).toBe(false);
    expect(isAbsentCliRemoval("claude-code", "vendor/server", Object.assign(new Error(stderr), { code: 1, stdout: "Authentication failed", stderr }))).toBe(false);
  });
});

class NativeAdapter extends BaseToolAdapter {
  toolId = "test";
  hasCli = vi.fn().mockResolvedValue(true);
  addViaCli = vi.fn().mockResolvedValue({ success: true, method: "cli" });
  removeViaCli = vi.fn().mockResolvedValue({ success: true, method: "cli" });
  writeToFile = vi.fn().mockResolvedValue({ success: true, method: "file" });
  removeFromFile = vi.fn().mockResolvedValue({ success: true, method: "file" });
}

describe("native adapter sync", () => {
  it("treats an absent file registration as an idempotent remove, but preserves real errors", async () => {
    const adapter = new NativeAdapter();
    adapter.hasCli.mockResolvedValue(false);
    for (const error of ["Config not found", "server not found"]) {
      adapter.removeFromFile.mockResolvedValue({ success: false, method: "file", error });
      expect((await adapter.remove("server")).success).toBe(true);
    }
    adapter.removeFromFile.mockResolvedValue({ success: false, method: "file", error: "permission denied" });
    expect(await adapter.remove("server")).toMatchObject({ success: false, error: "permission denied" });
  });
  it("reconciles only explicit tombstones and leaves unrelated native registrations alone", async () => {
    const adapter = new NativeAdapter();
    const registrations = new Set(["deleted", "disabled", "unmanaged"]);
    adapter.removeViaCli.mockImplementation(async name => {
      registrations.delete(name);
      return { success: true, method: "cli" };
    });
    const result = await adapter.syncAll({
      enabled: { command: "safe" },
      deleted: { command: "safe", state: "deleted" },
      disabled: { command: "safe", state: "disabled" },
    });
    expect(result.success).toBe(true);
    expect(adapter.addViaCli).toHaveBeenCalledExactlyOnceWith("enabled", { command: "safe" });
    expect(adapter.removeViaCli.mock.calls).toEqual([["deleted"], ["disabled"]]);
    expect(registrations).toEqual(new Set(["unmanaged"]));
    expect(adapter.writeToFile).not.toHaveBeenCalled();
  });

  it("propagates native tombstone removal failures", async () => {
    const adapter = new NativeAdapter();
    adapter.removeViaCli.mockResolvedValue({ success: false, method: "cli", error: "native failure" });
    expect(await adapter.syncAll({ deleted: { command: "safe", state: "deleted" } })).toMatchObject({
      success: false, error: "deleted: native failure",
    });
  });
});
