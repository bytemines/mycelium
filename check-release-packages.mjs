import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Run against archives made with pnpm pack, never npm publish.
const [coreArchive, cliArchive] = process.argv.slice(2);
assert.ok(coreArchive && cliArchive, "Usage: node check-release-packages.mjs <core.tgz> <cli.tgz>");
const core = JSON.parse(readFileSync(new URL("./packages/core/package.json", import.meta.url), "utf8"));

for (const [name, archive] of [["core", coreArchive], ["cli", cliArchive]]) {
  const files = execFileSync("tar", ["-tzf", archive], { encoding: "utf8" }).trim().split("\n");
  const source = JSON.parse(readFileSync(new URL(`./packages/${name}/package.json`, import.meta.url), "utf8"));
  const packed = JSON.parse(execFileSync("tar", ["-xOf", archive, "package/package.json"], { encoding: "utf8" }));
  assert.equal(packed.name, source.name);
  assert.equal(packed.version, source.version);
  assert.ok(files.includes("package/README.md"), `${name}: README missing`);
  assert.equal(packed.license, "MIT", `${name}: project license missing`);
  assert.ok(files.includes("package/dist/LICENSE"), `${name}: project license text missing`);
  assert.ok(files.includes("package/dist/index.js"), `${name}: entrypoint missing`);
  assert.ok(files.includes("package/dist/index.d.ts"), `${name}: declarations missing`);
  assert.deepEqual(files.filter(file => /\.map$|\.(test|spec)\.|\/(?:__tests__|__fixtures__)\//.test(file)), [], `${name}: private build artifacts included`);
  const expectedDependencies = { ...source.dependencies };
  if (name === "cli") expectedDependencies["@mycelish/core"] = core.version;
  assert.deepEqual(packed.dependencies, expectedDependencies, `${name}: packed runtime dependencies differ`);
  for (const section of ["dependencies", "optionalDependencies", "peerDependencies", "devDependencies"]) {
    assert.ok(!Object.values(packed[section] ?? {}).some(value => value.startsWith("workspace:")), `${name}: workspace protocol remains`);
  }
  if (name === "cli") {
    assert.deepEqual(packed.bin, source.bin);
    for (const bin of Object.values(packed.bin)) assert.ok(files.includes(`package/${bin.replace(/^\.\//, "")}`), `Missing bin: ${bin}`);
    assert.ok(execFileSync("tar", ["-xOf", archive, "package/dist/index.js"], { encoding: "utf8" }).startsWith("#!/usr/bin/env node"));
    assert.ok(files.includes("package/dist/dashboard/index.html"), "Bundled dashboard missing");
    assert.ok(!files.some(file => file.startsWith("package/dist/dashboard/dist/")), "Dashboard nested by repeated copy");
  }
  console.log(`${packed.name}@${packed.version}: release archive checks passed`);
}
