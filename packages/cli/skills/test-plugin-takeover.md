---
name: test-plugin-takeover
description: Integration test battery for Mycelium plugin takeover. Run after making changes to enable/disable, sync, plugin-takeover, or manifest-state code. Tests all component types across real plugins. Validates manifest section correctness, symlink state, settings.json, and type consistency.
---

# Plugin Takeover Integration Tests

End-to-end validation of the plugin takeover system using real CLI commands and real state files. Run this after any changes to enable/disable/sync/plugin-takeover/manifest-state.

## Lessons Learned (Do Not Skip These Checks)

These bugs were found in production and are now encoded as mandatory verifications:

1. **Type mismatch bug**: `ensureItem()` defaulted agents/commands to "skill" type, creating duplicates in the wrong manifest section. The dashboard read from `agents:` section (still enabled) while the disable wrote to `skills:` section. **Always verify the manifest section, not just the state value.**
2. **pluginOrigin cleanup on release**: `enable.ts` only cleaned `pluginOrigin` from skills, not from agents/commands/hooks. **Always verify ALL sections are clean after release.**
3. **Dashboard vs manifest mismatch**: The sidebar reads from typed sections (agents, commands). If an item is in the wrong section, the UI shows stale state. **Always verify the dashboard API response matches the manifest.**
4. **Duplicate entries**: An item can end up in both `skills:` and `agents:` sections if auto-registered before the type is known. **Always grep for the item name across ALL sections.**
5. **Skills-only takeover**: `takeoverPlugin()` originally only symlinked skills — agents/commands were never symlinked during takeover, so disabling a command had no visible effect. **Always verify symlinks for ALL component types (skills, agents, commands), not just skills.**
6. **Skills-only release check**: `enable.ts` release logic only checked `allSkills` to decide if all items were re-enabled. Commands/agents were ignored, so the plugin was released even with disabled commands. **Release must check ALL components across ALL manifest sections.**
7. **Skills-only disabled list**: `disable.ts` only collected disabled items from `manifest.skills`, missing agents/commands. The takeover then re-symlinked disabled commands. **Disabled items must be collected from ALL sections using `findItemType()`.**
8. **Stale symlinks survive code fixes**: Even after fixing the code, old symlinks from buggy runs persist. **Always clean stale symlinks before re-testing. Use `mycelium doctor` to detect orphans.**

## Target Plugin

**superpowers** from `superpowers-marketplace`:

| Type | Items |
|------|-------|
| Skills (14) | brainstorming, dispatching-parallel-agents, executing-plans, finishing-a-development-branch, receiving-code-review, requesting-code-review, subagent-driven-development, systematic-debugging, test-driven-development, using-git-worktrees, using-superpowers, verification-before-completion, writing-plans, writing-skills |
| Agents (1) | code-reviewer |
| Commands (3) | brainstorm, execute-plan, write-plan |

- Cache: `~/.claude/plugins/cache/superpowers-marketplace/superpowers/<version>/`
- Plugin ID: `superpowers@superpowers-marketplace`
- **Claude Code only**: Plugin takeover only applies to Claude Code (only tool with plugin cache). After takeover, `mycelium sync` distributes managed skills to all tools.

If not installed: install "superpowers" plugin in Claude Code settings first.

## Key Files to Check

- `~/.claude/settings.json` → `enabledPlugins["superpowers@superpowers-marketplace"]`
- `~/.mycelium/manifest.yaml` → `skills:`, `agents:`, `commands:`, `takenOverPlugins:`
- `~/.claude/skills/` → symlinks for skills
- `~/.claude/agents/` → symlinks for agents (.md files)
- `~/.claude/commands/` → symlinks for commands (.md files)

## Pre-Test: Clean State

