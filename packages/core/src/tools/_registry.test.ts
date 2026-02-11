import { describe, it, expect } from "vitest";
import {
  TOOL_REGISTRY,
  ALL_TOOL_IDS,
  TOOL_ID_VALUES,
  resolvePath,
  getDescriptor,
  toolsWithCapability,
  toolsForScope,
  validateRegistry,
} from "./_registry.js";

describe("Tool Registry", () => {
  it("has 9 tools registered", () => {
    expect(ALL_TOOL_IDS).toHaveLength(8);
  });

  it("contains all expected tool ids", () => {
    const expected = [
      "claude-code", "codex", "gemini-cli", "opencode",
      "openclaw", "cursor", "vscode", "antigravity",
    ];
    for (const id of expected) {
      expect(TOOL_REGISTRY[id]).toBeDefined();
    }
  });

  it("TOOL_ID_VALUES is a non-empty tuple", () => {
    expect(TOOL_ID_VALUES.length).toBeGreaterThan(0);
  });
});

describe("resolvePath", () => {
  it("returns null for null", () => {
    expect(resolvePath(null)).toBeNull();
  });

  it("expands ~ in string paths", () => {
    const result = resolvePath("~/.claude.json");
    expect(result).not.toContain("~");
    expect(result).toContain(".claude.json");
  });

  it("resolves PlatformPaths for current platform", () => {
    const spec = {
      darwin: "~/Library/Application Support/Code/User/mcp.json",
      linux: "~/.config/Code/User/mcp.json",
      win32: "%APPDATA%/Code/User/mcp.json",
    };
    const result = resolvePath(spec);
    expect(result).not.toBeNull();
    expect(result).not.toContain("~");
  });
});

describe("getDescriptor", () => {
  it("returns correct descriptor for claude-code", () => {
    const desc = getDescriptor("claude-code");
    expect(desc.id).toBe("claude-code");
    expect(desc.display.name).toBe("Claude Code");
  });

  it("throws for nonexistent tool", () => {
    expect(() => getDescriptor("nonexistent")).toThrow("Unknown tool: nonexistent");
  });
});

describe("toolsWithCapability", () => {
  it("returns all 8 for mcp", () => {
    expect(toolsWithCapability("mcp")).toHaveLength(8);
  });

  it("returns tools with hooks capability", () => {
    const hooks = toolsWithCapability("hooks");
    expect(hooks).toHaveLength(6);
    const ids = hooks.map(t => t.id).sort();
    expect(ids).toEqual(["claude-code", "codex", "cursor", "gemini-cli", "openclaw", "opencode"]);
  });

  it("returns tools with rules capability", () => {
    const rules = toolsWithCapability("rules");
    expect(rules).toHaveLength(3);
    const ids = rules.map(t => t.id).sort();
    expect(ids).toEqual(["codex", "cursor", "vscode"]);
  });
});

describe("toolsForScope", () => {
  it("returns all 8 for shared", () => {
    expect(toolsForScope("shared")).toHaveLength(8);
  });

  it("returns only openclaw for personal", () => {
    const personal = toolsForScope("personal");
    expect(personal).toHaveLength(1);
    expect(personal[0].id).toBe("openclaw");
  });
});

describe("validateRegistry", () => {
  it("returns no errors for the default registry", () => {
    expect(validateRegistry()).toEqual([]);
  });
});

