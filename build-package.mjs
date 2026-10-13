import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("./", import.meta.url));
const artifactIgnores = "*.map\n*.test.*\n*.spec.*\n__tests__/\n__fixtures__/\n";

function copyDashboard(source, destination) {
  // Validate before replacing the previous generated dashboard.
  readFileSync(join(source, "index.html"));
  rmSync(destination, { recursive: true, force: true });
  cpSync(source, destination, { recursive: true });
}

if (process.argv[2] === "--self-test") {
  const temporary = mkdtempSync(join(tmpdir(), "mycelium-build-"));
  try {
    const source = join(temporary, "source");
    const destination = join(temporary, "dashboard");
    mkdirSync(source);
    writeFileSync(join(source, "index.html"), "first");
    copyDashboard(source, destination);
    writeFileSync(join(destination, "stale.js"), "stale");
    writeFileSync(join(source, "index.html"), "second");
    copyDashboard(source, destination);
    assert.equal(readFileSync(join(destination, "index.html"), "utf8"), "second");
    assert.equal(existsSync(join(destination, "stale.js")), false);
    assert.equal(existsSync(join(destination, "source")), false);
    assert.throws(() => copyDashboard(join(temporary, "missing"), destination));
    assert.equal(readFileSync(join(destination, "index.html"), "utf8"), "second");
    console.log("Build helper self-check passed");
  } finally {
    // Only remove the isolated directory created by this self-check.
    rmSync(temporary, { recursive: true, force: true });
  }
} else {
  const name = process.argv[2];
  assert.ok(name === "core" || name === "cli", "Usage: node build-package.mjs <core|cli|--self-test>");
  const directory = join(root, "packages", name);
  const require = createRequire(join(directory, "package.json"));
  const result = spawnSync(process.execPath, [require.resolve("typescript/bin/tsc"), "-p", "tsconfig.build.json"], {
    cwd: directory,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
  const dist = join(directory, "dist");
  writeFileSync(join(dist, ".npmignore"), artifactIgnores);
  cpSync(join(root, "LICENSE"), join(dist, "LICENSE"));
  if (name === "cli") copyDashboard(join(root, "packages/dashboard/dist"), join(dist, "dashboard"));
}
