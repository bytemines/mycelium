import { describe, it, expect } from "vitest";
import { compressMemory, mergeMemoryFiles, extractKeyInsights } from "./smart-memory.js";

describe("smart-memory", () => {
  describe("compressMemory", () => {
    it("compresses long memory content to under max lines", () => {
      const longContent = Array.from({ length: 500 }, (_, i) => `Line ${i}: Some verbose session context`).join("\n");
      const compressed = compressMemory(longContent, { maxLines: 200 });
      const lines = compressed.split("\n");
      expect(lines.length).toBeLessThanOrEqual(200);
    });

    it("returns content unchanged when under max lines", () => {
      const content = "# Header\n- Line 1\n- Line 2";
      const compressed = compressMemory(content, { maxLines: 200 });
      expect(compressed).toBe(content);
    });

    it("preserves headers when compressing", () => {
      const lines = [
        "# Important Header",
        "## Sub Header",
        ...Array.from({ length: 300 }, (_, i) => `Line ${i}: filler`),
      ];
      const compressed = compressMemory(lines.join("\n"), { maxLines: 50 });
      expect(compressed).toContain("# Important Header");
      expect(compressed).toContain("## Sub Header");
    });

    it("preserves key insight lines when compressing", () => {
      const lines = [
        "# Notes",
        "- Bug: API returns 404 on trailing slash",
        "- Fix: Strip trailing slashes",
        ...Array.from({ length: 300 }, (_, i) => `Line ${i}: verbose detail`),
      ];
      const compressed = compressMemory(lines.join("\n"), { maxLines: 50 });
      expect(compressed).toContain("Bug: API returns 404");
      expect(compressed).toContain("Fix: Strip trailing slashes");
    });

    it("takes most recent other lines to fill remaining space", () => {
      const lines = [
        "# Header",
        "Old line 0",
        "Old line 1",
        ...Array.from({ length: 300 }, (_, i) => `Recent line ${i}`),
      ];
      const compressed = compressMemory(lines.join("\n"), { maxLines: 10 });
      // Should contain header and recent lines, not old lines
      expect(compressed).toContain("# Header");
      expect(compressed).toContain("Recent line 299");
    });
  });

  describe("extractKeyInsights", () => {
    it("extracts key insights from session content", () => {
      const content = `
# Session Notes
- Bug: The API returns 404 when path has trailing slash
- Fix: Strip trailing slashes in router middleware
- Pattern: Always normalize paths before routing
- TODO: Add regression test
    `.trim();
      const insights = extractKeyInsights(content);
      expect(insights).toContain("Strip trailing slashes");
      expect(insights).toContain("Bug: The API returns 404");
      expect(insights).toContain("Pattern: Always normalize");
    });

    it("returns empty string when no insights found", () => {
      const content = "# Just a header\nSome regular text";
      const insights = extractKeyInsights(content);
      expect(insights).toBe("");
    });

    it("matches case-insensitive keywords", () => {
      const content = "- bug: lowercase bug\n- IMPORTANT: uppercase";
      const insights = extractKeyInsights(content);
      expect(insights).toContain("lowercase bug");
      expect(insights).toContain("uppercase");
    });
  });

  describe("mergeMemoryFiles", () => {
    it("merges multiple memory files with deduplication", () => {
      const files = [
        { scope: "shared", content: "# Preferences\n- Use TypeScript\n- Prefer functional style" },
        { scope: "coding", content: "# Patterns\n- Use TypeScript\n- Always use Zod for validation" },
      ];
      const merged = mergeMemoryFiles(files);
      const occurrences = (merged.match(/Use TypeScript/g) || []).length;
      expect(occurrences).toBe(1);
    });

    it("preserves headers even if duplicated across files", () => {
      const files = [
        { scope: "shared", content: "# Preferences\n- Item A" },
        { scope: "coding", content: "# Preferences\n- Item B" },
      ];
      const merged = mergeMemoryFiles(files);
      const headerCount = (merged.match(/# Preferences/g) || []).length;
      expect(headerCount).toBe(2);
    });

    it("preserves empty lines", () => {
      const files = [
        { scope: "shared", content: "# Header\n\n- Item" },
      ];
      const merged = mergeMemoryFiles(files);
      expect(merged).toContain("# Header");
      expect(merged).toContain("- Item");
    });

    it("adds scope comments to merged output", () => {
      const files = [
        { scope: "shared", content: "# A\n- Item" },
        { scope: "coding", content: "# B\n- Other" },
      ];
      const merged = mergeMemoryFiles(files);
      expect(merged).toContain("<!-- SCOPE: shared -->");
      expect(merged).toContain("<!-- SCOPE: coding -->");
    });
  });
});
