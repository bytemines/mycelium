import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  mkdir: vi.fn(),
}));

describe("fs-helpers", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("exports", () => {
    it("exports MYCELIUM_HOME as ~/.mycelium path", async () => {
      const { MYCELIUM_HOME } = await import("./fs-helpers.js");
      expect(MYCELIUM_HOME).toContain(".mycelium");
    });

    it("exports DEFAULT_PORT as 3378", async () => {
      const { DEFAULT_PORT } = await import("./fs-helpers.js");
      expect(DEFAULT_PORT).toBe(3378);
    });

    it("exports MEMORY_LINE_LIMIT as 200", async () => {
      const { MEMORY_LINE_LIMIT } = await import("./fs-helpers.js");
      expect(MEMORY_LINE_LIMIT).toBe(200);
    });
  });

  describe("readFileIfExists", () => {
    it("returns file content when file exists", async () => {
      const fs = await import("node:fs/promises");
      vi.mocked(fs.readFile).mockResolvedValue("hello world");

      const { readFileIfExists } = await import("./fs-helpers.js");
      const result = await readFileIfExists("/some/file.txt");

      expect(result).toBe("hello world");
      expect(fs.readFile).toHaveBeenCalledWith("/some/file.txt", "utf-8");
    });

    it("returns null when file does not exist", async () => {
      const fs = await import("node:fs/promises");
      vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"));

      const { readFileIfExists } = await import("./fs-helpers.js");
      const result = await readFileIfExists("/missing/file.txt");

      expect(result).toBeNull();
    });
  });

  describe("mkdirp", () => {
    it("creates directory recursively", async () => {
      const fs = await import("node:fs/promises");
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);

      const { mkdirp } = await import("./fs-helpers.js");
      await mkdirp("/some/deep/dir");

      expect(fs.mkdir).toHaveBeenCalledWith("/some/deep/dir", { recursive: true });
    });
  });
});
