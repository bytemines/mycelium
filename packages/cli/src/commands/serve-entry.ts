/**
 * Dev-only entry point for `tsx watch` — starts the API server directly from source.
 * Used by `make dev` for auto-restart on backend changes.
 */
import { startServer } from "../server.js";
import { DEFAULT_PORT } from "../core/fs-helpers.js";

const port = parseInt(process.env.PORT ?? String(DEFAULT_PORT), 10);
const server = startServer(port);
process.on("SIGINT", () => { server.close(); process.exit(0); });
process.on("SIGTERM", () => { server.close(); process.exit(0); });
