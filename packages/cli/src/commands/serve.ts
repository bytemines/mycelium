import { Command } from "commander";
import { startServer } from "../server.js";
import { DEFAULT_PORT } from "../core/fs-helpers.js";

export const serveCommand = new Command("serve")
  .description("Start the Mycelium dashboard")
  .option("-p, --port <port>", "Port number", String(DEFAULT_PORT))
  .action((opts) => {
    const server = startServer(parseInt(opts.port, 10));
    process.on("SIGINT", () => { server.close(); process.exit(0); });
    process.on("SIGTERM", () => { server.close(); process.exit(0); });
  });
