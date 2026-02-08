import { Command } from "commander";
import { startServer } from "../server.js";

export const serveCommand = new Command("serve")
  .description("Start the dashboard API server")
  .option("-p, --port <port>", "Port number", "3378")
  .action((opts) => {
    startServer(parseInt(opts.port, 10));
  });
