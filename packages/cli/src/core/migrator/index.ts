/**
 * Migrator — re-exports all migrator submodules to preserve the public API.
 */
// Scanners
export {
  scanClaudeCode,
  scanCodex,
  scanGemini,
  scanOpenClaw,
  scanTool,
  scanAllTools,
} from "./scanners.js";

// Planner
export { generateMigrationPlan } from "./planner.js";

// Executor
export { executeMigration, clearMigration } from "./executor.js";

// Manifest & YAML helpers
export {
  loadManifest,
  saveManifest,
  writeHooksYaml,
  yamlQuote,
  serializeMcpsYaml,
} from "./manifest.js";
