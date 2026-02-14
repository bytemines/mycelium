import { describe, it, expect } from "vitest";
import { isLikelySecret, detectSecretsInMcps } from "./secret-detector.js";

describe("isLikelySecret", () => {
  it("detects secrets by key name", () => {
    expect(isLikelySecret("API_KEY", "somevalue12345678")).toBe(true);
    expect(isLikelySecret("CONTEXT7_API_KEY", "ctx7sk-abc123def456")).toBe(true);
    expect(isLikelySecret("DB_PASSWORD", "supersecretpassword")).toBe(true);
    expect(isLikelySecret("AUTH_TOKEN", "tok_1234567890abcdef")).toBe(true);
    expect(isLikelySecret("CLIENT_SECRET", "abcdefgh12345678")).toBe(true);
  });

  it("detects secrets by value prefix", () => {
    expect(isLikelySecret("OPENAI", "sk-proj-abcdef1234567890")).toBe(true);
    expect(isLikelySecret("GITHUB_PAT", "ghp_abcdef1234567890")).toBe(true);
    expect(isLikelySecret("SLACK", "xoxb-1234567890-abc")).toBe(true);
    expect(isLikelySecret("AWS_ID", "AKIAIOSFODNN7EXAMPLE")).toBe(true);
    expect(isLikelySecret("CTX7", "ctx7sk-abcdefghijk1234")).toBe(true);
  });

  it("detects high-entropy values", () => {
    expect(isLikelySecret("MASSIVE", "aB3dE5fG7hI9jK1lM3nO5pQ7")).toBe(true);
  });

  it("ignores ${VAR} references", () => {
    expect(isLikelySecret("API_KEY", "${API_KEY}")).toBe(false);
    expect(isLikelySecret("SECRET", "${MY_SECRET}")).toBe(false);
  });

  it("ignores ${env:VAR} references (Cursor/Windsurf syntax)", () => {
    expect(isLikelySecret("API_KEY", "${env:API_KEY}")).toBe(false);
    expect(isLikelySecret("TOKEN", "${env:MY_TOKEN}")).toBe(false);
  });

  it("ignores ${VAR:-default} references", () => {
    expect(isLikelySecret("API_KEY", "${API_KEY:-fallback}")).toBe(false);
  });

  it("ignores short values", () => {
    expect(isLikelySecret("MODE", "debug")).toBe(false);
    expect(isLikelySecret("FLAG", "true")).toBe(false);
  });

  it("ignores paths and URLs", () => {
    expect(isLikelySecret("PATH", "/usr/local/bin/node-server-app")).toBe(false);
    expect(isLikelySecret("URL", "https://api.example.com/v1/endpoint")).toBe(false);
  });

  it("ignores non-secret env vars", () => {
    expect(isLikelySecret("NODE_ENV", "production")).toBe(false);
    expect(isLikelySecret("PORT", "3000")).toBe(false);
    expect(isLikelySecret("DEBUG", "mycelium:*")).toBe(false);
  });
});

describe("detectSecretsInMcps", () => {
  it("finds secrets across multiple MCPs", () => {
    const mcps = {
      context7: {
        env: {
          CONTEXT7_API_KEY: "ctx7sk-realkey123456",
          MODE: "default",
        },
      },
      massive: {
        env: {
          MASSIVE_API_KEY: "sk-massivekey12345678",
        },
      },
      safe: {
        env: {
          NODE_ENV: "production",
        },
      },
    };

    const findings = detectSecretsInMcps(mcps);
    expect(findings).toHaveLength(2);
    expect(findings[0].mcpName).toBe("context7");
    expect(findings[0].key).toBe("CONTEXT7_API_KEY");
    expect(findings[1].mcpName).toBe("massive");
    expect(findings[1].key).toBe("MASSIVE_API_KEY");
  });

  it("returns empty for clean config", () => {
    const mcps = {
      server: {
        env: {
          API_KEY: "${API_KEY}",
          PORT: "3000",
        },
      },
    };
    expect(detectSecretsInMcps(mcps)).toHaveLength(0);
  });

  it("handles MCPs without env", () => {
    const mcps = {
      server: { command: "node" } as any,
    };
    expect(detectSecretsInMcps(mcps)).toHaveLength(0);
  });
});
