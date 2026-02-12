/**
 * Tests for enable command module
 * Tests written FIRST following TDD
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { parse as yamlParse, stringify as yamlStringify } from "yaml";

import {
  enableSkillOrMcp,
  type EnableOptions,
  type EnableResult,
} from "./enable.js";
import * as pluginTakeover from "../core/plugin-takeover.js";

describe("Enable Command", () => {
  let tempDir: string;
  let globalMyceliumPath: string;

  // Sample manifest configuration using state instead of enabled
  const sampleManifest = {
    version: "1.0",
    tools: {
      "claude-code": { enabled: true },
      codex: { enabled: true },
      "gemini-cli": { enabled: true },
      opencode: { enabled: true },
      openclaw: { enabled: true },
    },
    skills: {
      superpowers: {
        state: "enabled",
      },
      "disabled-skill": {
        state: "disabled",
      },
      "deleted-skill": {
        state: "deleted",
      },
    },
    mcps: {
      "whark-trading": {
        state: "enabled",
      },
      "disabled-mcp": {
        state: "disabled",
      },
      "deleted-mcp": {
        state: "deleted",
      },
    },
    hooks: {
      "pre-commit": {
        state: "disabled",
      },
    },
  };

  beforeEach(async () => {
    // Create temp directory for tests
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mycelium-enable-test-"));
    globalMyceliumPath = path.join(tempDir, ".mycelium");
    await fs.mkdir(globalMyceliumPath, { recursive: true });

    // Write sample manifest
    await fs.writeFile(
      path.join(globalMyceliumPath, "manifest.yaml"),
      yamlStringify(sampleManifest),
      "utf-8"
    );
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("enableSkillOrMcp", () => {
    describe("argument parsing", () => {
      it("parses name argument correctly", async () => {
        const options: EnableOptions = {
          name: "disabled-skill",
          global: true,
          globalPath: globalMyceliumPath,
        };

        const result = await enableSkillOrMcp(options);

        expect(result.name).toBe("disabled-skill");
      });

      it("auto-registers unknown item as skill in manifest", async () => {
        const options: EnableOptions = {
          name: "non-existent-skill",
          global: true,
          globalPath: globalMyceliumPath,
        };

        const result = await enableSkillOrMcp(options);

        expect(result.success).toBe(true);
        expect(result.type).toBe("skill");
      });

      it("auto-registers unknown MCP as skill in manifest", async () => {
        const options: EnableOptions = {
          name: "non-existent-mcp",
          global: true,
          globalPath: globalMyceliumPath,
        };

        const result = await enableSkillOrMcp(options);

        expect(result.success).toBe(true);
        expect(result.type).toBe("skill");
      });
    });

    describe("global enabling", () => {
      it("enables skill globally", async () => {
        const options: EnableOptions = {
          name: "disabled-skill",
          global: true,
          globalPath: globalMyceliumPath,
        };

        const result = await enableSkillOrMcp(options);

        expect(result.success).toBe(true);
        expect(result.type).toBe("skill");

        // Verify manifest was updated
        const manifestContent = await fs.readFile(
          path.join(globalMyceliumPath, "manifest.yaml"),
          "utf-8"
        );
        const updatedManifest = yamlParse(manifestContent);
        expect(updatedManifest.skills["disabled-skill"].state).toBe("enabled");
      });

      it("enables MCP globally", async () => {
        const options: EnableOptions = {
          name: "disabled-mcp",
          global: true,
          globalPath: globalMyceliumPath,
        };

        const result = await enableSkillOrMcp(options);

        expect(result.success).toBe(true);
        expect(result.type).toBe("mcp");

        // Verify manifest was updated
        const manifestContent = await fs.readFile(
          path.join(globalMyceliumPath, "manifest.yaml"),
          "utf-8"
        );
        const updatedManifest = yamlParse(manifestContent);
        expect(updatedManifest.mcps["disabled-mcp"].state).toBe("enabled");
      });
    });

    describe("tool-specific enabling", () => {
      it("enables skill for specific tool only", async () => {
        const options: EnableOptions = {
          name: "disabled-skill",
          tool: "claude-code",
          global: true,
          globalPath: globalMyceliumPath,
        };

        const result = await enableSkillOrMcp(options);

        expect(result.success).toBe(true);
        expect(result.tool).toBe("claude-code");

        // Verify manifest was updated with tool-specific enablement
        const manifestContent = await fs.readFile(
          path.join(globalMyceliumPath, "manifest.yaml"),
          "utf-8"
        );
        const updatedManifest = yamlParse(manifestContent);

        // Should have tools array or tool-specific config
        const skillConfig = updatedManifest.skills["disabled-skill"];
        expect(
          skillConfig.enabledTools?.includes("claude-code") ||
          skillConfig.tools?.includes("claude-code")
        ).toBe(true);
      });

      it("enables MCP for specific tool only", async () => {
        const options: EnableOptions = {
          name: "disabled-mcp",
          tool: "codex",
          global: true,
          globalPath: globalMyceliumPath,
        };

        const result = await enableSkillOrMcp(options);

        expect(result.success).toBe(true);
        expect(result.tool).toBe("codex");

        // Verify manifest was updated with tool-specific enablement
        const manifestContent = await fs.readFile(
          path.join(globalMyceliumPath, "manifest.yaml"),
          "utf-8"
        );
        const updatedManifest = yamlParse(manifestContent);

        // Should have tools array or tool-specific config
        const mcpConfig = updatedManifest.mcps["disabled-mcp"];
        expect(
          mcpConfig.enabledTools?.includes("codex") ||
          mcpConfig.tools?.includes("codex")
        ).toBe(true);
      });
    });

    describe("manifest updates", () => {
      it("updates manifest.yaml with enabled state", async () => {
        const options: EnableOptions = {
          name: "disabled-skill",
          global: true,
          globalPath: globalMyceliumPath,
        };

        await enableSkillOrMcp(options);

        const manifestContent = await fs.readFile(
          path.join(globalMyceliumPath, "manifest.yaml"),
          "utf-8"
        );
        const updatedManifest = yamlParse(manifestContent);

        expect(updatedManifest.skills["disabled-skill"].state).toBe("enabled");
      });

      it("preserves other manifest settings when updating", async () => {
        const options: EnableOptions = {
          name: "disabled-skill",
          global: true,
          globalPath: globalMyceliumPath,
        };

        await enableSkillOrMcp(options);

        const manifestContent = await fs.readFile(
          path.join(globalMyceliumPath, "manifest.yaml"),
          "utf-8"
        );
        const updatedManifest = yamlParse(manifestContent);

        // Other settings should be preserved
        expect(updatedManifest.version).toBe("1.0");
        expect(updatedManifest.tools["claude-code"].enabled).toBe(true);
        expect(updatedManifest.skills["superpowers"].state).toBe("enabled");
        expect(updatedManifest.mcps["whark-trading"].state).toBe("enabled");
      });
    });

    describe("success messages", () => {
      it("shows success message for skill", async () => {
        const options: EnableOptions = {
          name: "disabled-skill",
          global: true,
          globalPath: globalMyceliumPath,
        };

        const result = await enableSkillOrMcp(options);

        expect(result.success).toBe(true);
        expect(result.message).toContain("enabled");
        expect(result.message).toContain("disabled-skill");
      });

      it("shows success message for MCP", async () => {
        const options: EnableOptions = {
          name: "disabled-mcp",
          global: true,
          globalPath: globalMyceliumPath,
        };

        const result = await enableSkillOrMcp(options);

        expect(result.success).toBe(true);
        expect(result.message).toContain("enabled");
        expect(result.message).toContain("disabled-mcp");
      });

      it("shows tool-specific success message when --tool is used", async () => {
        const options: EnableOptions = {
          name: "disabled-skill",
          tool: "claude-code",
          global: true,
          globalPath: globalMyceliumPath,
        };

        const result = await enableSkillOrMcp(options);

        expect(result.success).toBe(true);
        expect(result.message).toContain("claude-code");
      });
    });

    describe("already enabled handling", () => {
      it("handles already enabled skill case", async () => {
        const options: EnableOptions = {
          name: "superpowers",
          global: true,
          globalPath: globalMyceliumPath,
        };

        const result = await enableSkillOrMcp(options);

        expect(result.success).toBe(true);
        expect(result.alreadyEnabled).toBe(true);
        expect(result.message).toContain("already enabled");
      });

      it("handles already enabled MCP case", async () => {
        const options: EnableOptions = {
          name: "whark-trading",
          global: true,
          globalPath: globalMyceliumPath,
        };

        const result = await enableSkillOrMcp(options);

        expect(result.success).toBe(true);
        expect(result.alreadyEnabled).toBe(true);
        expect(result.message).toContain("already enabled");
      });

      it("treats items with no state as already enabled (default)", async () => {
        // Write a manifest with a skill that has no state field
        const noStateManifest = {
          version: "1.0",
          skills: {
            "no-state-skill": {},
          },
          mcps: {},
        };
        const noStatePath = path.join(tempDir, "no-state");
        await fs.mkdir(noStatePath, { recursive: true });
        await fs.writeFile(
          path.join(noStatePath, "manifest.yaml"),
          yamlStringify(noStateManifest),
          "utf-8"
        );

        const result = await enableSkillOrMcp({
          name: "no-state-skill",
          global: true,
          globalPath: noStatePath,
        });

        expect(result.success).toBe(true);
        expect(result.alreadyEnabled).toBe(true);
      });
    });

    describe("deleted item restoration", () => {
      it("enabling a deleted skill restores it to enabled", async () => {
        const options: EnableOptions = {
          name: "deleted-skill",
          global: true,
          globalPath: globalMyceliumPath,
        };

        const result = await enableSkillOrMcp(options);

        expect(result.success).toBe(true);
        expect(result.type).toBe("skill");
        expect(result.alreadyEnabled).toBeUndefined();

        // Verify manifest was updated
        const manifestContent = await fs.readFile(
          path.join(globalMyceliumPath, "manifest.yaml"),
          "utf-8"
        );
        const updatedManifest = yamlParse(manifestContent);
        expect(updatedManifest.skills["deleted-skill"].state).toBe("enabled");
      });

      it("enabling a deleted MCP restores it to enabled", async () => {
        const options: EnableOptions = {
          name: "deleted-mcp",
          global: true,
          globalPath: globalMyceliumPath,
        };

        const result = await enableSkillOrMcp(options);

        expect(result.success).toBe(true);
        expect(result.type).toBe("mcp");

        const manifestContent = await fs.readFile(
          path.join(globalMyceliumPath, "manifest.yaml"),
          "utf-8"
        );
        const updatedManifest = yamlParse(manifestContent);
        expect(updatedManifest.mcps["deleted-mcp"].state).toBe("enabled");
      });
    });

    describe("hook and memory enabling", () => {
      it("enables a hook", async () => {
        const options: EnableOptions = {
          name: "pre-commit",
          global: true,
          globalPath: globalMyceliumPath,
        };

        const result = await enableSkillOrMcp(options);

        expect(result.success).toBe(true);
        expect(result.type).toBe("hook");

        const manifestContent = await fs.readFile(
          path.join(globalMyceliumPath, "manifest.yaml"),
          "utf-8"
        );
        const updatedManifest = yamlParse(manifestContent);
        expect(updatedManifest.hooks["pre-commit"].state).toBe("enabled");
      });

    });

    describe("project-level enabling", () => {
      it("enables skill at project level when --global is not set", async () => {
        // Create project .mycelium directory
        const projectPath = path.join(tempDir, "project", ".mycelium");
        await fs.mkdir(projectPath, { recursive: true });

        // Write project manifest
        const projectManifest = {
          version: "1.0",
          skills: {
            "project-skill": { state: "disabled" },
          },
          mcps: {},
        };
        await fs.writeFile(
          path.join(projectPath, "manifest.yaml"),
          yamlStringify(projectManifest),
          "utf-8"
        );

        const options: EnableOptions = {
          name: "project-skill",
          global: false,
          projectPath: projectPath,
        };

        const result = await enableSkillOrMcp(options);

        expect(result.success).toBe(true);
        expect(result.level).toBe("project");

        // Verify project manifest was updated
        const manifestContent = await fs.readFile(
          path.join(projectPath, "manifest.yaml"),
          "utf-8"
        );
        const updatedManifest = yamlParse(manifestContent);
        expect(updatedManifest.skills["project-skill"].state).toBe("enabled");
      });
    });

    describe("error handling", () => {
      it("returns error when manifest file does not exist", async () => {
        const options: EnableOptions = {
          name: "some-skill",
          global: true,
          globalPath: path.join(tempDir, "non-existent"),
        };

        const result = await enableSkillOrMcp(options);

        expect(result.success).toBe(false);
        expect(result.error).toContain("manifest");
      });

      it("returns error for invalid tool name", async () => {
        const options: EnableOptions = {
          name: "disabled-skill",
          tool: "invalid-tool" as any,
          global: true,
          globalPath: globalMyceliumPath,
        };

        const result = await enableSkillOrMcp(options);

        expect(result.success).toBe(false);
        expect(result.error).toContain("Invalid tool");
      });
    });

    describe("plugin release integration", () => {
      it("triggers release when enabling the last disabled plugin skill", async () => {
        // Set up manifest with a taken-over plugin where only one skill is disabled
        const pluginManifest = {
          version: "1.0",
          skills: {
            "cool-skill": {
              state: "enabled",
              pluginOrigin: { pluginId: "my-plugin@skillsmp", cachePath: "/fake" },
            },
            "other-skill": {
              state: "disabled",
              pluginOrigin: { pluginId: "my-plugin@skillsmp", cachePath: "/fake" },
            },
          },
          mcps: {},
          takenOverPlugins: {
            "my-plugin@skillsmp": {
              version: "1.0.0",
              cachePath: "/fake",
              allSkills: ["cool-skill", "other-skill"],
            },
          },
        };
        await fs.writeFile(
          path.join(globalMyceliumPath, "manifest.yaml"),
          yamlStringify(pluginManifest),
          "utf-8"
        );

        const setEnabledSpy = vi.spyOn(pluginTakeover, "setPluginEnabled").mockResolvedValue(undefined);
        const syncSpy = vi.spyOn(pluginTakeover, "syncPluginSymlinks").mockResolvedValue({ created: [], removed: [] });

        const result = await enableSkillOrMcp({
          name: "other-skill",
          global: true,
          globalPath: globalMyceliumPath,
        });

        expect(result.success).toBe(true);
        expect(result.pluginReleased).toBe(true);
        expect(setEnabledSpy).toHaveBeenCalledWith("my-plugin@skillsmp", true);
        expect(syncSpy).toHaveBeenCalled();

        // Verify takenOverPlugins was cleaned up
        const manifest = yamlParse(await fs.readFile(path.join(globalMyceliumPath, "manifest.yaml"), "utf-8"));
        expect(manifest.takenOverPlugins).toBeUndefined();
        expect(manifest.skills?.["cool-skill"]?.pluginOrigin).toBeUndefined();

        setEnabledSpy.mockRestore();
        syncSpy.mockRestore();
      });

      it("does NOT release when some plugin skills are still disabled", async () => {
        const pluginManifest = {
          version: "1.0",
          skills: {
            "cool-skill": {
              state: "disabled",
              pluginOrigin: { pluginId: "my-plugin@skillsmp", cachePath: "/fake" },
            },
            "other-skill": {
              state: "disabled",
              pluginOrigin: { pluginId: "my-plugin@skillsmp", cachePath: "/fake" },
            },
          },
          mcps: {},
          takenOverPlugins: {
            "my-plugin@skillsmp": {
              version: "1.0.0",
              cachePath: "/fake",
              allSkills: ["cool-skill", "other-skill"],
            },
          },
        };
        await fs.writeFile(
          path.join(globalMyceliumPath, "manifest.yaml"),
          yamlStringify(pluginManifest),
          "utf-8"
        );

        const setEnabledSpy = vi.spyOn(pluginTakeover, "setPluginEnabled").mockResolvedValue(undefined);
        const syncSpy = vi.spyOn(pluginTakeover, "syncPluginSymlinks").mockResolvedValue({ created: [], removed: [] });

        const result = await enableSkillOrMcp({
          name: "cool-skill",
          global: true,
          globalPath: globalMyceliumPath,
        });

        expect(result.success).toBe(true);
        expect(result.pluginReleased).toBeFalsy();
        // setPluginEnabled should NOT have been called (plugin not released)
        expect(setEnabledSpy).not.toHaveBeenCalled();

        setEnabledSpy.mockRestore();
        syncSpy.mockRestore();
      });
    });
  });
});
