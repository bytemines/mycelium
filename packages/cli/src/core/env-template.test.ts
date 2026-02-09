import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  generateEnvTemplate,
  getMissingEnvVars,
  setupEnvVars,
  ensureGitignore,
  scanMcpsVarRefs,
} from "./env-template.js";

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));

vi.mock("@mycelium/core", async () => {
  const actual = await vi.importActual("@mycelium/core");
  return {
    ...actual,
    expandPath: (p: string) => p.replace("~", "/home/test"),
  };
});

import * as fs from "node:fs/promises";

const readFile = vi.mocked(fs.readFile);
const writeFile = vi.mocked(fs.writeFile);

beforeEach(() => {
  vi.clearAllMocks();
  writeFile.mockResolvedValue(undefined);
  (fs.mkdir as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
});

describe("generateEnvTemplate", () => {
  it("strips values, keeps keys sorted", async () => {
    readFile.mockImplementation((p) => {
      const path = String(p);
      if (path.endsWith(".env.local"))
        return Promise.resolve("ZEBRA=123\nAPI_KEY=secret\n");
      if (path.endsWith("mcps.yaml")) return Promise.reject(new Error("not found"));
      return Promise.reject(new Error("not found"));
    });

    const keys = await generateEnvTemplate();
    expect(keys).toEqual(["API_KEY", "ZEBRA"]);

    const written = writeFile.mock.calls.find(([p]) =>
      String(p).endsWith(".env.template")
    );
    expect(written).toBeDefined();
    const content = written![1] as string;
    expect(content).toContain("API_KEY=\n");
    expect(content).toContain("ZEBRA=\n");
    expect(content).not.toContain("secret");
  });

  it("includes ${VAR} refs from mcps.yaml", async () => {
    readFile.mockImplementation((p) => {
      const path = String(p);
      if (path.endsWith(".env.local")) return Promise.resolve("API_KEY=x\n");
      if (path.endsWith("mcps.yaml"))
        return Promise.resolve('url: ${MCP_URL}\ntoken: ${API_KEY}\n');
      return Promise.reject(new Error("not found"));
    });

    const keys = await generateEnvTemplate();
    expect(keys).toContain("MCP_URL");
    expect(keys).toContain("API_KEY");
  });
});

describe("getMissingEnvVars", () => {
  it("finds diff between template and local", async () => {
    readFile.mockImplementation((p) => {
      const path = String(p);
      if (path.endsWith(".env.template"))
        return Promise.resolve("API_KEY=\nGITHUB_TOKEN=\nDB_URL=\n");
      if (path.endsWith(".env.local")) return Promise.resolve("API_KEY=val\n");
      return Promise.reject(new Error("not found"));
    });

    const missing = await getMissingEnvVars();
    expect(missing).toEqual(["GITHUB_TOKEN", "DB_URL"]);
  });

  it("returns empty when no template", async () => {
    readFile.mockRejectedValue(new Error("not found"));
    const missing = await getMissingEnvVars();
    expect(missing).toEqual([]);
  });
});

describe("setupEnvVars", () => {
  it("writes answers to .env.local", async () => {
    readFile.mockRejectedValue(new Error("not found"));

    await setupEnvVars({ API_KEY: "abc", TOKEN: "xyz" });

    const written = writeFile.mock.calls.find(([p]) =>
      String(p).endsWith(".env.local")
    );
    expect(written).toBeDefined();
    const content = written![1] as string;
    expect(content).toContain("API_KEY=abc");
    expect(content).toContain("TOKEN=xyz");
  });

  it("merges with existing .env.local", async () => {
    readFile.mockImplementation((p) => {
      if (String(p).endsWith(".env.local"))
        return Promise.resolve("EXISTING=keep\n");
      return Promise.reject(new Error("not found"));
    });

    await setupEnvVars({ NEW_KEY: "val" });

    const written = writeFile.mock.calls.find(([p]) =>
      String(p).endsWith(".env.local")
    );
    const content = written![1] as string;
    expect(content).toContain("EXISTING=keep");
    expect(content).toContain("NEW_KEY=val");
  });
});

describe("ensureGitignore", () => {
  it("creates .gitignore with required entries", async () => {
    readFile.mockRejectedValue(new Error("not found"));

    await ensureGitignore();

    const written = writeFile.mock.calls.find(([p]) =>
      String(p).endsWith(".gitignore")
    );
    expect(written).toBeDefined();
    const content = written![1] as string;
    expect(content).toContain(".env.local");
    expect(content).toContain("machines/");
  });

  it("appends missing entries to existing .gitignore", async () => {
    readFile.mockImplementation((p) => {
      if (String(p).endsWith(".gitignore"))
        return Promise.resolve(".env.local\n");
      return Promise.reject(new Error("not found"));
    });

    await ensureGitignore();

    const written = writeFile.mock.calls.find(([p]) =>
      String(p).endsWith(".gitignore")
    );
    const content = written![1] as string;
    expect(content).toContain("machines/");
    expect(content).not.toContain(".env.local\n.env.local");
  });

  it("does nothing if all entries present", async () => {
    readFile.mockImplementation((p) => {
      if (String(p).endsWith(".gitignore"))
        return Promise.resolve(".env.local\nmachines/\n");
      return Promise.reject(new Error("not found"));
    });

    await ensureGitignore();

    const gitignoreWrites = writeFile.mock.calls.filter(([p]) =>
      String(p).endsWith(".gitignore")
    );
    expect(gitignoreWrites).toHaveLength(0);
  });
});

describe("scanMcpsVarRefs", () => {
  it("extracts ${VAR} patterns from mcps.yaml", async () => {
    readFile.mockImplementation((p) => {
      if (String(p).endsWith("mcps.yaml"))
        return Promise.resolve('server: ${HOST}\nkey: ${API_KEY}\nother: ${HOST}\n');
      return Promise.reject(new Error("not found"));
    });

    const vars = await scanMcpsVarRefs();
    expect(vars).toContain("HOST");
    expect(vars).toContain("API_KEY");
    // deduped
    expect(vars.filter((v) => v === "HOST")).toHaveLength(1);
  });
});
