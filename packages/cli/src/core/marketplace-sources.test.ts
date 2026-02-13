import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:fs/promises");
vi.mock("./marketplace-cache.js", () => ({
  cachedFetch: vi.fn(),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

import { parseGitHubUrl, searchGitHubRepo, fetchGitHubRepoItems } from "./marketplace-sources.js";
import { cachedFetch } from "./marketplace-cache.js";

beforeEach(() => {
  vi.clearAllMocks();
  // By default, cachedFetch calls the fetcher
  vi.mocked(cachedFetch).mockImplementation(async (_key, fetcher) => fetcher());
});

describe("parseGitHubUrl", () => {
  it("parses standard GitHub URLs", () => {
    expect(parseGitHubUrl("https://github.com/bytemines/sherpai")).toEqual({
      owner: "bytemines",
      repo: "sherpai",
    });
  });

  it("strips .git suffix", () => {
    expect(parseGitHubUrl("https://github.com/foo/bar.git")).toEqual({
      owner: "foo",
      repo: "bar",
    });
  });

  it("returns null for non-GitHub URLs", () => {
    expect(parseGitHubUrl("https://gitlab.com/foo/bar")).toBeNull();
    expect(parseGitHubUrl("https://example.com")).toBeNull();
  });
});

describe("fetchGitHubRepoItems", () => {
  it("extracts skills, agents, and commands from tree", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        tree: [
          { path: "skills/debugging/SKILL.md", type: "blob" },
          { path: "skills/testing/SKILL.md", type: "blob" },
          { path: "agents/reviewer.md", type: "blob" },
          { path: "commands/deploy.md", type: "blob" },
          { path: "README.md", type: "blob" },
          { path: "skills", type: "tree" },
        ],
      }),
    });

    const items = await fetchGitHubRepoItems("owner", "repo");
    expect(items).toHaveLength(4);
    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "debugging", type: "skill" }),
        expect.objectContaining({ name: "testing", type: "skill" }),
        expect.objectContaining({ name: "reviewer", type: "agent" }),
        expect.objectContaining({ name: "deploy", type: "command" }),
      ])
    );
  });

  it("returns empty on API failure", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(fetchGitHubRepoItems("owner", "repo")).rejects.toThrow("GitHub API 500");
  });
});

describe("searchGitHubRepo", () => {
  it("filters items by query", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        tree: [
          { path: "skills/debugging/SKILL.md", type: "blob" },
          { path: "skills/testing/SKILL.md", type: "blob" },
        ],
      }),
    });

    const result = await searchGitHubRepo("owner", "repo", "debug", "my-source");
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].name).toBe("debugging");
    expect(result.source).toBe("my-source");
  });

  it("returns all items when query is empty", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        tree: [
          { path: "skills/a/SKILL.md", type: "blob" },
          { path: "skills/b/SKILL.md", type: "blob" },
        ],
      }),
    });

    const result = await searchGitHubRepo("owner", "repo", "", "src");
    expect(result.entries).toHaveLength(2);
  });
});

describe("cachedFetch integration", () => {
  it("uses cachedFetch for GitHub tree", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ tree: [{ path: "skills/cached/SKILL.md", type: "blob" }] }),
    });

    const items = await fetchGitHubRepoItems("owner", "repo");
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("cached");
    expect(cachedFetch).toHaveBeenCalledWith(
      "github-owner-repo",
      expect.any(Function),
      undefined,
    );
  });

  it("returns cached data when cachedFetch provides it", async () => {
    vi.mocked(cachedFetch).mockResolvedValueOnce([
      { path: "skills/from-cache/SKILL.md", type: "blob" },
    ]);

    const items = await fetchGitHubRepoItems("owner", "repo");
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("from-cache");
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
