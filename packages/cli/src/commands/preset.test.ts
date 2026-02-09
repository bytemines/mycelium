import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn(),
  writeFile: vi.fn(),
  readFile: vi.fn(),
  readdir: vi.fn(),
}));

vi.mock("@mycelish/core", () => ({
  expandPath: (p: string) => p.replace("~", "/mock/home"),
}));

describe("createPreset", () => {
  it("creates a preset from config", async () => {
    const { createPreset } = await import("../core/presets.js");
    const preset = createPreset("dev", {
      skills: ["skill-a", "skill-b"],
      mcps: ["mcp-1"],
      memory: { scopes: ["global"] },
    });

    expect(preset.name).toBe("dev");
    expect(preset.skills).toEqual(["skill-a", "skill-b"]);
    expect(preset.mcps).toEqual(["mcp-1"]);
    expect(preset.memory.scopes).toEqual(["global"]);
  });
});

describe("applyPreset", () => {
  it("computes enable/disable actions", async () => {
    const { applyPreset } = await import("../core/presets.js");
    const actions = applyPreset(
      { name: "dev", skills: ["a"], mcps: ["x"], memory: { scopes: [] } },
      { allSkills: ["a", "b", "c"], allMcps: ["x", "y"] },
    );

    expect(actions.enableSkills).toEqual(["a"]);
    expect(actions.disableSkills).toEqual(["b", "c"]);
    expect(actions.enableMcps).toEqual(["x"]);
    expect(actions.disableMcps).toEqual(["y"]);
  });
});

describe("exportPreset", () => {
  it("returns YAML string", async () => {
    const { exportPreset } = await import("../core/presets.js");
    const yaml = exportPreset({
      name: "test",
      skills: ["s1"],
      mcps: [],
      memory: { scopes: [] },
    });

    expect(yaml).toContain("name: test");
    expect(yaml).toContain("s1");
  });
});

describe("savePreset / loadPreset / listPresets", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("savePreset writes to disk", async () => {
    const fs = await import("node:fs/promises");
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const { savePreset } = await import("../core/presets.js");
    await savePreset({
      name: "my-preset",
      skills: [],
      mcps: [],
      memory: { scopes: [] },
    });

    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining("my-preset.yaml"),
      expect.any(String),
      "utf-8",
    );
  });

  it("loadPreset returns parsed preset", async () => {
    const fs = await import("node:fs/promises");
    vi.mocked(fs.readFile).mockResolvedValue(
      "name: loaded\nskills:\n  - s1\nmcps: []\nmemory:\n  scopes: []\n",
    );

    const { loadPreset } = await import("../core/presets.js");
    const preset = await loadPreset("loaded");

    expect(preset).not.toBeNull();
    expect(preset!.name).toBe("loaded");
  });

  it("loadPreset returns null when file missing", async () => {
    const fs = await import("node:fs/promises");
    vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"));

    const { loadPreset } = await import("../core/presets.js");
    const preset = await loadPreset("nope");

    expect(preset).toBeNull();
  });

  it("listPresets returns preset names", async () => {
    const fs = await import("node:fs/promises");
    vi.mocked(fs.readdir).mockResolvedValue(["dev.yaml", "prod.yaml", "notes.txt"] as any);

    const { listPresets } = await import("../core/presets.js");
    const names = await listPresets();

    expect(names).toEqual(["dev", "prod"]);
  });

  it("listPresets returns empty array on error", async () => {
    const fs = await import("node:fs/promises");
    vi.mocked(fs.readdir).mockRejectedValue(new Error("ENOENT"));

    const { listPresets } = await import("../core/presets.js");
    const names = await listPresets();

    expect(names).toEqual([]);
  });
});

describe("presetCommand", () => {
  it("exports a Command named 'preset'", async () => {
    vi.doUnmock("../core/presets.js");
    vi.doUnmock("../core/config-merger.js");
    vi.mock("../core/config-merger.js", () => ({
      loadAndMergeAllConfigs: vi.fn(),
    }));

    const { presetCommand } = await import("./preset.js");
    expect(presetCommand.name()).toBe("preset");
  });
});
