import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { TOOL_REGISTRY, type MergedConfig } from "@mycelish/core";
import { GenericAdapter } from "../core/auto-adapter.js";

const state = vi.hoisted(() => ({ home: "" }));
vi.mock("@mycelish/core", async importOriginal => ({
  ...await importOriginal<typeof import("@mycelish/core")>(),
  expandPath: (p: string) => p.replace("~", state.home),
  resolvePath: (p: unknown) => typeof p === "string" ? p.replace("~", state.home) : null,
}));
vi.mock("../core/config-merger.js", () => ({
  loadAndMergeAllConfigs: vi.fn(), loadGlobalConfig: vi.fn().mockResolvedValue({}),
  loadProjectConfig: vi.fn().mockResolvedValue({}),
}));
vi.mock("../core/symlink-manager.js", () => ({
  syncSkillsToTool: vi.fn().mockResolvedValue({ created: [], updated: [], unchanged: [] }),
}));
vi.mock("../core/file-syncer.js", () => ({
  syncFilesToDir: vi.fn().mockResolvedValue({ created: [], updated: [], unchanged: [] }),
}));
vi.mock("../core/machine-overrides.js", () => ({
  loadMachineOverrides: vi.fn().mockResolvedValue({ mcps: {} }),
  // sync re-detects overrides on every run (self-healing paths) — mock it too
  rescanOverrides: vi.fn().mockResolvedValue({ hostname: "test", detectedAt: "", updatedAt: "", mcps: {} }),
  applyMachineOverrides: vi.fn(mcps => mcps),
}));
vi.mock("../core/plugin-takeover.js", () => ({
  PLUGIN_COMPONENT_DIRS: {}, cleanOrphanedTakeovers: vi.fn().mockResolvedValue([]),
}));
vi.mock("../core/global-tracer.js", () => ({
  getTracer: () => ({ createTrace: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }) }),
  closeTracer: vi.fn(),
}));
vi.mock("../core/tool-adapter.js", () => ({ getAdapter: vi.fn() }));

import { getAdapter } from "../core/tool-adapter.js";
import { loadAndMergeAllConfigs } from "../core/config-merger.js";
import { syncFilesToDir } from "../core/file-syncer.js";
import { syncAll } from "./sync.js";

