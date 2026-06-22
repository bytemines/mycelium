---
"@mycelish/cli": patch
---

Zero-native-dependency tracing: migrate `TraceStore` from `better-sqlite3` (native, ABI-sensitive) to Node's built-in `node:sqlite`. `mycelium sync` no longer crashes after a Node upgrade (ABI mismatch), and tracing works with no recompile. Tracing also fails soft now — a SQLite problem disables tracing instead of crashing the command. Removes the `better-sqlite3` dependency; CI now tests across Node 22/24/26.
