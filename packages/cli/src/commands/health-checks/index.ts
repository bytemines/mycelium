export type { DiagnosticResult, DoctorResult } from "./types.js";
export {
  checkGlobalMyceliumExists,
  checkManifestValid,
  checkToolPathExists,
  checkBrokenSymlinks,
  checkMcpConfigJson,
  checkMcpConfigYaml,
  checkOrphanedConfigs,
} from "./config-check.js";
export { checkMcpServerConnectivity, checkSelfRegistration } from "./mcp-check.js";
export {
  checkMemoryFilesExist,
  checkMemoryFileSize,
} from "./memory-check.js";
export { checkToolVersions } from "./tool-version-check.js";
export { checkTakenOverPlugins } from "./plugin-takeover-check.js";
export { runAllChecks } from "./runner.js";
export { formatDoctorOutput, formatDoctorJson } from "./formatter.js";
