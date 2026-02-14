import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  access: vi.fn(),
  mkdir: vi.fn(),
  rm: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
  lstat: vi.fn().mockRejectedValue(new Error("ENOENT")),
}));

vi.mock("@mycelish/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mycelish/core")>();
  return {
    ...actual,
    expandPath: vi.fn((p: string) => p.replace("~", "/mock/home")),
  };
});

const MANIFEST_DIR = "/test/project/.mycelium";

describe("remove command", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("removeItem", () => {
    it("sets state: deleted on a skill", async () => {
      const yaml = await import("yaml");
      const manifest = {
        version: "1",
        skills: { "my-skill": { enabled: true, source: "local" } },
      };
      vi.mocked(fs.readFile).mockResolvedValue(yaml.stringify(manifest));
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const { removeItem } = await import("./remove.js");
      const result = await removeItem("my-skill", { manifestDir: MANIFEST_DIR });

      expect(result.success).toBe(true);
      expect(result.section).toBe("skill");

      // Verify saved manifest has state: deleted
      const writeCall = vi.mocked(fs.writeFile).mock.calls[0];
      expect(writeCall[0]).toBe(path.join(MANIFEST_DIR, "manifest.yaml"));
      const saved = yaml.parse(writeCall[1] as string);
      expect(saved.skills["my-skill"].state).toBe("deleted");
    });

    it("sets state: deleted on an MCP", async () => {
      const yaml = await import("yaml");
      const manifest = {
        version: "1",
        mcps: { "my-mcp": { command: "npx", source: "local" } },
      };
      vi.mocked(fs.readFile).mockResolvedValue(yaml.stringify(manifest));
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const { removeItem } = await import("./remove.js");
      const result = await removeItem("my-mcp", { manifestDir: MANIFEST_DIR });

      expect(result.success).toBe(true);
      expect(result.section).toBe("mcp");

      const saved = yaml.parse(vi.mocked(fs.writeFile).mock.calls[0][1] as string);
      expect(saved.mcps["my-mcp"].state).toBe("deleted");
    });

    it("sets state: deleted on a hook", async () => {
      const yaml = await import("yaml");
      const manifest = {
        version: "1",
        hooks: { "my-hook": { event: "PreToolUse" } },
      };
      vi.mocked(fs.readFile).mockResolvedValue(yaml.stringify(manifest));
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const { removeItem } = await import("./remove.js");
      const result = await removeItem("my-hook", { manifestDir: MANIFEST_DIR });

      expect(result.success).toBe(true);
      expect(result.section).toBe("hook");
    });

    it("returns error when item not found", async () => {
      const yaml = await import("yaml");
      vi.mocked(fs.readFile).mockResolvedValue(yaml.stringify({ version: "1", skills: {} }));

      const { removeItem } = await import("./remove.js");
      const result = await removeItem("nonexistent", { manifestDir: MANIFEST_DIR });

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("returns error when manifest cannot be loaded", async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"));
      vi.mocked(fs.access).mockRejectedValue(new Error("ENOENT"));

      const { removeItem } = await import("./remove.js");
      const result = await removeItem("anything", { manifestDir: MANIFEST_DIR });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Could not load manifest");
    });

    it("returns collision error when name exists in multiple sections", async () => {
      const yaml = await import("yaml");
      const manifest = {
        version: "1",
        skills: { "shared-name": { source: "local" } },
        mcps: { "shared-name": { command: "npx" } },
      };
      vi.mocked(fs.readFile).mockResolvedValue(yaml.stringify(manifest));

      const { removeItem } = await import("./remove.js");
      const result = await removeItem("shared-name", { manifestDir: MANIFEST_DIR });

      expect(result.success).toBe(false);
      expect(result.error).toContain("multiple sections");
      expect(result.error).toContain("--type");
    });

    it("resolves collision with --type flag", async () => {
      const yaml = await import("yaml");
      const manifest = {
        version: "1",
        skills: { "shared-name": { source: "local" } },
        mcps: { "shared-name": { command: "npx" } },
      };
      vi.mocked(fs.readFile).mockResolvedValue(yaml.stringify(manifest));
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const { removeItem } = await import("./remove.js");
      const result = await removeItem("shared-name", { type: "mcp", manifestDir: MANIFEST_DIR });

      expect(result.success).toBe(true);
      expect(result.section).toBe("mcp");

      const saved = yaml.parse(vi.mocked(fs.writeFile).mock.calls[0][1] as string);
      expect(saved.mcps["shared-name"].state).toBe("deleted");
      // Skill should be untouched
      expect(saved.skills["shared-name"].state).toBeUndefined();
    });

    it("removes files by default (purge is now default)", async () => {
      const yaml = await import("yaml");
      const manifest = {
        version: "1",
        skills: { "my-skill": { state: "enabled", source: "anthropic-skills" } },
      };
      vi.mocked(fs.readFile).mockResolvedValue(yaml.stringify(manifest));
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const { removeItem } = await import("./remove.js");
      const result = await removeItem("my-skill", { manifestDir: MANIFEST_DIR });

      expect(result.success).toBe(true);
      expect(result.message).toContain("removed");

      // Verify fs.rm was called to delete source files
      expect(fs.rm).toHaveBeenCalled();
    });

    it("returns error for invalid --type", async () => {
      const yaml = await import("yaml");
      vi.mocked(fs.readFile).mockResolvedValue(yaml.stringify({ version: "1", skills: { x: {} } }));

      const { removeItem } = await import("./remove.js");
      const result = await removeItem("x", { type: "bogus", manifestDir: MANIFEST_DIR });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid type");
    });
  });

  describe("removeBySource", () => {
    it("marks all items from a source as deleted", async () => {
      const yaml = await import("yaml");
      const manifest = {
        version: "1",
        skills: {
          "skill-a": { source: "my-plugin" },
          "skill-b": { source: "my-plugin" },
          "skill-c": { source: "other" },
        },
        mcps: {
          "mcp-a": { source: "my-plugin", command: "npx" },
        },
      };
      vi.mocked(fs.readFile).mockResolvedValue(yaml.stringify(manifest));
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const { removeBySource } = await import("./remove.js");
      const result = await removeBySource("my-plugin", { manifestDir: MANIFEST_DIR });

      expect(result.removed).toHaveLength(3);
      expect(result.removed).toContain("skill: skill-a");
      expect(result.removed).toContain("skill: skill-b");
      expect(result.removed).toContain("mcp: mcp-a");
      expect(result.errors).toHaveLength(0);

      const saved = yaml.parse(vi.mocked(fs.writeFile).mock.calls[0][1] as string);
      expect(saved.skills["skill-a"].state).toBe("deleted");
      expect(saved.skills["skill-b"].state).toBe("deleted");
      expect(saved.skills["skill-c"].state).toBeUndefined();
      expect(saved.mcps["mcp-a"].state).toBe("deleted");
    });

    it("returns error when no items found for source", async () => {
      const yaml = await import("yaml");
      vi.mocked(fs.readFile).mockResolvedValue(yaml.stringify({ version: "1", skills: {} }));

      const { removeBySource } = await import("./remove.js");
      const result = await removeBySource("nonexistent", { manifestDir: MANIFEST_DIR });

      expect(result.removed).toHaveLength(0);
      expect(result.errors[0]).toContain("No items found");
    });
  });

  describe("removeCommand", () => {
    it("exports a Command named 'remove'", async () => {
      const { removeCommand } = await import("./remove.js");
      expect(removeCommand.name()).toBe("remove");
    });

    it("has plugin subcommand", async () => {
      const { removeCommand } = await import("./remove.js");
      const names = removeCommand.commands.map((c) => c.name());
      expect(names).toContain("plugin");
    });

    it("does not have old skill/mcp/hook subcommands", async () => {
      const { removeCommand } = await import("./remove.js");
      const names = removeCommand.commands.map((c) => c.name());
      expect(names).not.toContain("skill");
      expect(names).not.toContain("mcp");
      expect(names).not.toContain("hook");
    });
  });
});