```bash
mycelium status
mycelium doctor

# Verify plugin is enabled natively
python3 -c "import json; d=json.load(open('$HOME/.claude/settings.json')); print('plugin enabled:', d.get('enabledPlugins',{}).get('superpowers@superpowers-marketplace', 'NOT SET'))"

# Verify no leftover takeover state
grep -c "takenOverPlugins" ~/.mycelium/manifest.yaml || echo "no takenOverPlugins"
grep -c "pluginOrigin" ~/.mycelium/manifest.yaml || echo "no pluginOrigin"

# CRITICAL: Verify no duplicate entries across sections (lesson #4)
for item in code-reviewer execute-plan write-plan brainstorm; do
  echo "--- $item appears in sections:"
  grep -n "^  $item:" ~/.mycelium/manifest.yaml
done
```

If leftover state exists, re-enable all disabled items with `--global` to trigger release, then re-run pre-test.

## Test 1: Disable Single Skill → Takeover

```bash
mycelium disable brainstorming --global
```

**Verify:**

```bash
# 1. settings.json: plugin disabled
python3 -c "import json; d=json.load(open('$HOME/.claude/settings.json')); v=d.get('enabledPlugins',{}).get('superpowers@superpowers-marketplace','MISSING'); assert v==False, f'Expected false, got {v}'; print('PASS: plugin disabled')"

# 2. manifest: takenOverPlugins entry exists
grep -A6 "superpowers@superpowers-marketplace" ~/.mycelium/manifest.yaml | head -7

# 3. manifest: brainstorming disabled IN SKILLS SECTION (not agents/commands)
python3 -c "
import yaml
m = yaml.safe_load(open('$HOME/.mycelium/manifest.yaml'))
s = m.get('skills',{}).get('brainstorming',{})
assert s.get('state') == 'disabled', f'Expected disabled, got {s.get(\"state\")}'
assert 'pluginOrigin' in s, 'Missing pluginOrigin'
# CRITICAL: verify NOT in wrong section (lesson #1)
for section in ['agents','commands','hooks']:
  assert 'brainstorming' not in m.get(section,{}), f'DUPLICATE: brainstorming found in {section} section!'
print('PASS: brainstorming disabled in correct section, no duplicates')
"

# 4. symlink absent for disabled skill
test ! -e ~/.claude/skills/brainstorming && echo "PASS: no symlink" || echo "FAIL: symlink exists"

# 5. symlink present for enabled skill
test -L ~/.claude/skills/writing-plans && echo "PASS: writing-plans symlinked" || echo "FAIL: missing symlink"

# 6. count: 13 skill symlinks (14 - 1 disabled)
count=$(ls ~/.claude/skills/ 2>/dev/null | wc -l | tr -d ' ')
echo "Skill symlinks: $count (expected 13)"
```

## Test 2: Disable Multiple Skills

```bash
mycelium disable writing-plans --global
mycelium disable writing-skills --global
```

**Verify:**

```bash
# 3 skills disabled, 11 symlinks
for s in brainstorming writing-plans writing-skills; do
  test ! -e ~/.claude/skills/$s && echo "PASS: $s absent" || echo "FAIL: $s exists"
done
count=$(ls ~/.claude/skills/ 2>/dev/null | wc -l | tr -d ' ')
echo "Skill symlinks: $count (expected 11)"

# All 3 in skills section with pluginOrigin
python3 -c "
import yaml
m = yaml.safe_load(open('$HOME/.mycelium/manifest.yaml'))
for name in ['brainstorming','writing-plans','writing-skills']:
  s = m.get('skills',{}).get(name,{})
  assert s.get('state') == 'disabled', f'{name}: expected disabled, got {s.get(\"state\")}'
  assert 'pluginOrigin' in s, f'{name}: missing pluginOrigin'
print('PASS: all 3 skills disabled with pluginOrigin')
"
```

## Test 3: Disable Agent and Command (CRITICAL — caught type mismatch bug)

```bash
mycelium disable code-reviewer --global
mycelium disable execute-plan --global
```

**Verify:**

