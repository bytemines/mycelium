import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BATCH_GITHUB } from "./marketplace-constants.js";

vi.mock("node:fs/promises");
vi.mock("./marketplace-cache.js", () => ({
  cachedFetch: vi.fn(),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

import { parseGitHubUrl, searchGitHubRepo, fetchGitHubRepoItems, enrichWithGitHubStars } from "./marketplace-sources.js";
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

describe("enrichWithGitHubStars — priority chain", () => {
  const makeEntry = (name: string, url: string) =>
    ({ name, url, stars: undefined, description: "", source: "test", type: "mcp" } as any);

  let savedGithubToken: string | undefined;
  let savedGhToken: string | undefined;

  beforeEach(() => {
    savedGithubToken = process.env.GITHUB_TOKEN;
    savedGhToken = process.env.GH_TOKEN;
    delete process.env.GITHUB_TOKEN;
    delete process.env.GH_TOKEN;
    // Restore cachedFetch default (pass-through) in case a prior test overrode it
    vi.mocked(cachedFetch).mockImplementation(async (_key, fetcher) => fetcher());
  });

  afterEach(() => {
    if (savedGithubToken !== undefined) process.env.GITHUB_TOKEN = savedGithubToken;
    else delete process.env.GITHUB_TOKEN;
    if (savedGhToken !== undefined) process.env.GH_TOKEN = savedGhToken;
    else delete process.env.GH_TOKEN;
  });

  it("uses ungh.cc and skips GitHub API", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ repo: { stars: 42 } }),
    });

    const entries = [makeEntry("a", "https://github.com/owner/repo")];
    await enrichWithGitHubStars(entries);
    expect(entries[0].stars).toBe(42);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toContain("ungh.cc");
    // Verify GitHub API was NOT called
    const ghCalls = mockFetch.mock.calls.filter((c: any[]) => c[0].includes("api.github.com"));
    expect(ghCalls).toHaveLength(0);
  });

  it("falls back to GitHub API with token when ungh.cc fails", async () => {
    process.env.GITHUB_TOKEN = "test-token";
    mockFetch.mockResolvedValueOnce({ ok: false });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ stargazers_count: 100 }),
    });

    const entries = [makeEntry("b", "https://github.com/owner/repo")];
    await enrichWithGitHubStars(entries);
    expect(entries[0].stars).toBe(100);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[1][1].headers.Authorization).toBe("Bearer test-token");
  });

  it("falls back to GitHub API unauth when ungh.cc fails and no token", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ stargazers_count: 55 }),
    });

    const entries = [makeEntry("c", "https://github.com/owner/repo")];
    await enrichWithGitHubStars(entries);
    expect(entries[0].stars).toBe(55);
    expect(mockFetch.mock.calls[1][1].headers).not.toHaveProperty("Authorization");
  });

  it("returns undefined stars when all sources fail", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403 });

    const entries = [makeEntry("d", "https://github.com/owner/repo")];
    await enrichWithGitHubStars(entries);
    expect(entries[0].stars).toBeUndefined();
  });

  it("respects BATCH_GITHUB limit", async () => {
    const overflow = 5;
    const entries = Array.from({ length: BATCH_GITHUB + overflow }, (_, i) =>
      makeEntry(`item-${i}`, `https://github.com/owner/repo-${i}`)
    );
    // ungh.cc succeeds for all — each repo gets 1 fetch call
    mockFetch.mockImplementation(async () => ({
      ok: true,
      json: async () => ({ repo: { stars: 1 } }),
    }));

    await enrichWithGitHubStars(entries);
    // Only BATCH_GITHUB repos should have been fetched
    expect(mockFetch).toHaveBeenCalledTimes(BATCH_GITHUB);
    expect(entries[BATCH_GITHUB - 1].stars).toBe(1);
    expect(entries[BATCH_GITHUB].stars).toBeUndefined();
  });

  it("deduplicates repos — same repo fetched once for multiple entries", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ repo: { stars: 50 } }),
    });

    const entries = [
      makeEntry("entry-1", "https://github.com/owner/same-repo"),
      makeEntry("entry-2", "https://github.com/owner/same-repo"),
    ];
    await enrichWithGitHubStars(entries);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(entries[0].stars).toBe(50);
    expect(entries[1].stars).toBe(50);
  });

  it("resolves GitHub URL from npm package when no GitHub URL present", async () => {
    // npm resolution (Phase 1), then star fetch (Phase 2)
    vi.mocked(cachedFetch)
      .mockResolvedValueOnce({ repoUrl: "https://github.com/npm-org/npm-repo" })
      .mockResolvedValueOnce({ stars: 99 });

    const entry = { name: "npm-mcp", url: undefined, stars: undefined, npmPackage: "@scope/mcp-server", source: "mcp-registry", type: "mcp", description: "" } as any;
    await enrichWithGitHubStars([entry]);
    expect(entry.url).toBe("https://github.com/npm-org/npm-repo");
    expect(entry.stars).toBe(99);
  });

  it("ignores non-GitHub URLs resolved from npm", async () => {
    // npm returns a non-GitHub URL — should be ignored
    vi.mocked(cachedFetch).mockResolvedValueOnce({ repoUrl: "https://gitlab.com/org/repo" });

    const entry = { name: "gitlab-mcp", url: undefined, stars: undefined, npmPackage: "gitlab-mcp", source: "mcp-registry", type: "mcp", description: "" } as any;
    await enrichWithGitHubStars([entry]);
    // URL should NOT be set (not a GitHub URL), stars should remain undefined
    expect(entry.url).toBeUndefined();
    expect(entry.stars).toBeUndefined();
  });

  it("skips npm resolution when entry already has GitHub URL", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ repo: { stars: 10 } }),
    });

    const entry = { name: "has-url", url: "https://github.com/org/repo", stars: undefined, npmPackage: "@scope/pkg", source: "mcp-registry", type: "mcp", description: "" } as any;
    await enrichWithGitHubStars([entry]);
    expect(entry.stars).toBe(10);
    const npmCalls = vi.mocked(cachedFetch).mock.calls.filter(c => (c[0] as string).startsWith("npm-repo-"));
    expect(npmCalls).toHaveLength(0);
  });
});