describe("manifest state → native MCP reconciliation", () => {
  let root: string;
  let nativePath: string;
  let adapter: GenericAdapter;
  let config: MergedConfig;
  const run = () => syncAll(root, { opencode: { enabled: true } });
  const manifest = (level: "global" | "project", value: object) => fs.writeFile(
    path.join(level === "global" ? state.home : root, ".mycelium/manifest.yaml"), JSON.stringify(value),
  );

  beforeEach(async () => {
    vi.mocked(syncFilesToDir).mockResolvedValue({ success: true, created: [], updated: [], removed: [], unchanged: [], errors: [] });
    root = await fs.mkdtemp(path.join(os.tmpdir(), "mycelium-reconcile-"));
    state.home = path.join(root, "home");
    await fs.mkdir(path.join(state.home, ".mycelium"), { recursive: true });
    await fs.mkdir(path.join(root, ".mycelium"));
    nativePath = path.join(root, "native.json");
    adapter = new GenericAdapter({
      ...TOOL_REGISTRY.opencode, cli: null,
      paths: { ...TOOL_REGISTRY.opencode.paths, mcp: nativePath },
    });
    vi.mocked(getAdapter).mockReturnValue(adapter);
    config = { mcps: {}, skills: {}, agents: {}, rules: {}, commands: {}, sources: {} };
    vi.mocked(loadAndMergeAllConfigs).mockResolvedValue(config);
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it("removes source-absent tombstones and preserves unknown native entries, idempotently", async () => {
    await manifest("global", { mcps: { "vendor/whark": { state: "deleted" } } });
    await fs.writeFile(nativePath, JSON.stringify({ theme: "dark", mcp: {
      "vendor/whark": { command: ["old"] }, personal: { type: "remote", url: "https://example.invalid" },
    } }));
    expect((await run()).success).toBe(true);
    expect((await run()).success).toBe(true);
    expect(JSON.parse(await fs.readFile(nativePath, "utf-8"))).toEqual({
      theme: "dark", mcp: { personal: { type: "remote", url: "https://example.invalid" } },
    });
  });

  it.each([
    ["agents", "disabled"], ["agents", "deleted"],
    ["commands", "disabled"], ["commands", "deleted"],
  ] as const)("removes current-project %s links for %s state, preserving unrelated projects", async (section, itemState) => {
    const real = await vi.importActual<typeof import("../core/file-syncer.js")>("../core/file-syncer.js");
    vi.mocked(syncFilesToDir).mockImplementation(real.syncFilesToDir);
    const source = path.join(root, ".mycelium", section, "foo.md");
    await fs.mkdir(path.dirname(source), { recursive: true });
    await fs.writeFile(source, "project managed");
    config[section].foo = { name: "foo", path: source, state: "enabled" };
    expect((await run()).success).toBe(true);
    const targetDir = path.join(state.home, ".config", "opencode", section);
    expect(await fs.readlink(path.join(targetDir, "foo.md"))).toBe(source);
    const other = path.join(root, "other-project", ".mycelium", section, "other.md");
    const outside = path.join(root, "personal.md");
    await fs.writeFile(outside, "personal");
    await fs.symlink(other, path.join(targetDir, "other.md"));
    await fs.symlink(outside, path.join(targetDir, "personal.md"));
    await manifest("project", { [section]: { foo: { state: itemState } } });
    if (itemState === "deleted") {
      await fs.unlink(source);
      delete config[section].foo;
    }
    expect((await run()).success).toBe(true);
    await expect(fs.lstat(path.join(targetDir, "foo.md"))).rejects.toMatchObject({ code: "ENOENT" });
    expect(await fs.readlink(path.join(targetDir, "other.md"))).toBe(other);
    expect(await fs.readlink(path.join(targetDir, "personal.md"))).toBe(outside);
  });

  it("does not let a disabled same-name skill remove an enabled MCP", async () => {
    await manifest("global", { skills: { shared: { state: "disabled" } }, mcps: { shared: { state: "enabled" } } });
    config.mcps.shared = { command: "server" };
    expect((await run()).success).toBe(true);
    expect(JSON.parse(await fs.readFile(nativePath, "utf-8")).mcp.shared.command).toEqual(["server"]);
  });

  it("honors project state priority over global tombstones", async () => {
    await manifest("global", { mcps: { shared: { state: "deleted" } } });
    await manifest("project", { mcps: { shared: { state: "enabled" } } });
    config.mcps.shared = { command: "server", state: "disabled" };
    expect((await run()).success).toBe(true);
    expect(JSON.parse(await fs.readFile(nativePath, "utf-8")).mcp.shared).toBeDefined();
    await manifest("project", { mcps: { shared: { state: "disabled" } } });
    expect((await run()).success).toBe(true);
    expect(JSON.parse(await fs.readFile(nativePath, "utf-8")).mcp.shared).toBeUndefined();
  });

  it("removes tool-excluded managed entries without mutating source config", async () => {
    config.mcps.shared = { command: "server", excludeTools: ["opencode"] };
    const original = structuredClone(config);
    await fs.writeFile(nativePath, JSON.stringify({ mcp: { shared: { command: ["old"] } } }));
    expect((await run()).success).toBe(true);
    expect(JSON.parse(await fs.readFile(nativePath, "utf-8")).mcp.shared).toBeUndefined();
    expect(config).toEqual(original);
  });

  it("reconciles tool restrictions stored only in the manifest", async () => {
    await manifest("global", { mcps: { shared: { state: "enabled", excludeTools: ["opencode"] } } });
    await fs.writeFile(nativePath, JSON.stringify({ mcp: { shared: { command: ["old"] } } }));
    expect((await run()).success).toBe(true);
    expect(JSON.parse(await fs.readFile(nativePath, "utf-8")).mcp.shared).toBeUndefined();
  });

  it("surfaces native removal failures", async () => {
    await manifest("global", { mcps: { whark: { state: "deleted" } } });
    vi.spyOn(adapter, "remove").mockResolvedValue({ success: false, method: "file", error: "EACCES" });
    const result = await run();
    expect(result.success).toBe(false);
    expect(result.errors).toEqual(["opencode: whark: EACCES"]);
  });

  it.each(["{broken", "null", "[]", '{"mcp":null}'])("does not overwrite malformed native JSON %s", async content => {
    await fs.writeFile(nativePath, content);
    config.mcps.shared = { command: "server" };
    expect((await run()).success).toBe(false);
    expect(await fs.readFile(nativePath, "utf-8")).toBe(content);
  });
});
