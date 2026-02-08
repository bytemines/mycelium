#!/usr/bin/env node
/**
 * Mycelium CLI - Universal AI Tool Orchestrator
 *
 * Sync skills, MCPs, and memory across AI coding tools:
 * Claude Code, Codex CLI, Gemini CLI, OpenCode, OpenClaw, Aider
 */

import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { syncCommand } from "./commands/sync.js";
import { statusCommand } from "./commands/status.js";
import { doctorCommand } from "./commands/doctor.js";
import { addCommand } from "./commands/add.js";
import { enableCommand } from "./commands/enable.js";
import { disableCommand } from "./commands/disable.js";
import { teamsCommand } from "./commands/teams.js";
import { presetCommand } from "./commands/preset.js";
import { migrateCommand } from "./commands/migrate.js";
import { marketplaceCommand } from "./commands/marketplace.js";
import { serveCommand } from "./commands/serve.js";

const program = new Command();

program
  .name("mycelium")
  .alias("myc")
  .description(
    "Universal AI Tool Orchestrator - Sync skills, MCPs, and memory across AI coding tools"
  )
  .version("0.0.1");

// Register commands
program.addCommand(initCommand);
program.addCommand(syncCommand);
program.addCommand(statusCommand);
program.addCommand(doctorCommand);
program.addCommand(addCommand);
program.addCommand(enableCommand);
program.addCommand(disableCommand);
program.addCommand(teamsCommand);
program.addCommand(presetCommand);
program.addCommand(migrateCommand);
program.addCommand(marketplaceCommand);
program.addCommand(serveCommand);

program.parse();
