# Hybrid Tool Adapter — MCP Sync via CLI + File Fallback

**Date**: 2026-02-08
**Status**: Approved
**Goal**: Replace direct file editing with a CLI-first adapter pattern that prevents tools from overwriting Mycelium's MCP syncs.

---

## Problem

Mycelium's current `sync-writer.ts` directly edits tool config files (e.g., `~/.claude.json`). But tools like Claude Code **own their config files** and overwrite external edits on startup/exit. This causes synced MCPs to disappear.

## Solution

A **ToolAdapter** abstraction per tool with:
- **CLI-first**: Use each tool's native `<tool> mcp add` command when the CLI is available
- **File fallback**: Edit config files directly when CLI is not installed
- **Per-tool disable/enable**: Each adapter knows its tool's mechanism for toggling MCPs

---

## Architecture

```
mycelium sync
    │
    ▼
syncToTool(toolId, mcps)
    │
    ▼
┌──────────────────────────────────┐
│  getAdapter(toolId): ToolAdapter │
└──────────────────────────────────┘
    │
    ├── adapter.hasCli() → true
    │   ├── adapter.addViaCli(name, config)
    │   ├── adapter.removeViaCli(name)
    │   └── adapter.disableViaCli(name)  // if tool supports it
    │
    └── adapter.hasCli() → false
        ├── adapter.writeToFile(mcps)    // full replace
        ├── adapter.removeFromFile(name)
        └── adapter.disableInFile(name)  // if tool supports it
```

---

## Step-by-Step Implementation

### Step 1: Fix config paths in `packages/core/src/types.ts`

Update `SUPPORTED_TOOLS` with correct paths and formats from research:

```typescript
export const SUPPORTED_TOOLS: Record<ToolId, ToolConfig> = {
  "claude-code": {
    id: "claude-code",
    name: "Claude Code",
    skillsPath: "~/.claude/skills",
    mcpConfigPath: "~/.claude.json",          // CHANGED from ~/.claude/mcp.json
    mcpConfigFormat: "json",
    memoryPath: "~/.claude/CLAUDE.md",
    enabled: true,
  },
  codex: {
    id: "codex",
    name: "Codex CLI",
    skillsPath: "~/.codex/skills",
    mcpConfigPath: "~/.codex/config.toml",    // Correct
    mcpConfigFormat: "toml",
    memoryPath: "~/.codex/AGENTS.md",
    enabled: true,
  },
  "gemini-cli": {
    id: "gemini-cli",
    name: "Gemini CLI",
    skillsPath: "~/.gemini/extensions",
    mcpConfigPath: "~/.gemini/settings.json", // CHANGED from gemini-extension.json
    mcpConfigFormat: "json",
    memoryPath: "~/.gemini/GEMINI.md",
    enabled: true,
  },
  opencode: {
    id: "opencode",
    name: "OpenCode",
    skillsPath: "~/.config/opencode/plugin",
    mcpConfigPath: "~/.config/opencode/opencode.json", // CHANGED from config.yaml
    mcpConfigFormat: "json",                           // CHANGED from yaml
    memoryPath: "~/.opencode/context.md",
    enabled: true,
  },
  openclaw: {
    id: "openclaw",
    name: "OpenClaw",
    skillsPath: "~/.openclaw/skills",
    mcpConfigPath: "~/.openclaw/openclaw.json", // CHANGED from config.yaml
    mcpConfigFormat: "json",                    // CHANGED from yaml
    memoryPath: "~/.openclaw/MEMORY.md",
    enabled: true,
  },
  aider: {
    id: "aider",
    name: "Aider",
    skillsPath: "~/.aider/plugins",
    mcpConfigPath: "~/.aider.conf.yml",       // CHANGED from ~/.aider/config.yaml
    mcpConfigFormat: "yaml",                   // stays yaml
    memoryPath: "~/.aider/MEMORY.md",
    enabled: true,
  },
};
```

