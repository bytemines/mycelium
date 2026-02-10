# Plugin Takeover

Plugin takeover lets Mycelium manage individual skills from Claude Code plugins. When you disable a single skill that belongs to a plugin, Mycelium takes over the entire plugin: it disables the plugin in Claude Code and symlinks the remaining enabled skills into Mycelium's skill directory. This gives you per-skill granularity that Claude Code does not natively support.

## Why This Exists

Claude Code loads all skills from installed plugins with no way to disable individual ones. The plugin enable/disable toggle in settings is also unreliable (see [community demand](./plugin-takeover-demand.md) for details on the 231+ upvotes across 4 GitHub issues). Mycelium bridges this gap.

## How It Works

### Takeover (disable a skill)

When you run `mycelium disable <skill-name>` and the skill belongs to a Claude Code plugin:

1. Mycelium scans `~/.claude/plugins/cache/` to find which plugin owns the skill
2. Sets `enabledPlugins.<pluginId>` to `false` in `~/.claude/settings.json` (disabling the plugin in Claude Code)
3. Symlinks all **enabled** skills from the plugin's cache directory into `~/.mycelium/skills/`
4. Records the takeover in `manifest.yaml` under `takenOverPlugins` with version, cache path, and skill list
5. Tags each skill in the manifest with `pluginOrigin` (pluginId + cachePath)
6. The disabled skill is **not** symlinked

On next `mycelium sync`, the symlinked skills are distributed to all tools as normal. The disabled skill is excluded.

### Release (re-enable all skills)

When you run `mycelium enable <skill-name>` on a previously disabled plugin skill:

1. The skill's state is set back to `enabled` in the manifest
2. Mycelium checks if **all** skills from that plugin are now enabled
3. If yes: the plugin is released back to Claude Code
   - `enabledPlugins.<pluginId>` is set to `true` in `~/.claude/settings.json`
   - All symlinks for that plugin's skills are removed from `~/.mycelium/skills/`
   - `takenOverPlugins` and `pluginOrigin` entries are cleaned up from the manifest
4. If some skills are still disabled: the plugin stays taken over, and the newly enabled skill is added to the symlinked set

## CLI Usage

```bash
# Disable a single skill from a plugin
mycelium disable commit-push-pr
# Output:
#   skill 'commit-push-pr' disabled
#   Plugin takeover: plugin disabled in Claude Code, skills now managed by Mycelium

# Re-enable it
mycelium enable commit-push-pr
# If all plugin skills are now enabled:
#   skill 'commit-push-pr' enabled
#   Plugin released: all skills re-enabled, plugin restored in Claude Code

# Check status — shows taken-over plugins
mycelium status
# Plugin Takeover:
#   commit-commands@skillsmp: 4 skills managed

# Disable for a specific tool only (no plugin takeover — just excludeTools)
mycelium disable commit-push-pr --tool claude-code
```

## Sync Integration

During `mycelium sync`:

- Skills from taken-over plugins are injected into the merged config (from `takenOverPlugins` in the manifest)
- Disabled skills are filtered out before sync
- The plugin's native loading in Claude Code is inactive (disabled in `settings.json`), so there is no duplication

## Status Integration

`mycelium status` shows a "Plugin Takeover" section listing each taken-over plugin and how many skills it manages.

## Architecture (Hybrid Merge, Score 9.1/10)

Plugin state comes from two sources, merged at query time:

1. **Discovery** — `scanPluginCache()` scans `~/.claude/plugins/cache/` live to find what components EXIST (skills, agents, commands, hooks, libs)
2. **State** — `manifest.yaml` stores enabled/disabled state per item

The old `migration-manifest.json` / `buildPluginMap()` approach is demoted to audit trail only. The dashboard API (`/api/plugins`) now returns fresh data every time.

Key file: `packages/cli/src/core/plugin-state.ts` — `getLivePluginState()` merges both sources.

## All Component Types

Plugin takeover tracks **all** component types from a plugin, not just skills:

- Skills → `~/.claude/skills/{name}` (symlink)
- Agents → `~/.claude/agents/{name}.md` (symlink)
- Commands → `~/.claude/commands/{name}.md` (symlink)
- Hooks and libs → tracked in manifest but not symlinked

The `takenOverPlugins` entry in manifest.yaml includes both `allSkills` (for backwards compat) and `allComponents` (full list of all types).

When disabling a component, its symlink is removed from the correct directory based on type. When re-enabling, the symlink is restored.

## Dashboard Integration

The dashboard provides per-item toggle controls for plugin components:

- **Plugin node toggle** — routes through `onPluginToggle` (not the generic `onToggle`)
- **Per-item toggle** — uses the `/api/plugins/:plugin/items/:item/toggle` endpoint
- **Auto-refresh** — store calls `fetchState()` after every toggle to reflect changes
- **disabledItems** — parsed from the API response and displayed in PluginDetailPanel

## Doctor Health Checks

`mycelium doctor` runs 8 plugin-takeover invariant checks:

1. Every symlink in `~/.claude/{skills,agents,commands}/` has a valid target
2. Every disabled item with `pluginOrigin` has NO symlink
3. Every enabled item with `pluginOrigin` HAS a symlink to the plugin cache
4. Taken-over plugins have `enabledPlugins[id] === false` in settings.json
5. Released plugins have `enabledPlugins[id] === true`
6. Live cache components match `takenOverPlugins` entries
7. No phantom entries (plugin name registered as a skill)
8. No orphaned symlinks

## Edge Cases and Limitations

- **Plugin updates**: If Claude Code updates a plugin, the cache path changes. `mycelium doctor` detects stale plugin symlinks.
- **Tool-scoped disable**: `mycelium disable <skill> --tool claude-code` does **not** trigger plugin takeover. It only adds the tool to `excludeTools`. Plugin takeover only activates on a global disable (no `--tool` flag).
- **Plugin ID format**: Plugin IDs follow the `<name>@<marketplace>` convention (e.g., `commit-commands@skillsmp`). This is derived from the directory structure in `~/.claude/plugins/cache/<marketplace>/<name>/`.
- **Multiple plugins**: Each plugin is tracked independently. You can have multiple plugins taken over simultaneously.
- **Non-plugin skills**: Disabling a skill that does not belong to any plugin simply sets its state to `disabled` in the manifest. No takeover occurs.
- **Type detection**: `ensureItem()` accepts a `typeHint` parameter so agents/commands from plugins are registered in the correct manifest section (not defaulting to "skill").

## Not In Scope

- **MCP tool filtering**: Per-tool disable within MCP servers (issue #7328) is a separate feature. Plugin takeover only handles skills.
- **Other tools**: Plugin takeover is Claude Code-specific. Other tools do not have a plugin cache system that requires this workaround.
- **Automatic plugin update tracking**: Mycelium does not watch for plugin updates or automatically re-symlink when cache paths change.
