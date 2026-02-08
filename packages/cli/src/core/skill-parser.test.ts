import { describe, it, expect } from "vitest";
import { parseSkillMd, isValidSkillMd } from "./skill-parser.js";

describe("skill-parser", () => {
  describe("parseSkillMd", () => {
    it("parses SKILL.md frontmatter correctly", () => {
      const content = `---
name: tdd-workflow
description: Test-driven development workflow
tools: claude-code, codex
model: sonnet
color: green
---

# TDD Workflow

Write failing test first, then implement.
`;
      const result = parseSkillMd(content);
      expect(result.name).toBe("tdd-workflow");
      expect(result.description).toBe("Test-driven development workflow");
      expect(result.tools).toEqual(["claude-code", "codex"]);
      expect(result.model).toBe("sonnet");
      expect(result.color).toBe("green");
      expect(result.body).toContain("Write failing test first");
    });

    it("handles SKILL.md without frontmatter", () => {
      const content = "# Just a markdown file\nNo frontmatter here.";
      const result = parseSkillMd(content);
      expect(result.name).toBe("");
      expect(result.body).toContain("Just a markdown file");
    });

    it("handles missing optional fields", () => {
      const content = `---
name: minimal-skill
---

Body content.`;
      const result = parseSkillMd(content);
      expect(result.name).toBe("minimal-skill");
      expect(result.description).toBe("");
      expect(result.tools).toEqual([]);
      expect(result.model).toBeUndefined();
      expect(result.color).toBeUndefined();
      expect(result.body).toContain("Body content");
    });

    it("handles tools with extra whitespace", () => {
      const content = `---
name: test
tools: claude-code ,  codex , gemini-cli
---
Body`;
      const result = parseSkillMd(content);
      expect(result.tools).toEqual(["claude-code", "codex", "gemini-cli"]);
    });

    it("handles empty frontmatter values", () => {
      const content = `---
name: test
description:
tools:
---
Body`;
      const result = parseSkillMd(content);
      expect(result.name).toBe("test");
      expect(result.description).toBe("");
      expect(result.tools).toEqual([]);
    });
  });

  describe("isValidSkillMd", () => {
    it("validates SKILL.md has required name field", () => {
      const valid = `---\nname: my-skill\n---\nBody`;
      const invalid = `---\ndescription: no name\n---\nBody`;
      expect(isValidSkillMd(valid)).toBe(true);
      expect(isValidSkillMd(invalid)).toBe(false);
    });

    it("returns false for content without frontmatter", () => {
      expect(isValidSkillMd("# Just markdown")).toBe(false);
    });

    it("returns false for empty name", () => {
      expect(isValidSkillMd("---\nname:\n---\nBody")).toBe(false);
    });
  });
});
