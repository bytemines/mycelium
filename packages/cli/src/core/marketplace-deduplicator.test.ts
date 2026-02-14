import { describe, it, expect } from "vitest";
import { deduplicateEntries } from "./marketplace-deduplicator.js";
import type { MarketplaceSearchResult } from "@mycelish/core";

function entry(name: string, source: string, overrides: Record<string, unknown> = {}) {
  return { name, description: "", source, type: "skill" as const, ...overrides };
}

describe("deduplicateEntries", () => {
  it("returns empty array for empty input", () => {
    expect(deduplicateEntries([])).toEqual([]);
  });

  it("passes through unique entries", () => {
    const results: MarketplaceSearchResult[] = [
      { entries: [entry("foo", "anthropic-skills"), entry("bar", "openskills")], total: 2, source: "anthropic-skills" },
    ];
    const deduped = deduplicateEntries(results);
    expect(deduped).toHaveLength(2);
  });

  it("deduplicates by name (case-insensitive), keeping highest-priority source", () => {
    const results: MarketplaceSearchResult[] = [
      { entries: [entry("exa", "openskills", { downloads: 100 })], total: 1, source: "openskills" },
      { entries: [entry("Exa", "anthropic-skills", { stars: 50 })], total: 1, source: "anthropic-skills" },
      { entries: [entry("exa", "mcp-registry")], total: 1, source: "mcp-registry" },
    ];
    const deduped = deduplicateEntries(results);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].source).toBe("anthropic-skills");
    // Merged metadata
    expect(deduped[0].stars).toBe(50);
    expect(deduped[0].downloads).toBe(100);
  });

  it("merges best metadata from duplicates", () => {
    const results: MarketplaceSearchResult[] = [
      { entries: [entry("tool", "openskills", { version: "1.0", downloads: 50, description: "short" })], total: 1, source: "openskills" },
      { entries: [entry("tool", "mcp-registry", { stars: 200, description: "a much longer description here", url: "https://example.com" })], total: 1, source: "mcp-registry" },
    ];
    const deduped = deduplicateEntries(results);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].source).toBe("mcp-registry"); // higher priority than openskills
    expect(deduped[0].downloads).toBe(50);
    expect(deduped[0].stars).toBe(200);
    expect(deduped[0].description).toBe("a much longer description here");
  });

  it("sorts results by source priority", () => {
    const results: MarketplaceSearchResult[] = [
      { entries: [entry("z-item", "openskills")], total: 1, source: "openskills" },
      { entries: [entry("a-item", "anthropic-skills")], total: 1, source: "anthropic-skills" },
      { entries: [entry("m-item", "mcp-registry")], total: 1, source: "mcp-registry" },
    ];
    const deduped = deduplicateEntries(results);
    expect(deduped.map(e => e.source)).toEqual(["anthropic-skills", "mcp-registry", "openskills"]);
  });

  it("custom GitHub repos sort after known sources", () => {
    const results: MarketplaceSearchResult[] = [
      { entries: [entry("item", "my-custom-repo")], total: 1, source: "my-custom-repo" },
      { entries: [entry("item2", "openskills")], total: 1, source: "openskills" },
    ];
    const deduped = deduplicateEntries(results);
    expect(deduped[0].source).toBe("openskills");
    expect(deduped[1].source).toBe("my-custom-repo");
  });

  it("preserves installed status from any duplicate", () => {
    const results: MarketplaceSearchResult[] = [
      { entries: [entry("pkg", "openskills", { installed: true, installedVersion: "1.0" })], total: 1, source: "openskills" },
      { entries: [entry("pkg", "anthropic-skills")], total: 1, source: "anthropic-skills" },
    ];
    const deduped = deduplicateEntries(results);
    expect(deduped[0].installed).toBe(true);
    expect(deduped[0].installedVersion).toBe("1.0");
  });
});
