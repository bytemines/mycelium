/**
 * Tests for zero-friction auto-setup (mycelium init)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isGhAvailable,
  ghRepoExists,
  getGhUsername,
  hasGitRemote,
} from "../commands/init.js";

// Mock child_process
vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
  execFileSync: vi.fn(),
}));

import { execSync } from "node:child_process";
const mockedExecSync = vi.mocked(execSync);

describe("init auto-setup helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("isGhAvailable", () => {
    it("returns true when gh auth status succeeds", () => {
      mockedExecSync.mockReturnValueOnce("" as any);
      expect(isGhAvailable()).toBe(true);
    });

    it("returns false when gh is not installed", () => {
      mockedExecSync.mockImplementationOnce(() => {
        throw new Error("command not found");
      });
      expect(isGhAvailable()).toBe(false);
    });
  });

  describe("ghRepoExists", () => {
    it("returns true when repo exists", () => {
      mockedExecSync.mockReturnValueOnce('{"name":"mycelium-config"}' as any);
      expect(ghRepoExists("user/mycelium-config")).toBe(true);
    });

    it("returns false when repo not found", () => {
      mockedExecSync.mockImplementationOnce(() => {
        throw new Error("not found");
      });
      expect(ghRepoExists("user/mycelium-config")).toBe(false);
    });
  });

  describe("getGhUsername", () => {
    it("returns trimmed username", () => {
      mockedExecSync.mockReturnValueOnce("conrado\n" as any);
      expect(getGhUsername()).toBe("conrado");
    });
  });

  describe("hasGitRemote", () => {
    it("returns true when origin is configured", () => {
      mockedExecSync.mockReturnValueOnce("https://github.com/user/repo.git\n" as any);
      expect(hasGitRemote()).toBe(true);
    });

    it("returns false when no remote", () => {
      mockedExecSync.mockImplementationOnce(() => {
        throw new Error("not a git repo");
      });
      expect(hasGitRemote()).toBe(false);
    });
  });
});