Also add a new `cliCommand` field to `ToolConfig`:

```typescript
export interface ToolConfig {
  id: ToolId;
  name: string;
  skillsPath: string;
  mcpConfigPath: string;
  mcpConfigFormat: "json" | "toml" | "yaml";
  memoryPath: string;
  enabled: boolean;
  cliCommand?: string; // e.g. "claude", "codex", "gemini"
}
```

Add `cliCommand` to each tool:
- claude-code: `"claude"`
- codex: `"codex"`
- gemini-cli: `"gemini"`
- opencode: `"opencode"`
- openclaw: `undefined` (no full MCP CLI yet)
- aider: `undefined` (MCP CLI not merged yet)

### Step 2: Create `packages/cli/src/core/tool-adapter.ts`

This is the core new file. It defines the adapter interface and per-tool implementations.

```typescript
/**
 * Tool Adapter — CLI-first MCP management with file-edit fallback.
 * Each tool gets an adapter that knows how to add/remove/disable MCPs
 * using the tool's native CLI (if available) or by editing config files.
 */

export interface ToolAdapter {
  toolId: ToolId;

  /** Check if the tool's CLI is available in PATH */
  hasCli(): Promise<boolean>;

  /** Add a single MCP server via CLI */
  addViaCli(name: string, config: McpServerConfig): Promise<AdapterResult>;

  /** Remove a single MCP server via CLI */
  removeViaCli(name: string): Promise<AdapterResult>;

  /** Disable (not remove) a single MCP server via CLI — only some tools support this */
  disableViaCli(name: string): Promise<AdapterResult>;

  /** Enable a previously disabled MCP server via CLI */
  enableViaCli(name: string): Promise<AdapterResult>;

  /** Write all MCPs to config file (full replace of MCP section) */
  writeToFile(mcps: Record<string, McpServerConfig>): Promise<AdapterResult>;

  /** Remove a single MCP from config file */
  removeFromFile(name: string): Promise<AdapterResult>;

  /** Disable a single MCP in config file (tool-specific mechanism) */
  disableInFile(name: string): Promise<AdapterResult>;

  /** Enable a single MCP in config file */
  enableInFile(name: string): Promise<AdapterResult>;

  /** Sync all MCPs — the main entry point. Uses CLI if available, file otherwise */
  syncAll(mcps: Record<string, McpServerConfig>): Promise<AdapterResult>;

  /** Add a single MCP — uses CLI if available, file otherwise */
  add(name: string, config: McpServerConfig): Promise<AdapterResult>;

  /** Remove a single MCP — uses CLI if available, file otherwise */
  remove(name: string): Promise<AdapterResult>;

  /** Disable a single MCP — uses best available method */
  disable(name: string): Promise<AdapterResult>;

  /** Enable a single MCP — uses best available method */
  enable(name: string): Promise<AdapterResult>;
}

export interface AdapterResult {
  success: boolean;
  method: "cli" | "file";
  message?: string;
  error?: string;
}
```

#### Helper: `execCli()`

```typescript
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);

async function commandExists(cmd: string): Promise<boolean> {
  try {
    await execFileAsync("which", [cmd]);
    return true;
  } catch {
    return false;
  }
}

async function execCli(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(cmd, args, { timeout: 30000 });
}
```

#### Base class: `BaseToolAdapter`

Implements the routing logic (CLI vs file):

