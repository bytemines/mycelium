import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:fs/promises");

import * as fs from "node:fs/promises";
import * as path from "node:path";
import os from "node:os";

const MEMORY_BASE = path.join(os.homedir(), ".mycelium", "global", "memory");

// Helper: extract the handler registered for a given tool name
function captureHandlers() {
  const { McpServer } = vi.hoisted(() => {
    const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>();
    return {
      McpServer: class {
        constructor(_opts: unknown) {}
        registerTool(name: string, _schema: unknown, handler: (...args: unknown[]) => Promise<unknown>) {
          handlers.set(name, handler);
        }
      },
      handlers,
    };
  });
  return { McpServer, handlers };
}

// We need a real approach: register tools into a map
const handlers = new Map<string, (args: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[] }>>();

vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => ({
  McpServer: class {
    constructor(_opts: unknown) {}
    registerTool(name: string, _schema: unknown, handler: (args: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[] }>) {
      handlers.set(name, handler);
    }
  },
}));

beforeEach(() => {
  vi.resetAllMocks();
  handlers.clear();
});

async function setup() {
  const { registerMemoryTools } = await import("./memory-tools.js");
  const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
  const server = new McpServer({ name: "test", version: "0.0.1" });
  registerMemoryTools(server as never);
  return {
    list: handlers.get("mycelium_memory_list")!,
    read: handlers.get("mycelium_memory_read")!,
    write: handlers.get("mycelium_memory_write")!,
  };
}

describe("registerMemoryTools", () => {
  it("registers all three memory tools", async () => {
    await setup();
    expect(handlers.has("mycelium_memory_list")).toBe(true);
    expect(handlers.has("mycelium_memory_read")).toBe(true);
    expect(handlers.has("mycelium_memory_write")).toBe(true);
  });
});

describe("mycelium_memory_list", () => {
  it("lists files across all scopes", async () => {
    vi.mocked(fs.readdir).mockImplementation(async (dir) => {
      const d = String(dir);
      if (d.endsWith("shared")) return ["patterns.md", "notes.md"] as unknown as Awaited<ReturnType<typeof fs.readdir>>;
      if (d.endsWith("coding")) return ["debug.md"] as unknown as Awaited<ReturnType<typeof fs.readdir>>;
      if (d.endsWith("personal")) return ["journal.md", "photo.png"] as unknown as Awaited<ReturnType<typeof fs.readdir>>;
      return [] as unknown as Awaited<ReturnType<typeof fs.readdir>>;
    });

    const { list } = await setup();
    const result = await list({ scope: undefined });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.shared).toEqual(["patterns.md", "notes.md"]);
    expect(parsed.coding).toEqual(["debug.md"]);
    expect(parsed.personal).toEqual(["journal.md"]); // .png filtered out
  });

  it("filters by single scope", async () => {
    vi.mocked(fs.readdir).mockResolvedValue(["foo.md"] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

    const { list } = await setup();
    const result = await list({ scope: "coding" });
    const parsed = JSON.parse(result.content[0].text);

    expect(Object.keys(parsed)).toEqual(["coding"]);
    expect(parsed.coding).toEqual(["foo.md"]);
  });

  it("returns empty arrays for missing directories", async () => {
    vi.mocked(fs.readdir).mockRejectedValue(new Error("ENOENT"));

    const { list } = await setup();
    const result = await list({ scope: undefined });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.shared).toEqual([]);
    expect(parsed.coding).toEqual([]);
    expect(parsed.personal).toEqual([]);
  });
});

describe("mycelium_memory_read", () => {
  it("returns file content", async () => {
    vi.mocked(fs.readFile).mockResolvedValue("# My Notes\nSome content");

    const { read } = await setup();
    const result = await read({ scope: "shared", name: "notes.md" });

    expect(result.content[0].text).toBe("# My Notes\nSome content");
    expect(vi.mocked(fs.readFile)).toHaveBeenCalledWith(
      path.join(MEMORY_BASE, "shared", "notes.md"),
      "utf-8",
    );
  });

  it("returns error for missing file", async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"));

    const { read } = await setup();
    const result = await read({ scope: "coding", name: "missing.md" });

    expect(result.content[0].text).toBe("File not found: coding/missing.md");
  });

  it("blocks path traversal", async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"));

    const { read } = await setup();
    await read({ scope: "shared", name: "../../../etc/passwd" });

    // path.basename strips traversal — should read "passwd" not the traversal path
    expect(vi.mocked(fs.readFile)).toHaveBeenCalledWith(
      path.join(MEMORY_BASE, "shared", "passwd"),
      "utf-8",
    );
  });
});

describe("mycelium_memory_write", () => {
  it("creates file", async () => {
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const { write } = await setup();
    const result = await write({ scope: "shared", name: "new.md", content: "# New" });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.success).toBe(true);
    expect(parsed.path).toBe("shared/new.md");
    expect(vi.mocked(fs.mkdir)).toHaveBeenCalledWith(
      path.join(MEMORY_BASE, "shared"),
      { recursive: true },
    );
    expect(vi.mocked(fs.writeFile)).toHaveBeenCalledWith(
      path.join(MEMORY_BASE, "shared", "new.md"),
      "# New",
      "utf-8",
    );
  });

  it("creates directory if needed (mkdir recursive)", async () => {
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const { write } = await setup();
    await write({ scope: "personal", name: "test.md", content: "hi" });

    expect(vi.mocked(fs.mkdir)).toHaveBeenCalledWith(
      path.join(MEMORY_BASE, "personal"),
      { recursive: true },
    );
  });

  it("blocks path traversal", async () => {
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const { write } = await setup();
    const result = await write({ scope: "shared", name: "../../etc/evil.md", content: "bad" });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.path).toBe("shared/evil.md");
    expect(vi.mocked(fs.writeFile)).toHaveBeenCalledWith(
      path.join(MEMORY_BASE, "shared", "evil.md"),
      "bad",
      "utf-8",
    );
  });
});
