/**
 * Tests for enable command module
 * Tests written FIRST following TDD
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { parse as yamlParse, stringify as yamlStringify } from "yaml";

// Import the module under test (doesn't exist yet - tests will fail)
import {
  enableSkillOrMcp,
  type EnableOptions,
  type EnableResult,
} from "./enable.js";

describe("Enable Command", () => {
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
    },
    mcps: {
      "whark-trading": {
        enabled: true,
      },
      "disabled-mcp": {
        enabled: false,
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

      it("validates name exists in manifest - skill", async () => {
        const options: EnableOptions = {
          name: "non-existent-skill",
          global: true,
          globalPath: globalMyceliumPath,
        };

        const result = await enableSkillOrMcp(options);

        expect(result.success).toBe(false);
        expect(result.error).toContain("not found");
      });

      it("validates name exists in manifest - MCP", async () => {
        const options: EnableOptions = {
          name: "non-existent-mcp",
          global: true,
          globalPath: globalMyceliumPath,
        };

        const result = await enableSkillOrMcp(options);

        expect(result.success).toBe(false);
        expect(result.error).toContain("not found");
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
        expect(updatedManifest.skills["disabled-skill"].enabled).toBe(true);
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
        expect(updatedManifest.mcps["disabled-mcp"].enabled).toBe(true);
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

        expect(updatedManifest.skills["disabled-skill"].enabled).toBe(true);
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
        expect(updatedManifest.skills["superpowers"].enabled).toBe(true);
        expect(updatedManifest.mcps["whark-trading"].enabled).toBe(true);
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
            "project-skill": { enabled: false },
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
        expect(updatedManifest.skills["project-skill"].enabled).toBe(true);
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
  });
});