```typescript
abstract class BaseToolAdapter implements ToolAdapter {
  abstract toolId: ToolId;

  // Each subclass implements these
  abstract addViaCli(name: string, config: McpServerConfig): Promise<AdapterResult>;
  abstract removeViaCli(name: string): Promise<AdapterResult>;
  abstract writeToFile(mcps: Record<string, McpServerConfig>): Promise<AdapterResult>;
  abstract removeFromFile(name: string): Promise<AdapterResult>;

  // Default: not supported (subclass overrides if tool supports it)
  async disableViaCli(name: string): Promise<AdapterResult> {
    return { success: false, method: "cli", error: "Disable via CLI not supported" };
  }
  async enableViaCli(name: string): Promise<AdapterResult> {
    return { success: false, method: "cli", error: "Enable via CLI not supported" };
  }
  async disableInFile(name: string): Promise<AdapterResult> {
    return { success: false, method: "file", error: "Disable in file not supported — use remove instead" };
  }
  async enableInFile(name: string): Promise<AdapterResult> {
    return { success: false, method: "file", error: "Enable in file not supported — use add instead" };
  }

  async hasCli(): Promise<boolean> {
    const toolConfig = SUPPORTED_TOOLS[this.toolId];
    if (!toolConfig.cliCommand) return false;
    return commandExists(toolConfig.cliCommand);
  }

  // Main routing methods
  async syncAll(mcps: Record<string, McpServerConfig>): Promise<AdapterResult> {
    if (await this.hasCli()) {
      // Add each MCP individually via CLI
      const errors: string[] = [];
      for (const [name, config] of Object.entries(mcps)) {
        if (config.enabled === false) continue;
        const result = await this.addViaCli(name, config);
        if (!result.success) errors.push(`${name}: ${result.error}`);
      }
      if (errors.length > 0) {
        return { success: false, method: "cli", error: errors.join("; ") };
      }
      return { success: true, method: "cli", message: `Synced ${Object.keys(mcps).length} MCPs via CLI` };
    }
    return this.writeToFile(mcps);
  }

  async add(name: string, config: McpServerConfig): Promise<AdapterResult> {
    if (await this.hasCli()) return this.addViaCli(name, config);
    // For file fallback, we need to read existing + merge
    return this.writeToFile({ [name]: config }); // simplified — actual impl merges
  }

  async remove(name: string): Promise<AdapterResult> {
    if (await this.hasCli()) return this.removeViaCli(name);
    return this.removeFromFile(name);
  }

  async disable(name: string): Promise<AdapterResult> {
    if (await this.hasCli()) {
      const cliResult = await this.disableViaCli(name);
      if (cliResult.success) return cliResult;
    }
    const fileResult = await this.disableInFile(name);
    if (fileResult.success) return fileResult;
    // Last resort: remove it
    return this.remove(name);
  }

  async enable(name: string): Promise<AdapterResult> {
    if (await this.hasCli()) {
      const cliResult = await this.enableViaCli(name);
      if (cliResult.success) return cliResult;
    }
    return this.enableInFile(name);
  }
}
```

#### Per-tool adapters:

##### `ClaudeCodeAdapter`

