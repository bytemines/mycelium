/**
 * Tests for disable command module
 * Tests written FIRST following TDD
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { parse as yamlParse, stringify as yamlStringify } from "yaml";

import {
  disableSkillOrMcp,
  type DisableOptions,
  type DisableResult,
} from "./disable.js";
import * as pluginTakeover from "../core/plugin-takeover.js";

describe("Disable Command", () => {
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
      "tool-specific-skill": {
        state: "enabled",
        tools: ["claude-code", "codex"],
      },
    },
    mcps: {
      "whark-trading": {
        state: "enabled",
      },
      "disabled-mcp": {
        state: "disabled",
      },
      "tool-specific-mcp": {
        state: "enabled",
        tools: ["claude-code", "codex"],
      },
    },
    hooks: {
      "pre-commit": {
        state: "enabled",
        source: "project",
      },
      "disabled-hook": {
        state: "disabled",
        source: "global",
      },
    },
  };

  beforeEach(async () => {
    // Create temp directory for tests
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mycelium-disable-test-"));
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

  describe("disableSkillOrMcp", () => {
    describe("global disabling", () => {
      it("disables skill globally", async () => {
        const options: DisableOptions = {
          name: "superpowers",
          global: true,
          globalPath: globalMyceliumPath,
        };

        const result = await disableSkillOrMcp(options);

        expect(result.success).toBe(true);
        expect(result.type).toBe("skill");

        // Verify manifest was updated
        const manifestContent = await fs.readFile(
          path.join(globalMyceliumPath, "manifest.yaml"),
          "utf-8"
        );
        const updatedManifest = yamlParse(manifestContent);
        expect(updatedManifest.skills["superpowers"].state).toBe("disabled");
      });

      it("disables MCP globally", async () => {
        const options: DisableOptions = {
          name: "whark-trading",
          global: true,
          globalPath: globalMyceliumPath,
        };

        const result = await disableSkillOrMcp(options);

        expect(result.success).toBe(true);
        expect(result.type).toBe("mcp");

        // Verify manifest was updated
        const manifestContent = await fs.readFile(
          path.join(globalMyceliumPath, "manifest.yaml"),
          "utf-8"
        );
        const updatedManifest = yamlParse(manifestContent);
        expect(updatedManifest.mcps["whark-trading"].state).toBe("disabled");
      });
    });

    describe("tool-specific disabling", () => {
      it("disables skill for specific tool only", async () => {
        const options: DisableOptions = {
          name: "tool-specific-skill",
          tool: "claude-code",
          global: true,
          globalPath: globalMyceliumPath,
        };

        const result = await disableSkillOrMcp(options);

        expect(result.success).toBe(true);
        expect(result.tool).toBe("claude-code");

        // Verify manifest was updated with tool-specific disablement
        const manifestContent = await fs.readFile(
          path.join(globalMyceliumPath, "manifest.yaml"),
          "utf-8"
        );
        const updatedManifest = yamlParse(manifestContent);

        // Should have excludeTools array or tools array without claude-code
        const skillConfig = updatedManifest.skills["tool-specific-skill"];
        const isExcluded =
          skillConfig.excludeTools?.includes("claude-code") ||
          (skillConfig.tools && !skillConfig.tools.includes("claude-code"));
        expect(isExcluded).toBe(true);
      });

      it("disables MCP for specific tool only", async () => {
        const options: DisableOptions = {
          name: "tool-specific-mcp",
          tool: "codex",
          global: true,
          globalPath: globalMyceliumPath,
        };

        const result = await disableSkillOrMcp(options);

        expect(result.success).toBe(true);
        expect(result.tool).toBe("codex");

        // Verify manifest was updated with tool-specific disablement
        const manifestContent = await fs.readFile(
          path.join(globalMyceliumPath, "manifest.yaml"),
          "utf-8"
        );
        const updatedManifest = yamlParse(manifestContent);

        // Should have excludeTools array or tools array without codex
        const mcpConfig = updatedManifest.mcps["tool-specific-mcp"];
        const isExcluded =
          mcpConfig.excludeTools?.includes("codex") ||
          (mcpConfig.tools && !mcpConfig.tools.includes("codex"));
        expect(isExcluded).toBe(true);
      });
    });

    describe("manifest updates", () => {
      it("updates manifest.yaml with disabled state", async () => {
        const options: DisableOptions = {
          name: "superpowers",
          global: true,
          globalPath: globalMyceliumPath,
        };

        await disableSkillOrMcp(options);

        const manifestContent = await fs.readFile(
          path.join(globalMyceliumPath, "manifest.yaml"),
          "utf-8"
        );
        const updatedManifest = yamlParse(manifestContent);

        expect(updatedManifest.skills["superpowers"].state).toBe("disabled");
      });

      it("preserves other manifest settings when updating", async () => {
        const options: DisableOptions = {
          name: "superpowers",
          global: true,
          globalPath: globalMyceliumPath,
        };

        await disableSkillOrMcp(options);

        const manifestContent = await fs.readFile(
          path.join(globalMyceliumPath, "manifest.yaml"),
          "utf-8"
        );
        const updatedManifest = yamlParse(manifestContent);

        // Other settings should be preserved
        expect(updatedManifest.version).toBe("1.0");
        expect(updatedManifest.tools["claude-code"].enabled).toBe(true);
        expect(updatedManifest.skills["disabled-skill"].state).toBe("disabled");
        expect(updatedManifest.mcps["whark-trading"].state).toBe("enabled");
      });
    });

    describe("success messages", () => {
      it("shows success message for skill", async () => {
        const options: DisableOptions = {
          name: "superpowers",
          global: true,
          globalPath: globalMyceliumPath,
        };

        const result = await disableSkillOrMcp(options);

        expect(result.success).toBe(true);
        expect(result.message).toContain("disabled");
        expect(result.message).toContain("superpowers");
      });

      it("shows success message for MCP", async () => {
        const options: DisableOptions = {
          name: "whark-trading",
          global: true,
          globalPath: globalMyceliumPath,
        };

        const result = await disableSkillOrMcp(options);

        expect(result.success).toBe(true);
        expect(result.message).toContain("disabled");
        expect(result.message).toContain("whark-trading");
      });

      it("shows tool-specific success message when --tool is used", async () => {
        const options: DisableOptions = {
          name: "tool-specific-skill",
          tool: "claude-code",
          global: true,
          globalPath: globalMyceliumPath,
        };

        const result = await disableSkillOrMcp(options);

        expect(result.success).toBe(true);
        expect(result.message).toContain("claude-code");
      });
    });

    describe("already disabled handling", () => {
      it("handles already disabled skill case", async () => {
        const options: DisableOptions = {
          name: "disabled-skill",
          global: true,
          globalPath: globalMyceliumPath,
        };

        const result = await disableSkillOrMcp(options);

        expect(result.success).toBe(true);
        expect(result.alreadyDisabled).toBe(true);
        expect(result.message).toContain("already disabled");
      });

      it("handles already disabled MCP case", async () => {
        const options: DisableOptions = {
          name: "disabled-mcp",
          global: true,
          globalPath: globalMyceliumPath,
        };

        const result = await disableSkillOrMcp(options);

        expect(result.success).toBe(true);
        expect(result.alreadyDisabled).toBe(true);
        expect(result.message).toContain("already disabled");
      });
    });

    describe("project-level disabling", () => {
      it("disables skill at project level when --global is not set", async () => {
        // Create project .mycelium directory
        const projectPath = path.join(tempDir, "project", ".mycelium");
        await fs.mkdir(projectPath, { recursive: true });

        // Write project manifest
        const projectManifest = {
          version: "1.0",
          skills: {
            "project-skill": { state: "enabled" },
          },
          mcps: {},
        };
        await fs.writeFile(
          path.join(projectPath, "manifest.yaml"),
          yamlStringify(projectManifest),
          "utf-8"
        );

        const options: DisableOptions = {
          name: "project-skill",
          global: false,
          projectPath: projectPath,
        };

        const result = await disableSkillOrMcp(options);

        expect(result.success).toBe(true);
        expect(result.level).toBe("project");

        // Verify project manifest was updated
        const manifestContent = await fs.readFile(
          path.join(projectPath, "manifest.yaml"),
          "utf-8"
        );
        const updatedManifest = yamlParse(manifestContent);
        expect(updatedManifest.skills["project-skill"].state).toBe("disabled");
      });
    });

    describe("hook and memory disabling", () => {
      it("disables a hook globally", async () => {
        const options: DisableOptions = {
          name: "pre-commit",
          global: true,
          globalPath: globalMyceliumPath,
        };

        const result = await disableSkillOrMcp(options);

        expect(result.success).toBe(true);
        expect(result.type).toBe("hook");

        // Verify manifest was updated
        const manifestContent = await fs.readFile(
          path.join(globalMyceliumPath, "manifest.yaml"),
          "utf-8"
        );
        const updatedManifest = yamlParse(manifestContent);
        expect(updatedManifest.hooks["pre-commit"].state).toBe("disabled");
      });

      it("handles already disabled hook case", async () => {
        const options: DisableOptions = {
          name: "disabled-hook",
          global: true,
          globalPath: globalMyceliumPath,
        };

        const result = await disableSkillOrMcp(options);

        expect(result.success).toBe(true);
        expect(result.alreadyDisabled).toBe(true);
        expect(result.type).toBe("hook");
      });

    });

    describe("error handling", () => {
      it("returns error when manifest file does not exist", async () => {
        const options: DisableOptions = {
          name: "some-skill",
          global: true,
          globalPath: path.join(tempDir, "non-existent"),
        };

        const result = await disableSkillOrMcp(options);

        expect(result.success).toBe(false);
        expect(result.error).toContain("manifest");
      });

      it("auto-registers unknown item as skill and disables it", async () => {
        const options: DisableOptions = {
          name: "non-existent-skill",
          global: true,
          globalPath: globalMyceliumPath,
        };

        const result = await disableSkillOrMcp(options);

        expect(result.success).toBe(true);
        expect(result.type).toBe("skill");
      });

      it("returns error for invalid tool name", async () => {
        const options: DisableOptions = {
          name: "superpowers",
          tool: "invalid-tool" as any,
          global: true,
          globalPath: globalMyceliumPath,
        };

        const result = await disableSkillOrMcp(options);

        expect(result.success).toBe(false);
        expect(result.error).toContain("Invalid tool");
      });
    });

    describe("plugin takeover integration", () => {
      it("triggers takeover when disabling a plugin skill", async () => {
        const spy = vi.spyOn(pluginTakeover, "getAllPluginsForComponent").mockResolvedValue([{
          pluginId: "my-plugin@skillsmp",
          marketplace: "skillsmp",
          plugin: "my-plugin",
          version: "1.0.0",
          cachePath: "/fake/cache/path",
          allSkills: ["superpowers", "bonus-skill"],
          enabledSkills: ["superpowers", "bonus-skill"],
        }]);
        const setEnabledSpy = vi.spyOn(pluginTakeover, "setPluginEnabled").mockResolvedValue(undefined);
        const syncSpy = vi.spyOn(pluginTakeover, "syncPluginSymlinks").mockResolvedValue({ created: ["bonus-skill"], removed: [] });

        const result = await disableSkillOrMcp({
          name: "superpowers",
          global: true,
          globalPath: globalMyceliumPath,
        });

        expect(result.success).toBe(true);
        expect(result.pluginTakeover).toBe(true);
        expect(spy).toHaveBeenCalledWith("superpowers");
        expect(setEnabledSpy).toHaveBeenCalledWith("my-plugin@skillsmp", false);
        expect(syncSpy).toHaveBeenCalled();

        // Verify manifest has takenOverPlugins
        const manifest = yamlParse(await fs.readFile(path.join(globalMyceliumPath, "manifest.yaml"), "utf-8"));
        expect(manifest.takenOverPlugins?.["my-plugin@skillsmp"]).toBeDefined();
        expect(manifest.skills?.["superpowers"]?.pluginOrigin?.pluginId).toBe("my-plugin@skillsmp");

        spy.mockRestore();
        setEnabledSpy.mockRestore();
        syncSpy.mockRestore();
      });

      it("does NOT trigger takeover for non-plugin skills", async () => {
        const spy = vi.spyOn(pluginTakeover, "getAllPluginsForComponent").mockResolvedValue([]);

        const result = await disableSkillOrMcp({
          name: "superpowers",
          global: true,
          globalPath: globalMyceliumPath,
        });

        expect(result.success).toBe(true);
        expect(result.pluginTakeover).toBeFalsy();
        expect(spy).toHaveBeenCalledWith("superpowers");

        spy.mockRestore();
      });
    });
  });
});
