import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { execFile } from "node:child_process";
import { parse as yamlParse } from "yaml";
import { addMcp, addSkill, parseSkillSource } from "./add-helpers.js";
import { loadProjectConfig } from "./config-merger.js";

vi.mock("node:child_process", () => ({ execFile: vi.fn() }));

let root: string;
let projectRoot: string;
let configDir: string;

beforeEach(async () => {
  vi.resetAllMocks();
  root = await fs.mkdtemp(path.join(os.tmpdir(), "mycelium-add-test-"));
  projectRoot = path.join(root, "project");
  configDir = path.join(projectRoot, ".mycelium");
  await fs.mkdir(configDir, { recursive: true });
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

function mockClone(populate: (destination: string) => Promise<void>): void {
  vi.mocked(execFile).mockImplementation(((
    _command: string, args: string[], _options: unknown,
    callback: (error: Error | null, stdout: string, stderr: string) => void,
  ) => {
    populate(args.at(-1)!).then(
      () => callback(null, "", ""),
      (error: Error) => callback(error, "", ""),
    );
    return {};
  }) as typeof execFile);
}

describe("skill source security", () => {
  it.each([
    "owner;echo injected/repo", "owner/repo;echo injected", "owner/repo$(echo injected)",
    "https://github.com/owner/repo?query", "owner/..", "owner/repo/../../escape",
    "owner/repo/skills/../escape", "owner/repo/skills\\escape", "owner/repo//escape",
  ])("rejects unsafe GitHub source %s before spawning", async (source) => {
    expect(() => parseSkillSource(source)).toThrow();
    expect((await addSkill(source, { projectRoot })).success).toBe(false);
    expect(execFile).not.toHaveBeenCalled();
  });

  it("uses Git argv and a timeout, including paths with spaces", async () => {
    const spacedProject = path.join(root, "project with spaces");
    mockClone(async (destination) => { await fs.mkdir(destination, { recursive: true }); });
    expect((await addSkill("valid-owner/repo.name", { projectRoot: spacedProject })).success).toBe(true);
    expect(execFile).toHaveBeenCalledWith("git", [
      "clone", "--depth", "1", "--", "https://github.com/valid-owner/repo.name.git",
      path.join(spacedProject, ".mycelium/global/skills/repo.name"),
    ], { timeout: 30000 }, expect.any(Function));
  });

  it("copies a contained repository subdirectory and removes staging", async () => {
    mockClone(async (destination) => {
      await fs.mkdir(path.join(destination, "skills/good"), { recursive: true });
      await fs.writeFile(path.join(destination, "skills/good/content.txt"), "content");
    });
    const result = await addSkill("owner/repo/skills/good", { projectRoot });
    expect(result.success).toBe(true);
    expect(await fs.readFile(path.join(result.path!, "content.txt"), "utf8")).toBe("content");
    expect(await fs.readdir(path.join(configDir, "global/skills"))).toEqual(["good"]);
  });

  it.each([false, true])("rejects cloned escaping symlinks (nested=%s) and cleans staging", async (nested) => {
    const outside = path.join(root, "outside");
    await fs.mkdir(outside);
    await fs.writeFile(path.join(outside, "content.txt"), "outside");
    mockClone(async (destination) => {
      await fs.mkdir(path.join(destination, "skills"), { recursive: true });
      if (nested) {
        await fs.mkdir(path.join(destination, "skills/bad"));
        await fs.symlink(outside, path.join(destination, "skills/bad/link"));
      } else {
        await fs.symlink(outside, path.join(destination, "skills/bad"));
      }
    });
    expect((await addSkill("owner/repo/skills/bad", { projectRoot })).success).toBe(false);
    expect((await fs.readdir(path.join(configDir, "global/skills"))).some((name) => name.startsWith(".temp-"))).toBe(false);
    expect(await fs.readFile(path.join(outside, "content.txt"), "utf8")).toBe("outside");
  });

  it("rejects existing destination symlinks before force replacement", async () => {
    const skillsDir = path.join(configDir, "global/skills");
    const outside = path.join(root, "outside");
    await fs.mkdir(skillsDir, { recursive: true });
    await fs.mkdir(outside);
    await fs.symlink(outside, path.join(skillsDir, "repo"));
    expect((await addSkill("owner/repo", { projectRoot, force: true })).success).toBe(false);
    expect(execFile).not.toHaveBeenCalled();
    expect((await fs.lstat(path.join(skillsDir, "repo"))).isSymbolicLink()).toBe(true);
  });

  it("does not copy local files through a destination symlink into a sibling skill", async () => {
    const source = path.join(root, "skill");
    const skillsDir = path.join(configDir, "global/skills");
    await fs.mkdir(path.join(source, "nested"), { recursive: true });
    await fs.writeFile(path.join(source, "nested/content.txt"), "replacement");
    await fs.mkdir(path.join(skillsDir, "sibling"), { recursive: true });
    await fs.mkdir(path.join(skillsDir, "skill"));
    await fs.writeFile(path.join(skillsDir, "sibling/content.txt"), "original");
    await fs.symlink(path.join(skillsDir, "sibling"), path.join(skillsDir, "skill/nested"));
    expect((await addSkill(source, { projectRoot, force: true })).success).toBe(false);
    expect(await fs.readFile(path.join(skillsDir, "sibling/content.txt"), "utf8")).toBe("original");
  });

  it("cleans staging when Git fails or times out", async () => {
    mockClone(async () => { throw new Error("Git timed out"); });
    const result = await addSkill("owner/repo/skills/good", { projectRoot });
    expect(result.error).toContain("Git timed out");
    expect(await fs.readdir(path.join(configDir, "global/skills"))).toEqual([]);
  });

  it.each(["./", "../", "/"])("rejects unsafe local destination component %s", async (source) => {
    expect((await addSkill(source, { projectRoot })).success).toBe(false);
    expect(execFile).not.toHaveBeenCalled();
  });
});

describe("MCP YAML roundtrip", () => {
  it("writes loader-compatible flat entries and preserves existing configuration", async () => {
    const mcpsPath = path.join(configDir, "mcps.yaml");
    await fs.writeFile(mcpsPath, "existing:\n  command: node\n  args: [server.js]\n  custom: keep\n");
    expect((await addMcp("ai.auteng/mcp", { command: "npx", args: ["example"], projectRoot })).success).toBe(true);
    const loaded = await loadProjectConfig(projectRoot);
    expect(loaded.mcps).toEqual({
      existing: { command: "node", args: ["server.js"], custom: "keep" },
      "ai.auteng/mcp": { command: "npx", args: ["example"] },
    });
    const before = await fs.readFile(mcpsPath, "utf8");
    expect((await addMcp("existing", { command: "replace", projectRoot })).error).toContain("already exists");
    expect(await fs.readFile(mcpsPath, "utf8")).toBe(before);
    expect((await addMcp("existing", { command: "replace", projectRoot, force: true })).success).toBe(true);
    expect((await loadProjectConfig(projectRoot)).mcps?.existing.command).toBe("replace");
    expect((await loadProjectConfig(projectRoot)).mcps?.["ai.auteng/mcp"].command).toBe("npx");
  });

  it.each(["broken: [", "a: 1\na: 2\n", "- array", "scalar", "false"])("preserves malformed or non-mapping YAML %s", async (content) => {
    const mcpsPath = path.join(configDir, "mcps.yaml");
    await fs.writeFile(mcpsPath, content);
    expect((await addMcp("new", { command: "node", projectRoot, force: true })).success).toBe(false);
    expect(await fs.readFile(mcpsPath, "utf8")).toBe(content);
  });

  it("checks duplicate presence even when an entry is null", async () => {
    await fs.writeFile(path.join(configDir, "mcps.yaml"), "existing: null\n");
    expect((await addMcp("existing", { command: "node", projectRoot })).error).toContain("already exists");
  });

  it("writes prototype-like names as ordinary mapping keys", async () => {
    expect((await addMcp("constructor", { command: "node", projectRoot })).success).toBe(true);
    const parsed = yamlParse(await fs.readFile(path.join(configDir, "mcps.yaml"), "utf8"));
    expect(Object.hasOwn(parsed, "constructor")).toBe(true);
    expect(parsed.constructor.command).toBe("node");
  });

  it("does not overwrite an MCP config symlink outside its root", async () => {
    const outside = path.join(root, "outside.yaml");
    await fs.writeFile(outside, "existing: {command: node}\n");
    await fs.symlink(outside, path.join(configDir, "mcps.yaml"));
    expect((await addMcp("new", { command: "node", projectRoot })).success).toBe(false);
    expect(await fs.readFile(outside, "utf8")).toBe("existing: {command: node}\n");
  });
});