```typescript
class ClaudeCodeAdapter extends BaseToolAdapter {
  toolId: ToolId = "claude-code";

  async addViaCli(name: string, config: McpServerConfig): Promise<AdapterResult> {
    try {
      // Build the JSON config
      const jsonConfig: Record<string, unknown> = {
        type: "stdio",
        command: config.command,
      };
      if (config.args?.length) jsonConfig.args = config.args;
      if (config.env && Object.keys(config.env).length > 0) jsonConfig.env = config.env;

      // First remove existing (to avoid "already exists" error)
      try { await execCli("claude", ["mcp", "remove", name]); } catch { /* ignore */ }

      await execCli("claude", [
        "mcp", "add-json", name, JSON.stringify(jsonConfig), "--scope", "user"
      ]);

      return { success: true, method: "cli", message: `Added ${name} via claude CLI` };
    } catch (err) {
      return { success: false, method: "cli", error: String(err) };
    }
  }

  async removeViaCli(name: string): Promise<AdapterResult> {
    try {
      await execCli("claude", ["mcp", "remove", name, "--scope", "user"]);
      return { success: true, method: "cli" };
    } catch (err) {
      return { success: false, method: "cli", error: String(err) };
    }
  }

  // Claude Code doesn't have disable CLI, but has disabledMcpServers in .claude.json per-project
  async disableInFile(name: string): Promise<AdapterResult> {
    try {
      const configPath = expandPath("~/.claude.json");
      const content = await readFileIfExists(configPath);
      if (!content) return { success: false, method: "file", error: "Config not found" };
      const config = JSON.parse(content);

      // Add to root-level disabledMcpServers (if that concept exists at user level)
      // Otherwise, remove from mcpServers
      if (config.mcpServers?.[name]) {
        delete config.mcpServers[name];
        await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
        return { success: true, method: "file", message: `Removed ${name} from mcpServers` };
      }
      return { success: false, method: "file", error: `${name} not found in mcpServers` };
    } catch (err) {
      return { success: false, method: "file", error: String(err) };
    }
  }

  async writeToFile(mcps: Record<string, McpServerConfig>): Promise<AdapterResult> {
    // Delegate to existing sync-writer logic
    // This is the fallback when CLI is not available
    try {
      const configPath = expandPath("~/.claude.json");
      const existing = await readFileIfExists(configPath);
      const config: Record<string, unknown> = existing ? JSON.parse(existing) : {};

      const cleanMcps: Record<string, unknown> = {};
      for (const [name, mcp] of Object.entries(mcps)) {
        if (mcp.enabled === false) continue;
        const entry: Record<string, unknown> = { command: mcp.command };
        if (mcp.args?.length) entry.args = mcp.args;
        if (mcp.env && Object.keys(mcp.env).length > 0) entry.env = mcp.env;
        cleanMcps[name] = entry;
      }
      config.mcpServers = cleanMcps;

      await mkdirp(path.dirname(configPath));
      await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");

      return { success: true, method: "file", message: "Wrote mcpServers to ~/.claude.json" };
    } catch (err) {
      return { success: false, method: "file", error: String(err) };
    }
  }

  async removeFromFile(name: string): Promise<AdapterResult> {
    return this.disableInFile(name); // Same behavior for Claude Code
  }
}
```

##### `CodexAdapter`

```typescript
class CodexAdapter extends BaseToolAdapter {
  toolId: ToolId = "codex";

  async addViaCli(name: string, config: McpServerConfig): Promise<AdapterResult> {
    try {
      // codex mcp add <name> -- <command> [args...]
      const args = ["mcp", "add", name, "--"];
      args.push(config.command);
      if (config.args?.length) args.push(...config.args);

      await execCli("codex", args);
      return { success: true, method: "cli" };
    } catch (err) {
      return { success: false, method: "cli", error: String(err) };
    }
  }

  async removeViaCli(name: string): Promise<AdapterResult> {
    try {
      await execCli("codex", ["mcp", "remove", name]);
      return { success: true, method: "cli" };
    } catch (err) {
      return { success: false, method: "cli", error: String(err) };
    }
  }

  async writeToFile(mcps: Record<string, McpServerConfig>): Promise<AdapterResult> {
    // Reuse existing writeCodex logic from sync-writer
    // (preserve non-MCP TOML sections, replace mcp.servers.* sections)
    try {
      const configPath = expandPath("~/.codex/config.toml");
      const existing = await readFileIfExists(configPath);

      // ... same TOML generation logic as current writeCodex ...

      return { success: true, method: "file" };
    } catch (err) {
      return { success: false, method: "file", error: String(err) };
    }
  }

  async removeFromFile(name: string): Promise<AdapterResult> {
    // Read TOML, remove [mcp.servers."<name>"] section, rewrite
    // ...
    return { success: true, method: "file" };
  }
}
```

##### `GeminiAdapter`

