import type { McpServerConfig } from "@mycelish/core";

/** JSON strings are TOML basic strings, except DEL and non-scalar Unicode. */
export function tomlString(value: string): string {
  if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value)) {
    throw new Error("TOML strings must contain valid Unicode scalar values");
  }
  return JSON.stringify(value).replace(/\u007f/g, "\\u007f");
}

export function tomlKey(value: string): string {
  return /^[A-Za-z0-9_-]+$/.test(value) ? value : tomlString(value);
}

export function encodeMcpToml(mcps: Record<string, McpServerConfig>): string {
  const lines: string[] = [];
  for (const [name, mcp] of Object.entries(mcps)) {
    if (mcp.state && mcp.state !== "enabled") continue;
    const table = `mcp.servers.${tomlString(name)}`;
    lines.push(`[${table}]`, `command = ${tomlString(mcp.command)}`);
    if (mcp.args?.length) {
      lines.push(`args = [${mcp.args.map(tomlString).join(", ")}]`);
    }
    if (mcp.env && Object.keys(mcp.env).length) {
      lines.push(`[${table}.env]`);
      for (const [key, value] of Object.entries(mcp.env)) {
        lines.push(`${tomlKey(key)} = ${tomlString(value)}`);
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}
