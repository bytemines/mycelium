/**
 * Shared TOML helpers for MCP section replacement in Codex-style config.toml files.
 */

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
