/**
 * SKILL.md Parser
 * Parses the SKILL.md standard format (frontmatter + body)
 */

export interface SkillMdMetadata {
  name: string;
  description: string;
  tools: string[];
  model?: string;
  color?: string;
  body: string;
}

/**
 * Parse SKILL.md content into structured metadata
 */
export function parseSkillMd(content: string): SkillMdMetadata {
  const result: SkillMdMetadata = {
    name: "",
    description: "",
    tools: [],
    body: content,
  };

  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!frontmatterMatch) return result;

  const [, frontmatter, body] = frontmatterMatch;
  result.body = body.trim();

  for (const line of frontmatter.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();

    switch (key) {
      case "name":
        result.name = value;
        break;
      case "description":
        result.description = value;
        break;
      case "tools":
        result.tools = value ? value.split(",").map(t => t.trim()).filter(Boolean) : [];
        break;
      case "model":
        result.model = value || undefined;
        break;
      case "color":
        result.color = value || undefined;
        break;
    }
  }

  return result;
}

/**
 * Validate that SKILL.md has required fields
 */
export function isValidSkillMd(content: string): boolean {
  const parsed = parseSkillMd(content);
  return parsed.name.length > 0;
}
