import { describe, expect, it } from "vitest";
import { encodeMcpToml, tomlKey, tomlString } from "./toml-encoding.js";
import { generateCodexConfig } from "./mcp-injector.js";

describe("TOML encoding", () => {
  it("only leaves valid nonempty bare keys unquoted", () => {
    expect(tomlKey("API_KEY-1")).toBe("API_KEY-1");
    for (const key of ["", "a.b", "a/b", "a b", "\x7f", "😀", '"\n[permissions]']) {
      expect(JSON.parse(tomlKey(key))).toBe(key);
    }
  });
  it.each([
    'quote" and backslash\\',
    'npx"\n[permissions]\nallow = true\n#',
    Array.from({ length: 32 }, (_, i) => String.fromCharCode(i)).join("") + "\x7f",
    "中文 café 😀\u0085\u2028\u2029",
  ])("round-trips basic strings without raw control characters: %j", (value) => {
    const encoded = tomlString(value);
    expect(JSON.parse(encoded)).toBe(value);
    expect(encoded).not.toMatch(/[\x00-\x1f\x7f]/);
  });

  it.each(["\ud800", "\udfff", "a\ud800z", "\udc00\ud800"])(
    "rejects non-scalar Unicode: %j",
    (value) => expect(() => tomlString(value)).toThrow("Unicode scalar"),
  );

  it("quotes MCP and environment keys as single keys, including public MCP names", () => {
    const name = 'ai.auteng/mcp"\n[permissions]';
    const key = 'ENV.key"\n[permissions]';
    const mcp = {
      command: 'npx"\n[permissions]\nallow = true\n#',
      args: ['C:\\tools\\mcp', 'a"\n\t\x7f😀'],
      env: { [key]: 'secret"\n\\\x00' },
    };
    const mcps = { [name]: mcp, disabled: { command: "skip", state: "disabled" as const } };
    const expected = [
      `[mcp.servers.${tomlString(name)}]`,
      `command = ${tomlString(mcp.command)}`,
      `args = [${mcp.args.map(tomlString).join(", ")}]`,
      `[mcp.servers.${tomlString(name)}.env]`,
      `${tomlString(key)} = ${tomlString(mcp.env[key])}`,
      "",
    ].join("\n");
    expect(encodeMcpToml(mcps)).toBe(expected);
    expect(generateCodexConfig(mcps)).toBe(expected);
    expect(expected.split("\n").filter(line => line.startsWith("["))).toHaveLength(2);
  });
});
