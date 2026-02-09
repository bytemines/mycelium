/**
 * Tests for memory-scoper module
 * TDD: Write tests first, then implement
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ToolId, MemoryScope } from "@mycelsh/core";

// Mock fs/promises
vi.mock("node:fs/promises", () => ({
  readdir: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  access: vi.fn(),
}));

// Mock @mycelsh/core utilities
vi.mock("@mycelsh/core", async () => {
  const actual = await vi.importActual("@mycelsh/core");
  return {
    ...actual,
    expandPath: vi.fn((p: string) => p.replace("~", "/home/user")),
    ensureDir: vi.fn(),
    pathExists: vi.fn(),
  };
});

describe("memory-scoper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("MEMORY_SCOPE_CONFIG", () => {
    it("should define shared scope syncing to all tools", async () => {
      const { MEMORY_SCOPE_CONFIG } = await import("./memory-scoper.js");
      expect(MEMORY_SCOPE_CONFIG.shared.syncTo).toEqual([
        "claude-code",
        "codex",
        "gemini-cli",
        "opencode",
        "openclaw",
        "aider",
        "cursor",
        "vscode",
        "antigravity",
      ]);
      expect(MEMORY_SCOPE_CONFIG.shared.path).toBe("global/memory/shared/");
    });

    it("should define coding scope excluding openclaw", async () => {
      const { MEMORY_SCOPE_CONFIG } = await import("./memory-scoper.js");
      expect(MEMORY_SCOPE_CONFIG.coding.syncTo).toEqual([
        "claude-code",
        "codex",
        "gemini-cli",
        "opencode",
        "aider",
        "cursor",
        "vscode",
        "antigravity",
      ]);
      expect(MEMORY_SCOPE_CONFIG.coding.excludeFrom).toEqual(["openclaw"]);
      expect(MEMORY_SCOPE_CONFIG.coding.path).toBe("global/memory/coding/");
    });

    it("should define personal scope only for openclaw", async () => {
      const { MEMORY_SCOPE_CONFIG } = await import("./memory-scoper.js");
      expect(MEMORY_SCOPE_CONFIG.personal.syncTo).toEqual(["openclaw"]);
      expect(MEMORY_SCOPE_CONFIG.personal.excludeFrom).toEqual([
        "claude-code",
        "codex",
        "gemini-cli",
        "opencode",
        "aider",
        "cursor",
        "vscode",
        "antigravity",
      ]);
      expect(MEMORY_SCOPE_CONFIG.personal.path).toBe("global/memory/personal/");
    });
  });

  describe("isToolInScope", () => {
    it("should return true for claude-code in shared scope", async () => {
      const { isToolInScope } = await import("./memory-scoper.js");
      expect(isToolInScope("claude-code", "shared")).toBe(true);
    });

    it("should return true for claude-code in coding scope", async () => {
      const { isToolInScope } = await import("./memory-scoper.js");
      expect(isToolInScope("claude-code", "coding")).toBe(true);
    });

    it("should return false for claude-code in personal scope", async () => {
      const { isToolInScope } = await import("./memory-scoper.js");
      expect(isToolInScope("claude-code", "personal")).toBe(false);
    });

    it("should return true for openclaw in shared scope", async () => {
      const { isToolInScope } = await import("./memory-scoper.js");
      expect(isToolInScope("openclaw", "shared")).toBe(true);
    });

    it("should return false for openclaw in coding scope", async () => {
      const { isToolInScope } = await import("./memory-scoper.js");
      expect(isToolInScope("openclaw", "coding")).toBe(false);
    });

    it("should return true for openclaw in personal scope", async () => {
      const { isToolInScope } = await import("./memory-scoper.js");
      expect(isToolInScope("openclaw", "personal")).toBe(true);
    });

    it("should return true for aider in coding scope", async () => {
      const { isToolInScope } = await import("./memory-scoper.js");
      expect(isToolInScope("aider", "coding")).toBe(true);
    });

    it("should return false for aider in personal scope", async () => {
      const { isToolInScope } = await import("./memory-scoper.js");
      expect(isToolInScope("aider", "personal")).toBe(false);
    });
  });

  describe("getScopesForTool", () => {
    it("should return shared and coding scopes for claude-code", async () => {
      const { getScopesForTool } = await import("./memory-scoper.js");
      const scopes = getScopesForTool("claude-code");
      expect(scopes).toEqual(["shared", "coding"]);
    });

    it("should return shared and coding scopes for codex", async () => {
      const { getScopesForTool } = await import("./memory-scoper.js");
      const scopes = getScopesForTool("codex");
      expect(scopes).toEqual(["shared", "coding"]);
    });

    it("should return shared and coding scopes for gemini-cli", async () => {
      const { getScopesForTool } = await import("./memory-scoper.js");
      const scopes = getScopesForTool("gemini-cli");
      expect(scopes).toEqual(["shared", "coding"]);
    });

    it("should return shared and coding scopes for opencode", async () => {
      const { getScopesForTool } = await import("./memory-scoper.js");
      const scopes = getScopesForTool("opencode");
      expect(scopes).toEqual(["shared", "coding"]);
    });

    it("should return shared and coding scopes for aider", async () => {
      const { getScopesForTool } = await import("./memory-scoper.js");
      const scopes = getScopesForTool("aider");
      expect(scopes).toEqual(["shared", "coding"]);
    });

    it("should return shared and personal scopes for openclaw", async () => {
      const { getScopesForTool } = await import("./memory-scoper.js");
      const scopes = getScopesForTool("openclaw");
      expect(scopes).toEqual(["shared", "personal"]);
    });
  });

  describe("getMemoryFilesForTool", () => {
    it("should return files from shared and coding scopes for claude-code", async () => {
      const fs = await import("node:fs/promises");
      const { pathExists } = await import("@mycelsh/core");
      const { getMemoryFilesForTool } = await import("./memory-scoper.js");

      vi.mocked(pathExists).mockResolvedValue(true);
      vi.mocked(fs.readdir).mockImplementation(async (dir) => {
        const dirStr = dir.toString();
        if (dirStr.includes("shared")) {
          return ["context.md", "preferences.md"] as unknown as Awaited<
            ReturnType<typeof fs.readdir>
          >;
        }
        if (dirStr.includes("coding")) {
          return ["coding-style.md", "tech-stack.md"] as unknown as Awaited<
            ReturnType<typeof fs.readdir>
          >;
        }
        return [] as unknown as Awaited<ReturnType<typeof fs.readdir>>;
      });

      const files = await getMemoryFilesForTool("claude-code");

      expect(files).toHaveLength(4);
      expect(files).toContainEqual(
        expect.objectContaining({
          scope: "shared",
          filename: "context.md",
        })
      );
      expect(files).toContainEqual(
        expect.objectContaining({
          scope: "shared",
          filename: "preferences.md",
        })
      );
      expect(files).toContainEqual(
        expect.objectContaining({
          scope: "coding",
          filename: "coding-style.md",
        })
      );
      expect(files).toContainEqual(
        expect.objectContaining({
          scope: "coding",
          filename: "tech-stack.md",
        })
      );
    });

    it("should return files from shared and personal scopes for openclaw", async () => {
      const fs = await import("node:fs/promises");
      const { pathExists } = await import("@mycelsh/core");
      const { getMemoryFilesForTool } = await import("./memory-scoper.js");

      vi.mocked(pathExists).mockResolvedValue(true);
      vi.mocked(fs.readdir).mockImplementation(async (dir) => {
        const dirStr = dir.toString();
        if (dirStr.includes("shared")) {
          return ["context.md"] as unknown as Awaited<
            ReturnType<typeof fs.readdir>
          >;
        }
        if (dirStr.includes("personal")) {
          return ["private-notes.md", "diary.md"] as unknown as Awaited<
            ReturnType<typeof fs.readdir>
          >;
        }
        return [] as unknown as Awaited<ReturnType<typeof fs.readdir>>;
      });

      const files = await getMemoryFilesForTool("openclaw");

      expect(files).toHaveLength(3);
      expect(files).toContainEqual(
        expect.objectContaining({
          scope: "shared",
          filename: "context.md",
        })
      );
      expect(files).toContainEqual(
        expect.objectContaining({
          scope: "personal",
          filename: "private-notes.md",
        })
      );
      expect(files).toContainEqual(
        expect.objectContaining({
          scope: "personal",
          filename: "diary.md",
        })
      );
    });

    it("should NOT return coding files for openclaw", async () => {
      const fs = await import("node:fs/promises");
      const { pathExists } = await import("@mycelsh/core");
      const { getMemoryFilesForTool } = await import("./memory-scoper.js");

      vi.mocked(pathExists).mockResolvedValue(true);
      vi.mocked(fs.readdir).mockImplementation(async (dir) => {
        const dirStr = dir.toString();
        if (dirStr.includes("shared")) {
          return ["context.md"] as unknown as Awaited<
            ReturnType<typeof fs.readdir>
          >;
        }
        if (dirStr.includes("coding")) {
          return ["coding-style.md"] as unknown as Awaited<
            ReturnType<typeof fs.readdir>
          >;
        }
        if (dirStr.includes("personal")) {
          return ["private.md"] as unknown as Awaited<
            ReturnType<typeof fs.readdir>
          >;
        }
        return [] as unknown as Awaited<ReturnType<typeof fs.readdir>>;
      });

      const files = await getMemoryFilesForTool("openclaw");

      // Should NOT include coding files
      expect(
        files.some((f: { scope: string }) => f.scope === "coding")
      ).toBe(false);
      expect(
        files.some((f: { filename: string }) => f.filename === "coding-style.md")
      ).toBe(false);
    });

    it("should return empty array when scope directories do not exist", async () => {
      const { pathExists } = await import("@mycelsh/core");
      const { getMemoryFilesForTool } = await import("./memory-scoper.js");

      vi.mocked(pathExists).mockResolvedValue(false);

      const files = await getMemoryFilesForTool("claude-code");

      expect(files).toEqual([]);
    });

    it("should only include .md files", async () => {
      const fs = await import("node:fs/promises");
      const { pathExists } = await import("@mycelsh/core");
      const { getMemoryFilesForTool } = await import("./memory-scoper.js");

      vi.mocked(pathExists).mockResolvedValue(true);
      vi.mocked(fs.readdir).mockImplementation(async (dir) => {
        const dirStr = dir.toString();
        if (dirStr.includes("shared")) {
          return [
            "context.md",
            "image.png",
            "data.json",
            "notes.md",
          ] as unknown as Awaited<ReturnType<typeof fs.readdir>>;
        }
        return [] as unknown as Awaited<ReturnType<typeof fs.readdir>>;
      });

      const files = await getMemoryFilesForTool("claude-code");

      expect(files).toHaveLength(2);
      expect(
        files.every((f: { filename: string }) => f.filename.endsWith(".md"))
      ).toBe(true);
    });
  });

  describe("loadMemoryFiles", () => {
    it("should load all memory files from a scope directory", async () => {
      const fs = await import("node:fs/promises");
      const { pathExists } = await import("@mycelsh/core");
      const { loadMemoryFiles } = await import("./memory-scoper.js");

      vi.mocked(pathExists).mockResolvedValue(true);
      vi.mocked(fs.readdir).mockResolvedValue([
        "file1.md",
        "file2.md",
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);
      vi.mocked(fs.readFile).mockImplementation(async (path) => {
        const pathStr = path.toString();
        if (pathStr.includes("file1.md")) {
          return "# File 1 content";
        }
        if (pathStr.includes("file2.md")) {
          return "# File 2 content";
        }
        return "";
      });

      const files = await loadMemoryFiles("shared");

      expect(files).toHaveLength(2);
      expect(files[0]).toEqual({
        scope: "shared",
        filename: "file1.md",
        path: expect.stringContaining("file1.md"),
        content: "# File 1 content",
      });
      expect(files[1]).toEqual({
        scope: "shared",
        filename: "file2.md",
        path: expect.stringContaining("file2.md"),
        content: "# File 2 content",
      });
    });

    it("should return empty array when scope directory does not exist", async () => {
      const { pathExists } = await import("@mycelsh/core");
      const { loadMemoryFiles } = await import("./memory-scoper.js");

      vi.mocked(pathExists).mockResolvedValue(false);

      const files = await loadMemoryFiles("personal");

      expect(files).toEqual([]);
    });
  });

  describe("syncMemoryToTool", () => {
    it("should concatenate memory files and write to tool path", async () => {
      const fs = await import("node:fs/promises");
      const { pathExists, ensureDir } = await import("@mycelsh/core");
      const { syncMemoryToTool } = await import("./memory-scoper.js");

      vi.mocked(pathExists).mockResolvedValue(true);
      vi.mocked(fs.readdir).mockImplementation(async (dir) => {
        const dirStr = dir.toString();
        if (dirStr.includes("shared")) {
          return ["context.md"] as unknown as Awaited<
            ReturnType<typeof fs.readdir>
          >;
        }
        if (dirStr.includes("coding")) {
          return ["style.md"] as unknown as Awaited<
            ReturnType<typeof fs.readdir>
          >;
        }
        return [] as unknown as Awaited<ReturnType<typeof fs.readdir>>;
      });
      vi.mocked(fs.readFile).mockImplementation(async (path) => {
        const pathStr = path.toString();
        if (pathStr.includes("context.md")) {
          return "# Context\nShared content here";
        }
        if (pathStr.includes("style.md")) {
          return "# Style Guide\nCoding style content";
        }
        return "";
      });
      vi.mocked(fs.writeFile).mockResolvedValue();

      const result = await syncMemoryToTool("claude-code");

      expect(result.success).toBe(true);
      expect(result.filesWritten).toBe(1);
      expect(fs.writeFile).toHaveBeenCalledTimes(1);

      // Check the content includes scope headers
      const writeCall = vi.mocked(fs.writeFile).mock.calls[0];
      const writtenContent = writeCall[1] as string;

      expect(writtenContent).toContain("<!-- SCOPE: shared -->");
      expect(writtenContent).toContain("# Context");
      expect(writtenContent).toContain("<!-- SCOPE: coding -->");
      expect(writtenContent).toContain("# Style Guide");
    });

    it("should add scope headers between sections", async () => {
      const fs = await import("node:fs/promises");
      const { pathExists, ensureDir } = await import("@mycelsh/core");
      const { syncMemoryToTool } = await import("./memory-scoper.js");

      vi.mocked(pathExists).mockResolvedValue(true);
      vi.mocked(fs.readdir).mockImplementation(async (dir) => {
        const dirStr = dir.toString();
        if (dirStr.includes("shared")) {
          return ["a.md", "b.md"] as unknown as Awaited<
            ReturnType<typeof fs.readdir>
          >;
        }
        if (dirStr.includes("coding")) {
          return ["c.md"] as unknown as Awaited<ReturnType<typeof fs.readdir>>;
        }
        return [] as unknown as Awaited<ReturnType<typeof fs.readdir>>;
      });
      vi.mocked(fs.readFile).mockImplementation(async (path) => {
        const pathStr = path.toString();
        if (pathStr.includes("a.md")) return "Content A";
        if (pathStr.includes("b.md")) return "Content B";
        if (pathStr.includes("c.md")) return "Content C";
        return "";
      });
      vi.mocked(fs.writeFile).mockResolvedValue();

      await syncMemoryToTool("codex");

      const writeCall = vi.mocked(fs.writeFile).mock.calls[0];
      const writtenContent = writeCall[1] as string;

      // Verify structure: shared header, then shared files, then coding header, then coding files
      const sharedHeaderIndex = writtenContent.indexOf(
        "<!-- SCOPE: shared -->"
      );
      const codingHeaderIndex = writtenContent.indexOf(
        "<!-- SCOPE: coding -->"
      );
      const contentAIndex = writtenContent.indexOf("Content A");
      const contentBIndex = writtenContent.indexOf("Content B");
      const contentCIndex = writtenContent.indexOf("Content C");

      expect(sharedHeaderIndex).toBeLessThan(contentAIndex);
      expect(contentAIndex).toBeLessThan(contentBIndex);
      expect(contentBIndex).toBeLessThan(codingHeaderIndex);
      expect(codingHeaderIndex).toBeLessThan(contentCIndex);
    });

    it("should write to correct tool memory path", async () => {
      const fs = await import("node:fs/promises");
      const { pathExists, ensureDir } = await import("@mycelsh/core");
      const { syncMemoryToTool } = await import("./memory-scoper.js");

      vi.mocked(pathExists).mockResolvedValue(true);
      vi.mocked(fs.readdir).mockResolvedValue([
        "test.md",
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);
      vi.mocked(fs.readFile).mockResolvedValue("test content");
      vi.mocked(fs.writeFile).mockResolvedValue();

      await syncMemoryToTool("claude-code");

      // Should write to expanded claude-code memory path
      expect(fs.writeFile).toHaveBeenCalledWith(
        "/home/user/.claude/CLAUDE.md",
        expect.any(String),
        "utf-8"
      );
    });

    it("should ensure target directory exists before writing", async () => {
      const fs = await import("node:fs/promises");
      const { pathExists, ensureDir } = await import("@mycelsh/core");
      const { syncMemoryToTool } = await import("./memory-scoper.js");

      vi.mocked(pathExists).mockResolvedValue(true);
      vi.mocked(fs.readdir).mockResolvedValue([
        "test.md",
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);
      vi.mocked(fs.readFile).mockResolvedValue("test content");
      vi.mocked(fs.writeFile).mockResolvedValue();

      await syncMemoryToTool("opencode");

      expect(ensureDir).toHaveBeenCalledWith("/home/user/.opencode");
    });

    it("should sync personal scope only to openclaw", async () => {
      const fs = await import("node:fs/promises");
      const { pathExists, ensureDir } = await import("@mycelsh/core");
      const { syncMemoryToTool } = await import("./memory-scoper.js");

      vi.mocked(pathExists).mockResolvedValue(true);
      vi.mocked(fs.readdir).mockImplementation(async (dir) => {
        const dirStr = dir.toString();
        if (dirStr.includes("shared")) {
          return ["shared.md"] as unknown as Awaited<
            ReturnType<typeof fs.readdir>
          >;
        }
        if (dirStr.includes("personal")) {
          return ["personal.md"] as unknown as Awaited<
            ReturnType<typeof fs.readdir>
          >;
        }
        return [] as unknown as Awaited<ReturnType<typeof fs.readdir>>;
      });
      vi.mocked(fs.readFile).mockImplementation(async (path) => {
        const pathStr = path.toString();
        if (pathStr.includes("shared.md")) return "Shared content";
        if (pathStr.includes("personal.md")) return "Personal content";
        return "";
      });
      vi.mocked(fs.writeFile).mockResolvedValue();

      await syncMemoryToTool("openclaw");

      const writeCall = vi.mocked(fs.writeFile).mock.calls[0];
      const writtenContent = writeCall[1] as string;

      expect(writtenContent).toContain("<!-- SCOPE: shared -->");
      expect(writtenContent).toContain("Shared content");
      expect(writtenContent).toContain("<!-- SCOPE: personal -->");
      expect(writtenContent).toContain("Personal content");
      // Should NOT contain coding scope
      expect(writtenContent).not.toContain("<!-- SCOPE: coding -->");
    });

    it("should return error result when write fails", async () => {
      const fs = await import("node:fs/promises");
      const { pathExists, ensureDir } = await import("@mycelsh/core");
      const { syncMemoryToTool } = await import("./memory-scoper.js");

      vi.mocked(pathExists).mockResolvedValue(true);
      vi.mocked(fs.readdir).mockResolvedValue([
        "test.md",
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);
      vi.mocked(fs.readFile).mockResolvedValue("test content");
      vi.mocked(fs.writeFile).mockRejectedValue(new Error("Permission denied"));

      const result = await syncMemoryToTool("claude-code");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Permission denied");
    });

    it("should handle empty memory files gracefully", async () => {
      const fs = await import("node:fs/promises");
      const { pathExists } = await import("@mycelsh/core");
      const { syncMemoryToTool } = await import("./memory-scoper.js");

      vi.mocked(pathExists).mockResolvedValue(false);

      const result = await syncMemoryToTool("claude-code");

      expect(result.success).toBe(true);
      expect(result.filesWritten).toBe(0);
      expect(fs.writeFile).not.toHaveBeenCalled();
    });
  });
});
