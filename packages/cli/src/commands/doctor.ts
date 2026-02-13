/**
 * Doctor Command for Mycelium CLI
 *
 * Checks system health and offers to fix issues.
 * Implementation split into health-checks/ modules.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { Command } from "commander";
import pc from "picocolors";
import {
  runAllChecks,
  formatDoctorOutput,
  formatDoctorJson,
} from "./health-checks/index.js";

async function runSecurityScan(json: boolean): Promise<void> {
  const { scanSkill } = await import("../core/security-scanner.js");
  const skillsDir = path.join(os.homedir(), ".mycelium", "global", "skills");

  let entries: string[] = [];
  try {
    entries = await fs.readdir(skillsDir);
  } catch {
    if (!json) console.log(pc.yellow("\nNo skills directory found — skipping security scan"));
    return;
  }

  if (!json) console.log(pc.bold("\n🔒 Security Scan"));

  let totalFindings = 0;
  const allResults: Array<{ name: string; findings: Array<{ severity: string }> }> = [];

  for (const entry of entries) {
    const skillPath = path.join(skillsDir, entry);
    const stat = await fs.stat(skillPath).catch(() => null);
    if (!stat?.isDirectory()) continue;

    const result = await scanSkill(skillPath);
    if (result.findings.length > 0) {
      totalFindings += result.findings.length;
      allResults.push({ name: entry, findings: result.findings });
      if (!json) {
        const critical = result.findings.filter((f: { severity: string }) => f.severity === "critical").length;
        const high = result.findings.filter((f: { severity: string }) => f.severity === "high").length;
        const medium = result.findings.filter((f: { severity: string }) => f.severity === "medium").length;
        const low = result.findings.filter((f: { severity: string }) => f.severity === "low").length;
        const parts: string[] = [];
        if (critical) parts.push(pc.red(`${critical} critical`));
        if (high) parts.push(pc.yellow(`${high} high`));
        if (medium) parts.push(pc.yellow(`${medium} medium`));
        if (low) parts.push(pc.dim(`${low} low`));
        console.log(`  ${pc.red("✗")} ${entry}: ${parts.join(", ")}`);
      }
    } else {
      if (!json) console.log(`  ${pc.green("✓")} ${entry}: clean`);
    }
  }

  if (json) {
    console.log(JSON.stringify({ securityScan: { totalFindings, skills: allResults } }, null, 2));
  } else if (totalFindings === 0) {
    console.log(pc.green("  All skills passed security scan"));
  } else {
    console.log(pc.yellow(`\n  ${totalFindings} total finding(s) across ${allResults.length} skill(s)`));
  }
}

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
  .option("-s, --security", "Scan installed skills for security issues")
  .action(async (options) => {
    try {
      const result = await runAllChecks();

      if (options.json) {
        console.log(formatDoctorJson(result));
      } else {
        console.log(formatDoctorOutput(result));
      }

      if (options.security) {
        await runSecurityScan(options.json);
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
