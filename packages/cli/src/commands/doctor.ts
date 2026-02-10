/**
 * Doctor Command for Mycelium CLI
 *
 * Checks system health and offers to fix issues.
 * Implementation split into health-checks/ modules.
 */

import { Command } from "commander";
import {
  runAllChecks,
  formatDoctorOutput,
  formatDoctorJson,
} from "./health-checks/index.js";

// Re-export everything from health-checks for backwards compatibility
export type { DiagnosticResult, DoctorResult } from "./health-checks/index.js";
export {
  checkGlobalMyceliumExists,
  checkManifestValid,
  checkToolPathExists,
  checkBrokenSymlinks,
  checkMcpConfigJson,
  checkMcpConfigYaml,
  checkOrphanedConfigs,
  checkMcpServerConnectivity,
  checkMemoryFilesExist,
  checkMemoryFileSize,
  checkToolVersions,
  checkTakenOverPlugins,
  runAllChecks,
  formatDoctorOutput,
  formatDoctorJson,
} from "./health-checks/index.js";

export const doctorCommand = new Command("doctor")
  .description("Check system health and diagnose issues")
  .option("-j, --json", "Output as JSON")
  .option("-f, --fix", "Attempt to fix issues automatically")
  .action(async (options) => {
    try {
      const result = await runAllChecks();

      if (options.json) {
        console.log(formatDoctorJson(result));
      } else {
        console.log(formatDoctorOutput(result));
      }

      // Exit with non-zero if checks failed
      if (!result.success) {
        process.exit(1);
      }
    } catch (error) {
      console.error(
        "Error running doctor:",
        error instanceof Error ? error.message : String(error)
      );
      process.exit(1);
    }
  });