```bash
# CRITICAL: verify items are in CORRECT manifest section (lesson #1)
python3 -c "
import yaml
m = yaml.safe_load(open('$HOME/.mycelium/manifest.yaml'))

# code-reviewer MUST be in agents, NOT in skills
agent = m.get('agents',{}).get('code-reviewer',{})
assert agent.get('state') == 'disabled', f'agents.code-reviewer: expected disabled, got {agent.get(\"state\")}'
assert 'code-reviewer' not in m.get('skills',{}), 'DUPLICATE BUG: code-reviewer found in skills section!'

# execute-plan MUST be in commands, NOT in skills
cmd = m.get('commands',{}).get('execute-plan',{})
assert cmd.get('state') == 'disabled', f'commands.execute-plan: expected disabled, got {cmd.get(\"state\")}'
assert 'execute-plan' not in m.get('skills',{}), 'DUPLICATE BUG: execute-plan found in skills section!'

print('PASS: agent in agents section, command in commands section, no duplicates')
"

# Symlinks absent for disabled items
test ! -e ~/.claude/agents/code-reviewer.md && echo "PASS: agent symlink absent" || echo "FAIL: agent symlink exists"
test ! -e ~/.claude/commands/execute-plan.md && echo "PASS: command symlink absent" || echo "FAIL: command symlink exists"

# Other commands still symlinked
test -L ~/.claude/commands/brainstorm.md && echo "PASS: brainstorm.md symlinked" || echo "FAIL: brainstorm.md missing"
test -L ~/.claude/commands/write-plan.md && echo "PASS: write-plan.md symlinked" || echo "FAIL: write-plan.md missing"
```

## Test 4: Tool-Scoped Disable (No Takeover)

```bash
mycelium disable systematic-debugging --tool cursor --global
```

**Verify:**

```bash
# excludeTools set, symlink still exists
python3 -c "
import yaml
m = yaml.safe_load(open('$HOME/.mycelium/manifest.yaml'))
s = m.get('skills',{}).get('systematic-debugging',{})
assert 'cursor' in s.get('excludeTools',[]), f'Expected cursor in excludeTools, got {s.get(\"excludeTools\")}'
assert s.get('state','enabled') != 'disabled', 'Should NOT be globally disabled'
print('PASS: tool-scoped disable, not global')
"
test -L ~/.claude/skills/systematic-debugging && echo "PASS: symlink still exists" || echo "FAIL: symlink removed"
```

## Test 5: Partial Re-Enable

```bash
mycelium enable brainstorming --global
mycelium enable writing-plans --global
```

**Verify:**

```bash
# Plugin still taken over (3 items still disabled: writing-skills, code-reviewer, execute-plan)
python3 -c "
import json, yaml
# settings.json: still disabled
d = json.load(open('$HOME/.claude/settings.json'))
v = d.get('enabledPlugins',{}).get('superpowers@superpowers-marketplace')
assert v == False, f'Plugin should still be disabled, got {v}'

# manifest: takenOverPlugins still exists
m = yaml.safe_load(open('$HOME/.mycelium/manifest.yaml'))
assert 'superpowers@superpowers-marketplace' in m.get('takenOverPlugins',{}), 'Plugin should still be taken over'

# Re-enabled skills now enabled
for name in ['brainstorming','writing-plans']:
  s = m.get('skills',{}).get(name,{})
  assert s.get('state','enabled') in ['enabled',None], f'{name} should be enabled, got {s.get(\"state\")}'
print('PASS: partial re-enable, plugin still taken over')
"

# Symlinks restored for re-enabled skills
test -L ~/.claude/skills/brainstorming && echo "PASS: brainstorming symlinked" || echo "FAIL"
test -L ~/.claude/skills/writing-plans && echo "PASS: writing-plans symlinked" || echo "FAIL"
```

## Test 6: Full Re-Enable → Release

```bash
mycelium enable writing-skills --global
mycelium enable code-reviewer --global
mycelium enable execute-plan --global
```

**Verify:**

