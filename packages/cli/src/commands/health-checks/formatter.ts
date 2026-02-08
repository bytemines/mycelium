/**
 * Formatting functions for doctor output.
 */

import type { DoctorResult } from "./types.js";

/**
 * Format doctor output for terminal display
 */
export function formatDoctorOutput(result: DoctorResult): string {
  const lines: string[] = [];

  // Header
  lines.push("Mycelium Doctor");
  lines.push("===============");
  lines.push("");

  // Checks
  for (const check of result.checks) {
    let icon: string;
    let color: string;

    switch (check.status) {
      case "pass":
        icon = "\u2714"; // Checkmark
        color = "\u001b[32m"; // Green
        break;
      case "fail":
        icon = "\u2718"; // X mark
        color = "\u001b[31m"; // Red
        break;
      case "warn":
        icon = "\u26A0"; // Warning
        color = "\u001b[33m"; // Yellow
        break;
    }

    const reset = "\u001b[0m";
    lines.push(`${color}${icon}${reset} ${check.name}`);
    lines.push(`    ${check.message}`);

    if (check.fix && check.status !== "pass") {
      lines.push(`    ${color}Fix:${reset} ${check.fix}`);
    }

    lines.push("");
  }

  // Summary
  lines.push("Summary:");
  lines.push(`  ${result.summary.passed} passed`);
  if (result.summary.failed > 0) {
    lines.push(`  \u001b[31m${result.summary.failed} failed\u001b[0m`);
  } else {
    lines.push(`  ${result.summary.failed} failed`);
  }
  if (result.summary.warnings > 0) {
    lines.push(`  \u001b[33m${result.summary.warnings} warning${result.summary.warnings !== 1 ? "s" : ""}\u001b[0m`);
  } else {
    lines.push(`  ${result.summary.warnings} warnings`);
  }

  // Overall status
  lines.push("");
  if (result.success) {
    lines.push("\u001b[32m\u2714 System health check passed\u001b[0m");
  } else {
    lines.push("\u001b[31m\u2718 System health check failed\u001b[0m");
    lines.push("");
    lines.push("Run suggested fixes above to resolve issues.");
  }

  return lines.join("\n");
}

/**
 * Format doctor output as JSON
 */
export function formatDoctorJson(result: DoctorResult): string {
  return JSON.stringify(result, null, 2);
}