```typescript
class GeminiAdapter extends BaseToolAdapter {
  toolId: ToolId = "gemini-cli";

  async addViaCli(name: string, config: McpServerConfig): Promise<AdapterResult> {
    try {
      // gemini mcp add <name> --command <cmd> [--args "a" "b"] [-e KEY=VAL] [-s user]
      const args = ["mcp", "add", name, "--command", config.command];
      if (config.args?.length) {
        args.push("--args", ...config.args);
      }
      if (config.env) {
        for (const [k, v] of Object.entries(config.env)) {
          args.push("-e", `${k}=${v}`);
        }
      }
      args.push("-s", "user");

      await execCli("gemini", args);
      return { success: true, method: "cli" };
    } catch (err) {
      return { success: false, method: "cli", error: String(err) };
    }
  }

  async removeViaCli(name: string): Promise<AdapterResult> {
    try {
      await execCli("gemini", ["mcp", "remove", name]);
      return { success: true, method: "cli" };
    } catch (err) {
      return { success: false, method: "cli", error: String(err) };
    }
  }

  // Gemini CLI uniquely supports disable/enable
  async disableViaCli(name: string): Promise<AdapterResult> {
    try {
      await execCli("gemini", ["mcp", "disable", name]);
      return { success: true, method: "cli" };
    } catch (err) {
      return { success: false, method: "cli", error: String(err) };
    }
  }

  async enableViaCli(name: string): Promise<AdapterResult> {
    try {
      await execCli("gemini", ["mcp", "enable", name]);
      return { success: true, method: "cli" };
    } catch (err) {
      return { success: false, method: "cli", error: String(err) };
    }
  }

  async writeToFile(mcps: Record<string, McpServerConfig>): Promise<AdapterResult> {
    // Write to ~/.gemini/settings.json → mcpServers key
    try {
      const configPath = expandPath("~/.gemini/settings.json");
      const existing = await readFileIfExists(configPath);
      const config: Record<string, unknown> = existing ? JSON.parse(existing) : {};

      const cleanMcps: Record<string, unknown> = {};
      for (const [name, mcp] of Object.entries(mcps)) {
        if (mcp.enabled === false) continue;
        const entry: Record<string, unknown> = { command: mcp.command };
        if (mcp.args?.length) entry.args = mcp.args;
        if (mcp.env && Object.keys(mcp.env).length > 0) entry.env = mcp.env;
        cleanMcps[name] = entry;
      }
      config.mcpServers = cleanMcps;

      await mkdirp(path.dirname(configPath));
      await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
      return { success: true, method: "file" };
    } catch (err) {
      return { success: false, method: "file", error: String(err) };
    }
  }

  async removeFromFile(name: string): Promise<AdapterResult> {
    // Read settings.json, delete mcpServers[name], rewrite
    return { success: true, method: "file" };
  }
}
```

##### `OpenCodeAdapter`

