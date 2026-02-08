import { describe, it, expect } from "vitest";
import { routeMcpsForProject, detectProjectContext } from "./mcp-router.js";

describe("mcp-router", () => {
  it("detects Python project and enables relevant MCPs", () => {
    const context = detectProjectContext(["requirements.txt", "main.py", "README.md"]);
    const allMcps = {
      "python-mcp": { command: "python-mcp", tags: ["python"] },
      "git-mcp": { command: "git-mcp", tags: ["git"] },
      "node-mcp": { command: "node-mcp", tags: ["node", "javascript"] },
    };
    const routed = routeMcpsForProject(allMcps, context);
    expect(routed).toContain("python-mcp");
    expect(routed).toContain("git-mcp"); // always included
    expect(routed).not.toContain("node-mcp");
  });

  it("detectProjectContext identifies project type from files", () => {
    const context = detectProjectContext(["package.json", "tsconfig.json", "src/index.ts"]);
    expect(context.languages).toContain("typescript");
    expect(context.frameworks).toContain("node");
  });

  it("detects Go project", () => {
    const context = detectProjectContext(["go.mod", "main.go"]);
    expect(context.languages).toContain("go");
  });

  it("detects Rust project", () => {
    const context = detectProjectContext(["Cargo.toml", "src/main.rs"]);
    expect(context.languages).toContain("rust");
  });

  it("includes universal MCPs like git", () => {
    const context = detectProjectContext(["README.md"]);
    const allMcps = {
      "git-mcp": { command: "git-mcp", tags: ["git"] },
      "python-mcp": { command: "python-mcp", tags: ["python"] },
    };
    const routed = routeMcpsForProject(allMcps, context);
    expect(routed).toContain("git-mcp");
    expect(routed).not.toContain("python-mcp");
  });
});
