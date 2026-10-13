// Local dev-tool patches, not published runtime dependencies. No network or mocks.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

if (!process.argv.includes('--worker')) {
  const result = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--worker'], {
    encoding: 'utf8', timeout: 10_000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  process.stdout.write(result.stdout);
} else {
  // Resolve the actual Changesets dependency chains, not unrelated hoisted copies.
  const root = createRequire(import.meta.url);
  const child = (parent, name) => createRequire(parent.resolve(name));
  const cli = child(root, '@changesets/cli');
  const packages = child(cli, '@manypkg/get-packages');
  const globby = child(packages, 'globby');
  const fastGlob = child(globby, 'fast-glob');
  const micromatch = child(fastGlob, 'micromatch');
  const braces = micromatch('braces');
  const yamlFile = child(packages, 'read-yaml-file');
  const yaml = child(yamlFile, 'js-yaml');
  const argparse = child(yaml, 'argparse');
  const { sprintf, vsprintf } = argparse('sprintf-js');
  assert.equal(micromatch('braces/package.json').version, '3.0.3');
  assert.equal(argparse('sprintf-js/package.json').version, '1.0.3');

  for (const [pattern, expanded, compiled] of [
    ['a/{b,c}/d', ['a/b/d', 'a/c/d'], 'a/(b|c)/d'],
    ['{1..3}', ['1', '2', '3'], '([1-3])'],
    ['{a,{b,c}}', ['a', 'b', 'c'], '(a|(b|c))'],
    ['(a){b,c}', ['(a)b', '(a)c'], '(a)(b|c)'],
    ['\\{a,b}', ['{a,b}'], '{a,b}'],
    ['"{a,b}"', ['{a,b}'], '{a,b}'],
  ]) {
    assert.deepEqual(braces.expand(pattern), expanded);
    assert.equal(braces.compile(pattern), compiled);
    assert.equal(braces.stringify(braces.parse(pattern)), pattern.replace(/\\|"/g, ''));
    assert.deepEqual(braces(pattern, { expand: true }), expanded);
  }
  assert.deepEqual(braces.expand('{a,a,}', { nodupes: true, noempty: true }), ['a']);
  // Maximum permitted nesting remains usable; deeper input fails before recursion.
  for (const [open, close] of [['{', '}'], ['(', ')']]) {
    const allowed = open.repeat(127) + 'x' + close.repeat(127);
    for (const method of ['parse', 'stringify', 'compile', 'expand']) {
      braces[method](allowed);
      for (const count of [128, 129, 10_000]) {
        const deep = open.repeat(count) + 'x' + close.repeat(count);
        assert.throws(() => braces[method](deep), SyntaxError);
        assert.throws(() => braces[method](open.repeat(count)), SyntaxError);
      }
    }
  }
  let deepAst = { type: 'text', value: 'x' };
  for (let i = 0; i < 10_000; i++) deepAst = { type: 'root', nodes: [deepAst] };
  const cycle = { type: 'root', nodes: [] };
  cycle.nodes.push(cycle);
  const parentCycle = { type: 'root', nodes: [] };
  parentCycle.parent = parentCycle;
  for (const method of ['stringify', 'compile', 'expand']) {
    for (const ast of [deepAst, cycle, parentCycle]) {
      assert.throws(() => braces[method](ast), SyntaxError);
    }
    assert.doesNotThrow(() => braces[method](braces.parse('{a,b}')));
  }

  assert.equal(sprintf('%s %04d %.2f', 'ok', 7, 1.25), 'ok 0007 1.25');
  assert.equal(vsprintf('%(value).2f', [{ value: 1.25 }]), '1.25');
  assert.equal(sprintf('%.3s', 'abcdef'), 'abc');
  for (const [type, native, minimum] of [
    ['e', 'toExponential', 0], ['f', 'toFixed', 0], ['g', 'toPrecision', 1],
  ]) {
    for (let precision = minimum; precision <= 100; precision++) {
      assert.equal(sprintf(`%.${precision}${type}`, 1.25), (1.25)[native](precision));
    }
    for (const precision of ['101', '1000000000', '9'.repeat(10_000)]) {
      assert.equal(sprintf(`%.${precision}${type}`, 1.25), (1.25)[native](100));
    }
    // The public format API can receive an externally supplied parse tree.
    for (const [precision, expected] of [['Infinity', 100], ['-Infinity', minimum],
      ['not-a-number', minimum], ['-1', minimum]]) {
      const tree = sprintf.parse(`%.2${type}`);
      tree[0][7] = precision;
      assert.equal(sprintf.format(tree, ['', 1.25]), (1.25)[native](expected));
    }
  }
  assert.equal(sprintf('%.0g', 1.25), (1.25).toPrecision(1));
  // Exercise the real CLI in an isolated workspace without changing release state.
  const fixture = mkdtempSync(join(tmpdir(), 'mycelium-patch-check-'));
  try {
    // A fresh local fixture works in detached/shallow CI without borrowing user history.
    const hooks = join(fixture, 'empty-hooks');
    mkdirSync(hooks);
    const gitEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
    for (const args of [
      ['init', '--quiet', '--initial-branch=main', fixture],
      ['-C', fixture, '-c', 'user.name=Security check', '-c', 'user.email=security@example.invalid',
        '-c', 'commit.gpgsign=false', '-c', `core.hooksPath=${hooks}`, 'commit', '--quiet',
        '--allow-empty', '-m', 'Fixture baseline'],
    ]) {
      const git = spawnSync('git', args, { env: gitEnv, encoding: 'utf8', timeout: 5_000 });
      assert.ifError(git.error);
      assert.equal(git.status, 0, git.stderr);
    }
    mkdirSync(join(fixture, 'packages', 'sample'), { recursive: true });
    mkdirSync(join(fixture, '.changeset'));
    writeFileSync(join(fixture, 'package.json'), JSON.stringify({
      name: 'patch-fixture', private: true, workspaces: ['packages/*'],
    }));
    writeFileSync(join(fixture, 'packages', 'sample', 'package.json'), JSON.stringify({
      name: 'patch-fixture-sample', version: '1.0.0',
    }));
    writeFileSync(join(fixture, '.changeset', 'config.json'), JSON.stringify({
      changelog: false, commit: false, fixed: [], linked: [], access: 'restricted',
      baseBranch: 'main', updateInternalDependencies: 'patch', ignore: [],
    }));
    writeFileSync(join(fixture, '.changeset', 'fixture.md'),
      '---\n"patch-fixture-sample": patch\n---\n\nLocal security-patch smoke test.\n');
    const smoke = spawnSync(process.execPath, [root.resolve('@changesets/cli/bin.js'), 'status'], {
      cwd: fixture, env: gitEnv, encoding: 'utf8', timeout: 5_000,
    });
    assert.ifError(smoke.error);
    assert.equal(smoke.status, 0, smoke.stderr || smoke.stdout);
    assert.match(smoke.stdout, /patch-fixture-sample/);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
  console.log('Security patches: Changesets transitive fixtures and bounded regressions passed.');
}