```typescript
class OpenCodeAdapter extends BaseToolAdapter {
  toolId: ToolId = "opencode";

  // OpenCode's `opencode mcp add` is interactive-only, so hasCli returns false
  async hasCli(): Promise<boolean> {
    return false; // interactive-only CLI, can't use non-interactively
  }

  async addViaCli(): Promise<AdapterResult> {
    return { success: false, method: "cli", error: "OpenCode MCP CLI is interactive-only" };
  }

  async removeViaCli(): Promise<AdapterResult> {
    return { success: false, method: "cli", error: "OpenCode MCP CLI is interactive-only" };
  }

  async writeToFile(mcps: Record<string, McpServerConfig>): Promise<AdapterResult> {
    // Write to ~/.config/opencode/opencode.json → mcp key
    // OpenCode format: { mcp: { "name": { type: "local", command: [...], environment: {} } } }
    try {
      const configPath = expandPath("~/.config/opencode/opencode.json");
      const existing = await readFileIfExists(configPath);
      const config: Record<string, unknown> = existing ? JSON.parse(existing) : {};

      const mcpSection: Record<string, unknown> = {};
      for (const [name, mcp] of Object.entries(mcps)) {
        if (mcp.enabled === false) continue;
        mcpSection[name] = {
          type: "local",
          command: [mcp.command, ...(mcp.args || [])],
          ...(mcp.env && Object.keys(mcp.env).length > 0 ? { environment: mcp.env } : {}),
          enabled: true,
        };
      }
      config.mcp = mcpSection;

      await mkdirp(path.dirname(configPath));
      await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
      return { success: true, method: "file" };
    } catch (err) {
      return { success: false, method: "file", error: String(err) };
    }
  }

  // OpenCode supports enabled: false toggle
  async disableInFile(name: string): Promise<AdapterResult> {
    try {
      const configPath = expandPath("~/.config/opencode/opencode.json");
      const existing = await readFileIfExists(configPath);
      if (!existing) return { success: false, method: "file", error: "Config not found" };
      const config = JSON.parse(existing);

      if (config.mcp?.[name]) {
        config.mcp[name].enabled = false;
        await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
        return { success: true, method: "file" };
      }
      return { success: false, method: "file", error: `${name} not found` };
    } catch (err) {
      return { success: false, method: "file", error: String(err) };
    }
  }

  async enableInFile(name: string): Promise<AdapterResult> {
    try {
      const configPath = expandPath("~/.config/opencode/opencode.json");
      const existing = await readFileIfExists(configPath);
      if (!existing) return { success: false, method: "file", error: "Config not found" };
      const config = JSON.parse(existing);

      if (config.mcp?.[name]) {
        config.mcp[name].enabled = true;
        await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
        return { success: true, method: "file" };
      }
      return { success: false, method: "file", error: `${name} not found` };
    } catch (err) {
      return { success: false, method: "file", error: String(err) };
    }
  }

  async removeFromFile(name: string): Promise<AdapterResult> {
    try {
      const configPath = expandPath("~/.config/opencode/opencode.json");
      const existing = await readFileIfExists(configPath);
      if (!existing) return { success: false, method: "file", error: "Config not found" };
      const config = JSON.parse(existing);

      if (config.mcp?.[name]) {
        delete config.mcp[name];
        await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
        return { success: true, method: "file" };
      }
      return { success: false, method: "file", error: `${name} not found` };
    } catch (err) {
      return { success: false, method: "file", error: String(err) };
    }
  }
}
```

##### `OpenClawAdapter`

```typescript
class OpenClawAdapter extends BaseToolAdapter {
  toolId: ToolId = "openclaw";

  async hasCli(): Promise<boolean> {
    return false; // No full MCP CLI yet
  }

  async addViaCli(): Promise<AdapterResult> {
    return { success: false, method: "cli", error: "OpenClaw has no MCP CLI" };
  }
  async removeViaCli(): Promise<AdapterResult> {
    return { success: false, method: "cli", error: "OpenClaw has no MCP CLI" };
  }

  async writeToFile(mcps: Record<string, McpServerConfig>): Promise<AdapterResult> {
    // Reuse existing writeOpenClaw logic (plugins.entries mcp-adapter format)
    // ...
    return { success: true, method: "file" };
  }

  async removeFromFile(name: string): Promise<AdapterResult> {
    // Remove from plugins.entries where name matches
    return { success: true, method: "file" };
  }
}
```

##### `AiderAdapter`

