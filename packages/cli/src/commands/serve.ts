import { Command } from "commander";
import { execFileSync } from "node:child_process";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "../server.js";
import { DEFAULT_PORT } from "../core/fs-helpers.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const serveCommand = new Command("serve")
  .description("Start the dashboard API server")
  .option("-p, --port <port>", "Port number", String(DEFAULT_PORT))
  .option("--build", "Rebuild before starting (off by default)")
  .action((opts) => {
    if (opts.build) {
      const root = path.resolve(__dirname, "..", "..", "..", "..");
      try {
        console.log("Building latest code...");
        execFileSync("pnpm", ["run", "build"], { cwd: root, stdio: "inherit" });
      } catch {
        console.warn("Build failed, starting server with existing code.");
      }
    }
    const server = startServer(parseInt(opts.port, 10));
    // Prevent Node from exiting
    process.on("SIGINT", () => { server.close(); process.exit(0); });
    process.on("SIGTERM", () => { server.close(); process.exit(0); });
  });
