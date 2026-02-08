import { describe, it, expect } from "vitest";
import { createPreset, applyPreset, exportPreset } from "./presets.js";

describe("presets", () => {
  it("creates a preset from current config", () => {
    const config = {
      skills: ["tdd", "debugging"],
      mcps: ["git-mcp", "postgres-mcp"],
      memory: { scopes: ["shared", "coding"] },
    };
    const preset = createPreset("python-backend", config);
    expect(preset.name).toBe("python-backend");
    expect(preset.skills).toEqual(["tdd", "debugging"]);
  });

  it("applies a preset by enabling/disabling items", () => {
    const preset = {
      name: "python-backend",
      skills: ["tdd"],
      mcps: ["git-mcp"],
      memory: { scopes: ["shared"] },
    };
    const actions = applyPreset(preset, {
      allSkills: ["tdd", "debugging", "frontend"],
      allMcps: ["git-mcp", "node-mcp", "postgres-mcp"],
    });
    expect(actions.enableSkills).toEqual(["tdd"]);
    expect(actions.disableSkills).toEqual(["debugging", "frontend"]);
  });

  it("exports preset as shareable YAML", () => {
    const preset = {
      name: "test",
      skills: ["a"],
      mcps: ["b"],
      memory: { scopes: ["shared"] },
    };
    const yaml = exportPreset(preset);
    expect(yaml).toContain("name: test");
    expect(yaml).toContain("skills:");
  });
});
