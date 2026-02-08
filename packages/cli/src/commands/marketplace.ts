/**
 * Marketplace Command Module
 *
 * mycelium marketplace list                      — List marketplaces
 * mycelium marketplace add <name> --url <url>    — Add remote marketplace
 * mycelium marketplace remove <name>             — Remove user-added marketplace
 * mycelium marketplace plugins [--marketplace X] — List plugins
 * mycelium marketplace enable <plugin>           — Enable entire plugin
 * mycelium marketplace disable <plugin>          — Disable entire plugin
 */

import { Command } from "commander";
import {
  loadMarketplaceRegistry,
  addMarketplace,
  removeMarketplace,
  listPlugins,
  togglePlugin,
} from "../core/marketplace-registry.js";

const listCmd = new Command("list")
  .description("List configured marketplaces")
  .action(async () => {
    const registry = await loadMarketplaceRegistry();
    console.log("\nMarketplaces:\n");
    for (const [name, config] of Object.entries(registry)) {
      const status = config.enabled ? "enabled" : "disabled";
      const url = config.url ? ` (${config.url})` : "";
      const tag = config.discovered ? " [discovered]" : "";
      const def = config.default ? " [default]" : "";
      console.log(`  ${name} — ${config.type} — ${status}${url}${def}${tag}`);
    }
    console.log();
  });

const addCmd = new Command("add")
  .description("Add a remote marketplace")
  .argument("<name>", "Marketplace name")
  .option("--url <url>", "Marketplace URL")
  .option("--type <type>", "Marketplace type", "remote")
  .action(async (name: string, opts: { url?: string; type?: string }) => {
    await addMarketplace(name, {
      type: (opts.type as "local" | "remote") || "remote",
      enabled: true,
      url: opts.url,
    });
    console.log(`Added marketplace: ${name}`);
  });

const removeCmd = new Command("remove")
  .description("Remove a user-added marketplace")
  .argument("<name>", "Marketplace name")
  .action(async (name: string) => {
    await removeMarketplace(name);
    console.log(`Removed marketplace: ${name}`);
  });

const pluginsCmd = new Command("plugins")
  .description("List plugins from marketplaces")
  .option("--marketplace <name>", "Filter by marketplace")
  .action(async (opts: { marketplace?: string }) => {
    const plugins = await listPlugins(opts.marketplace);
    if (plugins.length === 0) {
      console.log("No plugins found.");
      return;
    }
    console.log(`\nPlugins (${plugins.length}):\n`);
    for (const p of plugins) {
      const skills = p.skills.length > 0 ? ` skills: ${p.skills.join(", ")}` : "";
      console.log(`  ${p.name} v${p.version} — ${p.marketplace}${skills}`);
    }
    console.log();
  });

const enableCmd = new Command("enable")
  .description("Enable a plugin")
  .argument("<plugin>", "Plugin name")
  .action(async (plugin: string) => {
    await togglePlugin(plugin, true);
    console.log(`Enabled plugin: ${plugin}`);
  });

const disableCmd = new Command("disable")
  .description("Disable a plugin")
  .argument("<plugin>", "Plugin name")
  .action(async (plugin: string) => {
    await togglePlugin(plugin, false);
    console.log(`Disabled plugin: ${plugin}`);
  });

export const marketplaceCommand = new Command("marketplace")
  .description("Manage marketplace sources and plugins")
  .addCommand(listCmd)
  .addCommand(addCmd)
  .addCommand(removeCmd)
  .addCommand(pluginsCmd)
  .addCommand(enableCmd)
  .addCommand(disableCmd);
