/**
 * Preset Command Module
 *
 * mycelium preset save <name>   - Save current config as a preset
 * mycelium preset load <name>   - Load and apply a preset
 * mycelium preset list          - List saved presets
 * mycelium preset export <name> - Export preset as YAML
 */

import { Command } from "commander";
import {
  createPreset,
  applyPreset,
  savePreset,
  loadPreset,
  listPresets,
  exportPreset,
} from "../core/presets.js";
import { loadAndMergeAllConfigs } from "../core/config-merger.js";
import { enableSkillOrMcp } from "./enable.js";
import { disableSkillOrMcp } from "./disable.js";

export const presetCommand = new Command("preset")
  .description("Manage configuration presets");

presetCommand
  .command("save <name>")
  .description("Save current config as a named preset")
  .action(async (name: string) => {
    const projectRoot = process.cwd();
    const config = await loadAndMergeAllConfigs(projectRoot);

    const preset = createPreset(name, {
      skills: Object.keys(config.skills),
      mcps: Object.keys(config.mcps),
      memory: {
        scopes: Object.keys(config.memory?.scopes ?? {}),
      },
    });

    await savePreset(preset);
    console.log(`Preset "${name}" saved.`);
  });

presetCommand
  .command("load <name>")
  .description("Load and apply a named preset")
  .action(async (name: string) => {
    const preset = await loadPreset(name);
    if (!preset) {
      console.error(`Preset "${name}" not found.`);
      process.exit(1);
    }

    const projectRoot = process.cwd();
    const config = await loadAndMergeAllConfigs(projectRoot);

    const actions = applyPreset(preset, {
      allSkills: Object.keys(config.skills),
      allMcps: Object.keys(config.mcps),
    });

    console.log(`Applying preset "${name}"...`);

    for (const skill of actions.enableSkills) {
      await enableSkillOrMcp({ name: skill, global: true });
    }
    for (const skill of actions.disableSkills) {
      await disableSkillOrMcp({ name: skill, global: true });
    }
    for (const mcp of actions.enableMcps) {
      await enableSkillOrMcp({ name: mcp, global: true });
    }
    for (const mcp of actions.disableMcps) {
      await disableSkillOrMcp({ name: mcp, global: true });
    }

    console.log(`Preset "${name}" applied:`);
    if (actions.enableSkills.length > 0) {
      console.log(`  Enabled skills: ${actions.enableSkills.join(", ")}`);
    }
    if (actions.disableSkills.length > 0) {
      console.log(`  Disabled skills: ${actions.disableSkills.join(", ")}`);
    }
    if (actions.enableMcps.length > 0) {
      console.log(`  Enabled MCPs: ${actions.enableMcps.join(", ")}`);
    }
    if (actions.disableMcps.length > 0) {
      console.log(`  Disabled MCPs: ${actions.disableMcps.join(", ")}`);
    }
  });

presetCommand
  .command("list")
  .description("List all saved presets")
  .action(async () => {
    const presets = await listPresets();
    if (presets.length === 0) {
      console.log("No presets saved yet.");
      return;
    }
    console.log("Saved presets:");
    for (const name of presets) {
      console.log(`  - ${name}`);
    }
  });

presetCommand
  .command("export <name>")
  .description("Export a preset as YAML")
  .action(async (name: string) => {
    const preset = await loadPreset(name);
    if (!preset) {
      console.error(`Preset "${name}" not found.`);
      process.exit(1);
    }
    console.log(exportPreset(preset));
  });
