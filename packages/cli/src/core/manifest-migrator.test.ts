import { describe, it, expect } from "vitest";
import { migrateManifestV1ToV2 } from "./manifest-migrator.js";

describe("manifest-migrator", () => {
  it("converts enabled:true to state:enabled", () => {
    const v1 = {
      version: "1",
      skills: { foo: { enabled: true } },
      mcps: { bar: { command: "npx", enabled: true } },
    };
    const v2 = migrateManifestV1ToV2(v1);
    expect((v2.skills as any).foo.state).toBe("enabled");
    expect((v2.mcps as any).bar.state).toBe("enabled");
    expect((v2.skills as any).foo.enabled).toBeUndefined();
    expect((v2.mcps as any).bar.enabled).toBeUndefined();
  });

  it("converts enabled:false to state:disabled", () => {
    const v1 = { version: "1", skills: { foo: { enabled: false } } };
    const v2 = migrateManifestV1ToV2(v1);
    expect((v2.skills as any).foo.state).toBe("disabled");
  });

  it("defaults missing enabled to state:enabled", () => {
    const v1 = { version: "1", skills: { foo: {} } };
    const v2 = migrateManifestV1ToV2(v1);
    expect((v2.skills as any).foo.state).toBe("enabled");
  });

  it("adds source:manual when no pluginName", () => {
    const v1 = { version: "1", skills: { foo: {} } };
    const v2 = migrateManifestV1ToV2(v1);
    expect((v2.skills as any).foo.source).toBe("manual");
  });

  it("uses pluginName as source when present", () => {
    const v1 = { version: "1", skills: { foo: { pluginName: "superpowers" } } };
    const v2 = migrateManifestV1ToV2(v1);
    expect((v2.skills as any).foo.source).toBe("superpowers");
  });

  it("imports plugin-skills.json state", () => {
    const v1 = { version: "1", skills: { foo: {}, bar: {} } };
    const pluginSkills = { superpowers: { foo: false, bar: true } };
    const v2 = migrateManifestV1ToV2(v1, pluginSkills);
    expect((v2.skills as any).foo.state).toBe("disabled");
    expect((v2.skills as any).bar.state).toBe("enabled");
  });

  it("does not mutate original object", () => {
    const v1 = { version: "1", skills: { foo: { enabled: true } } };
    migrateManifestV1ToV2(v1);
    expect((v1.skills as any).foo.enabled).toBe(true);
  });

  it("handles empty manifest", () => {
    const v2 = migrateManifestV1ToV2({});
    expect(v2).toEqual({});
  });
});
