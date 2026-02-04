/**
 * Tests for disable command module
 * Tests written FIRST following TDD
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { parse as yamlParse, stringify as yamlStringify } from "yaml";

// Import the module under test (doesn't exist yet - tests will fail)
import {
  disableSkillOrMcp,
  type DisableOptions,
  type DisableResult,
} from "./disable.js";

describe("Disable Command", () => {
  let tempDir: string;
  let globalMyceliumPath: string;

  // Sample manifest configuration
  const sampleManifest = {
    version: "1.0",
    tools: {
      "claude-code": { enabled: true },
      codex: { enabled: true },
      "gemini-cli": { enabled: true },
      opencode: { enabled: true },
      openclaw: { enabled: true },
      aider: { enabled: true },
    },
    skills: {
      superpowers: {
        enabled: true,
      },
      "disabled-skill": {
        enabled: false,
      },
      "tool-specific-skill": {
        enabled: true,
        tools: ["claude-code", "codex"],
      },
    },
    mcps: {
      "whark-trading": {
        enabled: true,
      },
      "disabled-mcp": {
        enabled: false,
      },
      "tool-specific-mcp": {
        enabled: true,
        tools: ["claude-code", "codex"],
      },
    },
    memory: {
      scopes: {
        shared: { sync_to: ["claude-code"], path: "global/memory/shared/", files: [] },
        coding: { sync_to: ["claude-code"], path: "global/memory/coding/", files: [] },
        personal: { sync_to: ["openclaw"], path: "global/memory/personal/", files: [] },
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
        expect(updatedManifest.skills["superpowers"].enabled).toBe(false);
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
        expect(updatedManifest.mcps["whark-trading"].enabled).toBe(false);
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

        expect(updatedManifest.skills["superpowers"].enabled).toBe(false);
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
        expect(updatedManifest.skills["disabled-skill"].enabled).toBe(false);
        expect(updatedManifest.mcps["whark-trading"].enabled).toBe(true);
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
            "project-skill": { enabled: true },
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
        expect(updatedManifest.skills["project-skill"].enabled).toBe(false);
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

      it("validates name exists in manifest", async () => {
        const options: DisableOptions = {
          name: "non-existent-skill",
          global: true,
          globalPath: globalMyceliumPath,
        };

        const result = await disableSkillOrMcp(options);

        expect(result.success).toBe(false);
        expect(result.error).toContain("not found");
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
  });
});
