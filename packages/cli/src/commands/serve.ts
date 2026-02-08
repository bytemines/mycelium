import { Command } from "commander";
import { execSync } from "node:child_process";
import * as path from "node:path";
import { startServer } from "../server.js";

export const serveCommand = new Command("serve")
  .description("Start the dashboard API server")
  .option("-p, --port <port>", "Port number", "3378")
  .option("--no-build", "Skip rebuilding before starting")
  .action((opts) => {
    if (opts.build !== false) {
      const root = path.resolve(__dirname, "..", "..", "..", "..");
      try {
        console.log("Building latest code...");
        execSync("pnpm run build", { cwd: root, stdio: "inherit" });
      } catch {
        console.warn("Build failed, starting server with existing code.");
      }
    }
    startServer(parseInt(opts.port, 10));
  });