```bash
python3 -c "
import json, yaml

# 1. settings.json: plugin re-enabled
d = json.load(open('$HOME/.claude/settings.json'))
v = d.get('enabledPlugins',{}).get('superpowers@superpowers-marketplace')
assert v == True, f'Plugin should be re-enabled, got {v}'

# 2. manifest: no takenOverPlugins
m = yaml.safe_load(open('$HOME/.mycelium/manifest.yaml'))
tp = m.get('takenOverPlugins',{})
assert 'superpowers@superpowers-marketplace' not in tp, f'Plugin should be released, still in takenOverPlugins'

# 3. CRITICAL: no pluginOrigin in ANY section (lesson #2)
for section_name in ['skills','agents','commands','hooks']:
  section = m.get(section_name,{})
  if not isinstance(section, dict): continue
  for item_name, item_config in section.items():
    if isinstance(item_config, dict) and 'pluginOrigin' in item_config:
      po = item_config['pluginOrigin']
      if 'superpowers' in po.get('pluginId',''):
        raise AssertionError(f'STALE pluginOrigin in {section_name}.{item_name}!')

# 4. No duplicate entries (lesson #4)
for item in ['code-reviewer','execute-plan','write-plan','brainstorm']:
  found_in = []
  for section_name in ['skills','agents','commands','hooks']:
    section = m.get(section_name,{})
    if isinstance(section, dict) and item in section:
      found_in.append(section_name)
  assert len(found_in) <= 1, f'DUPLICATE: {item} found in {found_in}'

print('PASS: plugin released, no pluginOrigin, no duplicates')
"
```

## Test 7: Doctor Health Check

```bash
mycelium doctor
```

**Verify:**
1. No `fail` results related to plugin-takeover
2. No orphaned symlinks
3. No phantom entries (skill name matching `name@marketplace` pattern)
4. No stale pluginOrigin entries
5. All 8 invariant checks pass

## Test 8: Sync + Status Clean

```bash
mycelium sync
mycelium status
```

**Verify:**
1. Sync completes without errors
2. Status shows no "Plugin Takeover" section
3. No duplicate skills from both plugin + Mycelium

## Test 9: Dashboard API Consistency (lesson #3)

If the dashboard server is running (`mycelium serve`):

```bash
# Check that the API returns correct disabled state
curl -s http://localhost:3378/api/plugins | python3 -c "
import sys, json
plugins = json.load(sys.stdin)
sp = next((p for p in plugins if 'superpowers' in p.get('name','')), None)
if sp:
  print(f'Plugin: {sp[\"name\"]}, enabled: {sp[\"enabled\"]}')
  print(f'Disabled items: {sp.get(\"disabledItems\",[])}')
  assert sp['enabled'] == True, 'Plugin should be enabled after full release'
  assert len(sp.get('disabledItems',[])) == 0, 'No items should be disabled'
  print('PASS: dashboard API consistent')
else:
  print('SKIP: superpowers plugin not found in API response')
"
```

## Summary Checklist

| # | Test | What It Catches | Pass? |
|---|------|----------------|-------|
| 1 | Single skill disable → takeover | Basic takeover flow, settings.json, symlinks |  |
| 2 | Multiple skills disabled | Incremental disable, correct count |  |
| 3 | Agent + command disabled | **Type mismatch bug** — items in correct manifest section |  |
| 4 | Tool-scoped disable | excludeTools vs global disable distinction |  |
| 5 | Partial re-enable | Plugin stays taken over, symlinks restored |  |
| 6 | Full re-enable → release | **pluginOrigin cleanup**, no duplicates, settings restored |  |
| 7 | Doctor health check | 8 invariant checks, orphans, phantoms |  |
| 8 | Sync + status | End-to-end clean state |  |
| 9 | Dashboard API | **UI vs manifest consistency** |  |

All 9 tests must pass. If any fail, use the `debug-mycelium` skill to investigate with `mycelium report --scope plugin --since 1h`.

## Architecture Reference

- Plugin takeover is **Claude Code only** — only tool with `~/.claude/plugins/cache/`
- After takeover, `mycelium sync` distributes managed skills to all 9 tools
- State sources: Discovery (`scanPluginCache`) + State (`manifest.yaml`) merged by `getLivePluginState()`
- Key code: `plugin-takeover.ts`, `plugin-state.ts`, `plugin-scanner.ts`, `manifest-state.ts`, `enable.ts`, `disable.ts`
- `ensureItem(manifest, name, state, typeHint)` — the `typeHint` parameter prevents type mismatch; detected from plugin cache scan
- Health checks: `plugin-takeover-check.ts` — 8 invariants
