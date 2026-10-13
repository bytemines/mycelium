/**
 * Shared TOML helpers for MCP section replacement in Codex-style config.toml files.
 */

import { tomlString } from "./toml-encoding.js";

/** Recognize only complete, valid table paths; unknown headers are never removed. */
function mcpTable(line: string): { root: string; name: string } | undefined {
  const header = /^[ \t]*(\[\[|\[)(.*?)(\]\]|\])[ \t]*(?:#.*)?$/.exec(line.replace(/\r?\n$/, ""));
  if (!header) return;
  if (header[1].length !== header[3].length) return;
  const key = /[A-Za-z0-9_-]+|"(?:[^"\\\x00-\x1f\x7f]|\\(?:["\\btnfr]|u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}))*"|'[^'\x00-\x1f\x7f]*'/y;
  const parts: string[] = [];
  let position = 0;
  try {
    while (position < header[2].length) {
      while (/[ \t]/.test(header[2][position] ?? "")) position++;
      key.lastIndex = position;
      const match = key.exec(header[2]);
      if (!match) return;
      const token = match[0];
      const value = token.startsWith("'") ? token.slice(1, -1)
        : token.startsWith('"') ? JSON.parse(token.replace(/\\(?:U[0-9a-fA-F]{8}|u[0-9a-fA-F]{4}|["\\btnfr])/g, escape => {
          if (escape[1] !== "u" && escape[1] !== "U") return escape;
          const code = Number.parseInt(escape.slice(2), 16);
          if (code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) throw new Error("Invalid Unicode");
          return JSON.stringify(String.fromCodePoint(code)).slice(1, -1);
        })) as string : token;
      tomlString(value);
      parts.push(value);
      position = key.lastIndex;
      while (/[ \t]/.test(header[2][position] ?? "")) position++;
      if (position === header[2].length) break;
      if (header[2][position++] !== "." || position === header[2].length) return;
    }
  } catch {
    return;
  }
  if (parts[0] === "mcp_servers" && parts.length >= 2) return { root: "mcp_servers", name: parts[1] };
  if (parts[0] === "mcp" && parts[1] === "servers" && parts.length >= 3) return { root: "mcp.servers", name: parts[2] };
}

// Track string boundaries only: header-shaped lines inside multiline values are not tables.
function multilineAfter(line: string, delimiter: string): string {
  for (let i = 0; i < line.length;) {
    if (delimiter) {
      if (line.startsWith(delimiter, i)) { i += 3; delimiter = ""; }
      else i += delimiter === '"""' && line[i] === "\\" ? 2 : 1;
    } else if (line[i] === "#") {
      break;
    } else if (line[i] === '"' || line[i] === "'") {
      const quote = line[i];
      if (line.startsWith(quote.repeat(3), i)) { delimiter = quote.repeat(3); i += 3; }
      else {
        i++;
        while (i < line.length && line[i] !== quote) i += quote === '"' && line[i] === "\\" ? 2 : 1;
        i++;
      }
    } else i++;
  }
  return delimiter;
}

/** Replace just one literal server name (and its subtables), retaining native roots. */
export function replaceNamedMcpSection(content: string, name: string, newSection = "", root = "mcp.servers"): string {
  const preserved: string[] = [];
  let removing = false;
  let multiline = "";
  for (const line of content.match(/[^\n]*\n|[^\n]+$/g) ?? []) {
    if (!multiline && /^\s*\[/.test(line)) {
      const table = mcpTable(line);
      removing = table?.name === name;
      if (removing) root = table!.root;
    }
    multiline = multilineAfter(line, multiline);
    if (!removing) preserved.push(line);
  }
  const existing = preserved.join("");
  if (!newSection) return existing;
  const section = newSection.replace(/^\[mcp\.servers\./gm, `[${root}.`);
  return existing ? `${existing}${existing.endsWith("\n") ? "\n" : "\n\n"}${section}` : section;
}

/**
 * Strip all [mcp.servers.*] sections from TOML content, preserving everything else.
 * Then append the new MCP section.
 */
export function replaceMcpSection(content: string, newSection: string): string {
  const lines = content.split("\n");
  const preserved: string[] = [];
  let inMcpServers = false;

  for (const line of lines) {
    if (line.startsWith("[mcp.servers.")) {
      inMcpServers = true;
      continue;
    }
    if (inMcpServers && line.startsWith("[")) {
      if (!line.startsWith("[mcp.servers")) {
        inMcpServers = false;
        preserved.push(line);
      }
      continue;
    }
    if (!inMcpServers) {
      preserved.push(line);
    }
  }

  const trimmed = preserved.join("\n").trim();
  if (!newSection.trim()) return trimmed;
  return trimmed ? `${trimmed}\n\n${newSection}` : newSection;
}
