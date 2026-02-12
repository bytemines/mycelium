import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "node:fs/promises";

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  access: vi.fn(),
}));

vi.mock("@mycelish/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mycelish/core")>();
  return {
    ...actual,
    expandPath: (p: string) => p.replace("~", "/mock/home"),
  };
});

describe("manifest-state", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("loadStateManifest", () => {
    it("loads existing manifest.yaml", async () => {
      const yaml = await import("yaml");
      const manifest = { version: "1.0.0", skills: { "my-skill": { state: "enabled" } } };
      vi.mocked(fs.readFile).mockResolvedValue(yaml.stringify(manifest));

      const { loadStateManifest } = await import("./manifest-state.js");
      const result = await loadStateManifest("/test/.mycelium");

      expect(result).toBeTruthy();
      expect(result!.skills!["my-skill"].state).toBe("enabled");
    });

    it("auto-creates empty manifest when dir exists but file doesn't", async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"));
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const { loadStateManifest } = await import("./manifest-state.js");
      const result = await loadStateManifest("/test/.mycelium");

      expect(result).toBeTruthy();
      expect(result!.version).toBe("1.0.0");
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it("returns null when dir doesn't exist", async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"));
      vi.mocked(fs.access).mockRejectedValue(new Error("ENOENT"));

      const { loadStateManifest } = await import("./manifest-state.js");
      const result = await loadStateManifest("/nonexistent/.mycelium");

      expect(result).toBeNull();
    });
  });

  describe("findItemType", () => {
    it("finds items across all 5 section types", async () => {
      const { findItemType } = await import("./manifest-state.js");
      const manifest = {
        version: "1.0.0",
        skills: { "my-skill": { state: "enabled" as const } },
        mcps: { "my-mcp": { state: "enabled" as const } },
        hooks: { "my-hook": { state: "enabled" as const } },
        agents: { "my-agent": { state: "enabled" as const } },
        commands: { "my-cmd": { state: "enabled" as const } },
      };

      expect(findItemType(manifest, "my-skill")!.type).toBe("skill");
      expect(findItemType(manifest, "my-mcp")!.type).toBe("mcp");
      expect(findItemType(manifest, "my-hook")!.type).toBe("hook");
      expect(findItemType(manifest, "my-agent")!.type).toBe("agent");
      expect(findItemType(manifest, "my-cmd")!.type).toBe("command");
      expect(findItemType(manifest, "nonexistent")).toBeNull();
    });
  });

  describe("getDisabledItems", () => {
    it("returns disabled and deleted items from global manifest", async () => {
      const yaml = await import("yaml");
      const manifest = {
        version: "1.0.0",
        skills: { "enabled-skill": { state: "enabled" }, "disabled-skill": { state: "disabled" } },
        mcps: { "deleted-mcp": { state: "deleted" } },
        agents: { "disabled-agent": { state: "disabled" } },
        commands: { "active-cmd": { state: "enabled" } },
      };
      vi.mocked(fs.readFile).mockResolvedValue(yaml.stringify(manifest));

      const { getDisabledItems } = await import("./manifest-state.js");
      const disabled = await getDisabledItems();

      expect(disabled.has("disabled-skill")).toBe(true);
      expect(disabled.has("deleted-mcp")).toBe(true);
      expect(disabled.has("disabled-agent")).toBe(true);
      expect(disabled.has("enabled-skill")).toBe(false);
      expect(disabled.has("active-cmd")).toBe(false);
    });

    it("project manifest overrides global (re-enable)", async () => {
      const yaml = await import("yaml");
      const globalManifest = {
        version: "1.0.0",
        agents: { "code-reviewer": { state: "disabled" } },
      };
      const projectManifest = {
        version: "1.0.0",
        agents: { "code-reviewer": { state: "enabled" } },
      };
      vi.mocked(fs.readFile)
        .mockResolvedValueOnce(yaml.stringify(globalManifest))
        .mockResolvedValueOnce(yaml.stringify(projectManifest));

      const { getDisabledItems } = await import("./manifest-state.js");
      const disabled = await getDisabledItems("/project");

      expect(disabled.has("code-reviewer")).toBe(false);
    });
  });

  describe("sectionForType", () => {
    it("maps all item types to section keys", async () => {
      const { sectionForType } = await import("./manifest-state.js");
      expect(sectionForType("skill")).toBe("skills");
      expect(sectionForType("mcp")).toBe("mcps");
      expect(sectionForType("hook")).toBe("hooks");
      expect(sectionForType("agent")).toBe("agents");
      expect(sectionForType("command")).toBe("commands");
      expect(sectionForType("invalid")).toBeNull();
    });
  });

  describe("ITEM_SECTIONS extensibility", () => {
    it("ALL_ITEM_TYPES includes all 5 types", async () => {
      const { ALL_ITEM_TYPES } = await import("./manifest-state.js");
      expect(ALL_ITEM_TYPES).toContain("skill");
      expect(ALL_ITEM_TYPES).toContain("mcp");
      expect(ALL_ITEM_TYPES).toContain("hook");
      expect(ALL_ITEM_TYPES).toContain("agent");
      expect(ALL_ITEM_TYPES).toContain("command");
      expect(ALL_ITEM_TYPES).toHaveLength(5);
    });
  });
});
