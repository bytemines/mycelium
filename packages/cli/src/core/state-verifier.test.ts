import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "node:fs/promises";

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  access: vi.fn(),
}));

vi.mock("@mycelish/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mycelish/core")>();
  return {
    ...actual,
    expandPath: (p: string) => p.replace("~", "/mock/home"),
  };
});

const MANIFEST_YAML = await import("yaml");

function makeManifest(sections: Record<string, Record<string, { state?: string; source?: string }>>) {
  return MANIFEST_YAML.stringify({ version: "1.0.0", ...sections });
}

describe("state-verifier", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("verifyItemState", () => {
    it("returns manifest state + tool presence for a disabled skill", async () => {
      // Manifest: skill disabled
      vi.mocked(fs.readFile).mockImplementation(async (p) => {
        const path = String(p);
        if (path.includes("manifest.yaml")) {
          return makeManifest({ skills: { "my-skill": { state: "disabled" } } });
        }
        throw new Error("ENOENT");
      });
      vi.mocked(fs.access).mockRejectedValue(new Error("ENOENT"));

      const { verifyItemState } = await import("./state-verifier.js");
      const result = await verifyItemState("my-skill", { tool: "claude-code" as any });

      expect(result.found).toBe(true);
      expect(result.state).toBe("disabled");
      expect(result.toolPresence).toHaveLength(1);
      expect(result.toolPresence[0].toolId).toBe("claude-code");
      expect(result.toolPresence[0].presentInConfig).toBe(false);
      expect(result.drifted).toHaveLength(0);
    });

    it("detects drift — manifest disabled but MCP still in tool config", async () => {
      const mcpConfig = JSON.stringify({
        mcpServers: { "my-mcp": { command: "npx", args: ["my-mcp"] } },
      });

      vi.mocked(fs.readFile).mockImplementation(async (p) => {
        const path = String(p);
        if (path.includes("manifest.yaml")) {
          return makeManifest({ mcps: { "my-mcp": { state: "disabled" } } });
        }
        if (path.includes(".claude.json")) {
          return mcpConfig;
        }
        throw new Error("ENOENT");
      });
      vi.mocked(fs.access).mockResolvedValue(undefined);

      const { verifyItemState } = await import("./state-verifier.js");
      const result = await verifyItemState("my-mcp", { tool: "claude-code" as any, type: "mcp" });

      expect(result.state).toBe("disabled");
      expect(result.toolPresence[0].presentInConfig).toBe(true);
      expect(result.drifted).toHaveLength(1);
      expect(result.drifted[0]).toContain("Claude Code");
    });

    it("checks all 9 tools when no tool filter specified", async () => {
      vi.mocked(fs.readFile).mockImplementation(async (p) => {
        const path = String(p);
        if (path.includes("manifest.yaml")) {
          return makeManifest({ agents: { "my-agent": { state: "enabled" } } });
        }
        throw new Error("ENOENT");
      });
      vi.mocked(fs.access).mockRejectedValue(new Error("ENOENT"));

      const { verifyItemState } = await import("./state-verifier.js");
      const result = await verifyItemState("my-agent", { type: "agent" });

      expect(result.toolPresence.length).toBe(9);
      expect(result.toolPresence.every(tp => tp.presentInConfig === false)).toBe(true);
    });

    it("handles item not in manifest with type override", async () => {
      vi.mocked(fs.readFile).mockImplementation(async (p) => {
        const path = String(p);
        if (path.includes("manifest.yaml")) {
          return makeManifest({});
        }
        throw new Error("ENOENT");
      });
      vi.mocked(fs.access).mockRejectedValue(new Error("ENOENT"));

      const { verifyItemState } = await import("./state-verifier.js");
      const result = await verifyItemState("unknown-cmd", { tool: "cursor" as any, type: "command" });

      expect(result.found).toBe(false);
      expect(result.type).toBe("command");
      expect(result.toolPresence).toHaveLength(1);
    });

    it("verifies MCP presence in JSONC format (VS Code)", async () => {
      const vscodeConfig = `{
        // VS Code MCP config
        "servers": {
          "postgres-mcp": { "command": "npx", "args": ["postgres-mcp"] }
        }
      }`;

      vi.mocked(fs.readFile).mockImplementation(async (p) => {
        const path = String(p);
        if (path.includes("manifest.yaml")) {
          return makeManifest({ mcps: { "postgres-mcp": { state: "enabled" } } });
        }
        if (path.includes("mcp.json")) {
          return vscodeConfig;
        }
        throw new Error("ENOENT");
      });
      vi.mocked(fs.access).mockResolvedValue(undefined);

      const { verifyItemState } = await import("./state-verifier.js");
      const result = await verifyItemState("postgres-mcp", { tool: "vscode" as any, type: "mcp" });

      expect(result.toolPresence[0].presentInConfig).toBe(true);
      expect(result.drifted).toHaveLength(0);
    });

    it("verifies MCP presence in TOML format (Codex)", async () => {
      const codexConfig = `
[mcpServers.my-mcp]
command = "npx"
args = ["my-mcp"]
`;
      vi.mocked(fs.readFile).mockImplementation(async (p) => {
        const path = String(p);
        if (path.includes("manifest.yaml")) {
          return makeManifest({ mcps: { "my-mcp": { state: "enabled" } } });
        }
        if (path.includes("config.toml")) {
          return codexConfig;
        }
        throw new Error("ENOENT");
      });
      vi.mocked(fs.access).mockResolvedValue(undefined);

      const { verifyItemState } = await import("./state-verifier.js");
      const result = await verifyItemState("my-mcp", { tool: "codex" as any, type: "mcp" });

      expect(result.toolPresence[0].presentInConfig).toBe(true);
    });

    it("handles missing config file gracefully", async () => {
      vi.mocked(fs.readFile).mockImplementation(async (p) => {
        const path = String(p);
        if (path.includes("manifest.yaml")) {
          return makeManifest({ mcps: { "test-mcp": { state: "enabled" } } });
        }
        throw new Error("ENOENT");
      });
      vi.mocked(fs.access).mockResolvedValue(undefined);

      const { verifyItemState } = await import("./state-verifier.js");
      const result = await verifyItemState("test-mcp", { tool: "claude-code" as any, type: "mcp" });

      expect(result.toolPresence[0].presentInConfig).toBe(false);
      expect(result.toolPresence[0].details).toBe("config file not found");
    });

    it("verifies all 6 item types dispatch correctly", async () => {
      vi.mocked(fs.readFile).mockImplementation(async (p) => {
        if (String(p).includes("manifest.yaml")) return makeManifest({});
        throw new Error("ENOENT");
      });
      vi.mocked(fs.access).mockRejectedValue(new Error("ENOENT"));

      const { verifyItemState } = await import("./state-verifier.js");

      for (const type of ["skill", "mcp", "hook", "memory", "agent", "command"] as const) {
        const result = await verifyItemState("test-item", { tool: "claude-code" as any, type });
        expect(result.type).toBe(type);
        expect(result.toolPresence).toHaveLength(1);
      }
    });

    it("detects skill present as symlink in tool dir", async () => {
      vi.mocked(fs.readFile).mockImplementation(async (p) => {
        if (String(p).includes("manifest.yaml")) {
          return makeManifest({ skills: { "my-skill": { state: "enabled" } } });
        }
        throw new Error("ENOENT");
      });
      // fs.access succeeds for the skill path (symlink exists)
      vi.mocked(fs.access).mockImplementation(async (p) => {
        const path = String(p);
        if (path.includes("skills/my-skill")) return undefined;
        if (path.includes(".mycelium")) return undefined; // manifest dir exists
        throw new Error("ENOENT");
      });

      const { verifyItemState } = await import("./state-verifier.js");
      const result = await verifyItemState("my-skill", { tool: "claude-code" as any });

      expect(result.toolPresence[0].presentInConfig).toBe(true);
    });
  });
});