```typescript
class AiderAdapter extends BaseToolAdapter {
  toolId: ToolId = "aider";

  async hasCli(): Promise<boolean> {
    return false; // MCP support not merged yet (PR #3937)
  }

  async addViaCli(): Promise<AdapterResult> {
    return { success: false, method: "cli", error: "Aider MCP CLI not yet available" };
  }
  async removeViaCli(): Promise<AdapterResult> {
    return { success: false, method: "cli", error: "Aider MCP CLI not yet available" };
  }

  async writeToFile(mcps: Record<string, McpServerConfig>): Promise<AdapterResult> {
    // Write MCP JSON to a file, reference via mcp-servers-file in .aider.conf.yml
    // Aider uses: mcp-servers-file: /path/to/mcp.json
    // The JSON format is: { mcpServers: { ... } }
    try {
      const mcpFilePath = expandPath("~/.aider/mcp-servers.json");
      const confPath = expandPath("~/.aider.conf.yml");

      // Write MCP servers JSON
      const mcpJson: Record<string, unknown> = { mcpServers: {} };
      for (const [name, mcp] of Object.entries(mcps)) {
        if (mcp.enabled === false) continue;
        const entry: Record<string, unknown> = {
          type: "stdio",
          command: mcp.command,
        };
        if (mcp.args?.length) entry.args = mcp.args;
        if (mcp.env && Object.keys(mcp.env).length > 0) entry.env = mcp.env;
        (mcpJson.mcpServers as Record<string, unknown>)[name] = entry;
      }

      await mkdirp(path.dirname(mcpFilePath));
      await fs.writeFile(mcpFilePath, JSON.stringify(mcpJson, null, 2), "utf-8");

      // Ensure .aider.conf.yml has mcp-servers-file reference
      const existingConf = await readFileIfExists(confPath);
      if (existingConf && !existingConf.includes("mcp-servers-file")) {
        await fs.appendFile(confPath, `\nmcp-servers-file: ${mcpFilePath}\n`);
      } else if (!existingConf) {
        await fs.writeFile(confPath, `mcp-servers-file: ${mcpFilePath}\n`);
      }

      return { success: true, method: "file" };
    } catch (err) {
      return { success: false, method: "file", error: String(err) };
    }
  }

  async removeFromFile(name: string): Promise<AdapterResult> {
    // Read ~/.aider/mcp-servers.json, remove entry, rewrite
    return { success: true, method: "file" };
  }
}
```

#### Adapter factory:

```typescript
const adapters: Record<ToolId, ToolAdapter> = {
  "claude-code": new ClaudeCodeAdapter(),
  codex: new CodexAdapter(),
  "gemini-cli": new GeminiAdapter(),
  opencode: new OpenCodeAdapter(),
  openclaw: new OpenClawAdapter(),
  aider: new AiderAdapter(),
};

export function getAdapter(toolId: ToolId): ToolAdapter {
  const adapter = adapters[toolId];
  if (!adapter) throw new Error(`No adapter for tool: ${toolId}`);
  return adapter;
}
```

### Step 3: Refactor `sync-writer.ts` to use adapters

Replace the `syncToTool()` function to delegate to adapters:

```typescript
import { getAdapter } from "./tool-adapter.js";

export async function syncToTool(
  toolId: ToolId,
  mcps: Record<string, McpServerConfig>,
  hooks?: ScannedHook[],
): Promise<SyncWriteResult> {
  const adapter = getAdapter(toolId);
  const result = await adapter.syncAll(mcps);

  // Handle hooks separately (Claude Code only)
  if (toolId === "claude-code" && hooks?.length) {
    await writeClaudeCodeHooks(hooks);
  }

  return {
    configPath: expandPath(SUPPORTED_TOOLS[toolId].mcpConfigPath),
    backupPath: "",
    sectionsUpdated: result.success ? ["mcpServers"] : [],
    success: result.success,
    error: result.error,
  };
}
```

Keep `dryRunSync`, `backupConfig`, `restoreBackups` as they are.
Keep `writeClaudeCode`, `writeCodex`, etc. as **private deprecated helpers** for backward compat (can remove later).

### Step 4: Update `sync.ts` command

In `syncTool()` function, replace `injectMcpsToTool` + `syncToTool` with the single adapter call:

```typescript
// BEFORE (two sync paths):
await injectMcpsToTool(toolId, resolvedMcps, toolMcpConfigPath);
// ... later in the command action:
await syncToTool(toolId as ToolId, mergedConfig.mcps);

// AFTER (one adapter call):
const adapter = getAdapter(toolId);
await adapter.syncAll(resolvedMcps);
```

