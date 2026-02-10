# Disable/Enable Workflow

## The Bug

Running `mycelium disable massive` would update the manifest (`manifest.yaml`) to mark the item as disabled, but the MCP entry remained in tool configs (e.g. `~/.claude.json`). Users would see the item listed as disabled in `mycelium status`, yet the MCP server would still be active in their tools.

Two root causes:

1. **Type misdetection** -- When an item wasn't already registered in the manifest, `ensureItem()` defaulted to type `"skill"`. MCPs defined only in `mcps.yaml` were never detected as type `"mcp"`, so the MCP-specific removal logic was skipped entirely.

2. **No tool config removal** -- Even if the type had been correct, the disable command only updated the manifest. There was no step to call `adapter.remove()` to delete the MCP entry from each tool's native config file.

## The Fix

Both `disable.ts` and `enable.ts` now include:

- **MCP type detection from `mcps.yaml`** -- Before calling `ensureItem()`, the command loads the global config and checks if the item name exists in `globalConfig.mcps`. If it does, `typeHint` is set to `"mcp"`, ensuring correct type classification.

- **Immediate tool config update** -- After updating the manifest, disable calls `adapter.remove(name)` and enable calls `adapter.add(name, mcpConfig)` on the relevant tool adapters.

Source files:
- `packages/cli/src/commands/disable.ts` (lines 91-95: MCP detection, lines 129-135: adapter.remove)
- `packages/cli/src/commands/enable.ts` (lines 79-85: MCP detection, lines 129-144: adapter.add)

## Current Flow

### Disable (`mycelium disable <name>`)

1. **Validate** -- Check tool ID if `--tool` is provided.
2. **Load manifest** -- Read `manifest.yaml` from the resolved directory.
3. **Detect type** -- Check plugin cache components, then `mcps.yaml` for MCP type. Pass `typeHint` to `ensureItem()`.
4. **Update manifest** -- Set `state: "disabled"` (global) or add to `excludeTools` (per-tool). Save manifest.
5. **Remove from tool configs** -- If type is `"mcp"`, call `adapter.remove(name)` on all applicable tool adapters.
6. **Plugin takeover check** -- If the item belongs to a Claude Code plugin, trigger takeover (see below).

### Enable (`mycelium enable <name>`)

1. **Validate** -- Check tool ID if `--tool` is provided.
2. **Load manifest** -- Read `manifest.yaml` from the resolved directory.
3. **Detect type** -- Check `mcps.yaml` for MCP type, then plugin cache. Pass `typeHint` to `ensureItem()`.
4. **Update manifest** -- Set `state: "enabled"` (global) or add to `enabledTools`/`tools` (per-tool). Save manifest.
5. **Add back to tool configs** -- If type is `"mcp"`, load the MCP config from `mcps.yaml` and call `adapter.add(name, mcpConfig)` on all applicable tool adapters (respecting `excludeTools` and `tools` filters).
6. **Plugin release check** -- If the item belongs to a taken-over plugin and all components are now enabled, release the plugin (see below).

## Plugin Takeover Integration

The plugin takeover system handles Claude Code plugins that contain multiple components (skills, agents, commands). Claude Code has no native way to disable individual components within a plugin.

### On Disable

When disabling a component that belongs to a Claude Code plugin:

1. The plugin is disabled natively in Claude Code's `settings.json` via `setPluginEnabled(pluginId, false)`.
2. The plugin is registered in `manifest.takenOverPlugins` with its version, cache path, and full component list.
3. All plugin components are registered in the manifest with `pluginOrigin` metadata.
4. `syncPluginSymlinks()` creates symlinks for all **enabled** components from the plugin cache, effectively replacing the native plugin with Mycelium-managed individual items.

### On Enable

When enabling a component that belongs to a taken-over plugin:

1. The command checks if **all** components of the plugin are now enabled (across all manifest sections: skills, agents, commands, hooks).
2. If all enabled: the plugin is re-enabled natively via `setPluginEnabled(pluginId, true)`, `takenOverPlugins` entry and `pluginOrigin` metadata are cleaned up, and `syncPluginSymlinks()` removes orphan symlinks.
3. If partially enabled: `syncPluginSymlinks()` updates symlinks to reflect the new state (the newly enabled component gets a symlink added).

Source files:
- `packages/cli/src/core/plugin-takeover.ts` -- `setPluginEnabled`, `syncPluginSymlinks`
- `packages/cli/src/core/plugin-scanner.ts` -- `scanPluginComponents`
- `packages/cli/src/core/manifest-state.ts` -- `findItemType`, `ensureItem`
