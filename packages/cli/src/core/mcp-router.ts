/**
 * MCP Intelligent Routing
 * Auto-enable relevant MCPs based on project context
 */

export interface ProjectContext {
  languages: string[];
  frameworks: string[];
}

export interface RoutableMcp {
  command: string;
  tags: string[];
}

const UNIVERSAL_TAGS = ["git", "filesystem", "search", "shell"];

const FILE_INDICATORS: Record<string, { languages: string[]; frameworks: string[] }> = {
  "package.json": { languages: ["javascript"], frameworks: ["node"] },
  "tsconfig.json": { languages: ["typescript"], frameworks: ["node"] },
  "requirements.txt": { languages: ["python"], frameworks: [] },
  "pyproject.toml": { languages: ["python"], frameworks: [] },
  "Pipfile": { languages: ["python"], frameworks: [] },
  "go.mod": { languages: ["go"], frameworks: [] },
  "Cargo.toml": { languages: ["rust"], frameworks: [] },
  "Gemfile": { languages: ["ruby"], frameworks: [] },
  "pom.xml": { languages: ["java"], frameworks: ["maven"] },
  "build.gradle": { languages: ["java", "kotlin"], frameworks: ["gradle"] },
  "composer.json": { languages: ["php"], frameworks: [] },
  "mix.exs": { languages: ["elixir"], frameworks: [] },
  "Dockerfile": { languages: [], frameworks: ["docker"] },
  "docker-compose.yml": { languages: [], frameworks: ["docker"] },
};

/**
 * Detect project context from file listing
 */
export function detectProjectContext(files: string[]): ProjectContext {
  const languages = new Set<string>();
  const frameworks = new Set<string>();

  for (const file of files) {
    const basename = file.includes("/") ? file.split("/").pop()! : file;
    const indicator = FILE_INDICATORS[basename];
    if (indicator) {
      indicator.languages.forEach((l) => languages.add(l));
      indicator.frameworks.forEach((f) => frameworks.add(f));
    }

    // Extension-based detection
    if (file.endsWith(".ts") || file.endsWith(".tsx")) languages.add("typescript");
    if (file.endsWith(".py")) languages.add("python");
    if (file.endsWith(".go")) languages.add("go");
    if (file.endsWith(".rs")) languages.add("rust");
    if (file.endsWith(".rb")) languages.add("ruby");
    if (file.endsWith(".java")) languages.add("java");
  }

  return {
    languages: [...languages],
    frameworks: [...frameworks],
  };
}

/**
 * Route MCPs based on project context - returns names of MCPs to enable
 */
export function routeMcpsForProject(
  allMcps: Record<string, RoutableMcp>,
  context: ProjectContext
): string[] {
  const relevantTags = new Set([
    ...UNIVERSAL_TAGS,
    ...context.languages,
    ...context.frameworks,
  ]);

  return Object.entries(allMcps)
    .filter(([, mcp]) => mcp.tags.some((tag) => relevantTags.has(tag)))
    .map(([name]) => name);
}