Remove the duplicate "overlay sync" block at line 332-341 in sync.ts.

### Step 5: Update `mcp-injector.ts`

The `injectMcpsToTool` function is now replaced by adapter calls. We can:
- Keep `filterMcpsForTool`, `resolveEnvVarsInMcps` (still needed)
- Keep `generateClaudeConfig`, `generateCodexConfig`, etc. (used by other things)
- Deprecate `injectMcpsToTool` — it's replaced by `adapter.syncAll()`
- Deprecate `createDefaultConfig` — adapters handle file creation

### Step 6: Create tests `packages/cli/src/core/tool-adapter.test.ts`

Tests should cover:

1. **CLI detection**: Mock `which` to test hasCli() for each adapter
2. **CLI add**: Mock execFile, verify correct CLI args for each tool:
   - Claude: `claude mcp add-json <name> '<json>' --scope user`
   - Codex: `codex mcp add <name> -- <cmd> <args>`
   - Gemini: `gemini mcp add <name> --command <cmd> -s user`
3. **CLI remove**: Mock execFile, verify correct remove args
4. **CLI disable**: Only Gemini should succeed
5. **File fallback**: When hasCli() returns false, verify file write
6. **File formats**: Verify each tool writes its correct format:
   - Claude Code: JSON with `mcpServers` in `~/.claude.json`
   - Codex: TOML with `[mcp.servers."name"]` in `~/.codex/config.toml`
   - Gemini: JSON with `mcpServers` in `~/.gemini/settings.json`
   - OpenCode: JSON with `mcp.name.type=local` in `~/.config/opencode/opencode.json`
   - OpenClaw: JSON with `plugins.entries[].type=mcp-adapter` in `~/.openclaw/openclaw.json`
   - Aider: JSON `mcpServers` in `~/.aider/mcp-servers.json` + YAML ref
7. **Disable in file**: OpenCode sets `enabled: false`, others remove
8. **syncAll routing**: Verify CLI path vs file path based on hasCli()
9. **Error handling**: CLI failures, file read errors, JSON parse errors

### Step 7: Update `doctor.test.ts`

Update the mock `SUPPORTED_TOOLS` config paths to match the new values.

---

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `packages/core/src/types.ts` | MODIFY | Fix config paths, add `cliCommand` field |
| `packages/cli/src/core/tool-adapter.ts` | CREATE | New adapter interface + 6 implementations |
| `packages/cli/src/core/tool-adapter.test.ts` | CREATE | Tests for all adapters |
| `packages/cli/src/core/sync-writer.ts` | MODIFY | Delegate to adapters |
| `packages/cli/src/commands/sync.ts` | MODIFY | Remove duplicate overlay sync, use adapters |
| `packages/cli/src/core/mcp-injector.ts` | MODIFY | Deprecate `injectMcpsToTool` |
| `packages/cli/src/commands/doctor.test.ts` | MODIFY | Update mock config paths |

## Files NOT Changed

- `packages/cli/src/core/migrator.ts` — already reads from correct paths
- `packages/dashboard/` — no changes needed
- `packages/cli/src/core/mcp-injector.test.ts` — existing tests still valid for generators

---

## Testing Strategy

1. Run `pnpm -C packages/core build` after types.ts changes
2. Run `pnpm -C packages/cli test -- --run` after each step
3. Manual test: `mycelium sync -t claude-code -v` with Claude CLI installed
4. Manual test: Verify MCPs survive Claude Code restart

---

## Risk Mitigation

- **Backward compat**: Keep old file-writing functions as private helpers
- **Backup**: Adapter file writes still create `.mycelium-backup` files
- **Dry-run**: `--dry-run` flag still works (shows what adapter would do)
- **Restore**: `--restore` flag still works via existing backup logic
