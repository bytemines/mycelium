import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:fs/promises", () => ({
  unlink: vi.fn(),
  writeFile: vi.fn(),
  readdir: vi.fn(),
}));

vi.mock("../core/fs-helpers.js", () => ({
  readFileIfExists: vi.fn(),
  mkdirp: vi.fn(),
  MYCELIUM_HOME: "/mock/home/.mycelium",
}));

vi.mock("../core/migrator/index.js", () => ({
  loadManifest: vi.fn(),
  saveManifest: vi.fn(),
}));

describe("remove command", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("removeSkill", () => {
    it("removes a skill that exists in manifest", async () => {
      const { loadManifest, saveManifest } = await import("../core/migrator/index.js");
      vi.mocked(loadManifest).mockResolvedValue({
        entries: [{ type: "skill", name: "my-skill", source: "local" }],
      } as any);
      vi.mocked(saveManifest).mockResolvedValue(undefined);

      const { removeSkill } = await import("./remove.js");
      const result = await removeSkill("my-skill");

      expect(result.removed).toBe(true);
      expect(saveManifest).toHaveBeenCalled();
    });

    it("returns error when skill not in manifest", async () => {
      const { loadManifest } = await import("../core/migrator/index.js");
      vi.mocked(loadManifest).mockResolvedValue({ entries: [] } as any);

      const { removeSkill } = await import("./remove.js");
      const result = await removeSkill("nonexistent");

      expect(result.removed).toBe(false);
      expect(result.error).toContain("not found");
    });
  });

  describe("removeMcp", () => {
    it("removes an MCP from mcps.yaml", async () => {
      const { readFileIfExists } = await import("../core/fs-helpers.js");
      const { loadManifest, saveManifest } = await import("../core/migrator/index.js");
      const fs = await import("node:fs/promises");

      vi.mocked(readFileIfExists).mockResolvedValue("my-mcp:\n  command: npx\n");
      vi.mocked(loadManifest).mockResolvedValue({ entries: [{ type: "mcp", name: "my-mcp", source: "local" }] } as any);
      vi.mocked(saveManifest).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const { removeMcp } = await import("./remove.js");
      const result = await removeMcp("my-mcp");

      expect(result.removed).toBe(true);
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it("returns error when mcps.yaml not found", async () => {
      const { readFileIfExists } = await import("../core/fs-helpers.js");
      vi.mocked(readFileIfExists).mockResolvedValue(null);

      const { removeMcp } = await import("./remove.js");
      const result = await removeMcp("missing");

      expect(result.removed).toBe(false);
      expect(result.error).toContain("No mcps.yaml");
    });

    it("returns error when MCP not found in mcps.yaml", async () => {
      const { readFileIfExists } = await import("../core/fs-helpers.js");
      vi.mocked(readFileIfExists).mockResolvedValue("other-mcp:\n  command: node\n");

      const { removeMcp } = await import("./remove.js");
      const result = await removeMcp("nonexistent");

      expect(result.removed).toBe(false);
      expect(result.error).toContain("not found");
    });
  });

  describe("removeHook", () => {
    it("removes a hook from hooks.yaml", async () => {
      const { readFileIfExists } = await import("../core/fs-helpers.js");
      const { loadManifest, saveManifest } = await import("../core/migrator/index.js");
      const fs = await import("node:fs/promises");

      vi.mocked(readFileIfExists).mockResolvedValue("my-hook:\n  event: PreToolUse\n");
      vi.mocked(loadManifest).mockResolvedValue({ entries: [{ type: "hook", name: "my-hook", source: "local" }] } as any);
      vi.mocked(saveManifest).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const { removeHook } = await import("./remove.js");
      const result = await removeHook("my-hook");

      expect(result.removed).toBe(true);
    });

    it("returns error when hooks.yaml not found", async () => {
      const { readFileIfExists } = await import("../core/fs-helpers.js");
      vi.mocked(readFileIfExists).mockResolvedValue(null);

      const { removeHook } = await import("./remove.js");
      const result = await removeHook("missing");

      expect(result.removed).toBe(false);
      expect(result.error).toContain("No hooks.yaml");
    });
  });

  describe("removeCommand", () => {
    it("exports a Command named 'remove'", async () => {
      const { removeCommand } = await import("./remove.js");
      expect(removeCommand.name()).toBe("remove");
    });

    it("has skill, mcp, hook, plugin subcommands", async () => {
      const { removeCommand } = await import("./remove.js");
      const names = removeCommand.commands.map((c) => c.name());
      expect(names).toContain("skill");
      expect(names).toContain("mcp");
      expect(names).toContain("hook");
      expect(names).toContain("plugin");
    });
  });
});
