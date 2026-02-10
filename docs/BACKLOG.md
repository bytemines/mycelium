# Backlog

Items to do later, not blocking current work.

## MCP Distribution & Discovery

- [ ] Register on official MCP Registry at `registry.modelcontextprotocol.io` (submit `server.json`)
- [ ] Get indexed on Smithery (7,300+ servers, their CLI can point to `npx @mycelish/cli mcp`)
- [ ] Create VS Code one-click install link (`vscode:mcp/install?{encoded-json}`) for README badges

## Known Issues (Non-Blocking)

- [ ] `Graph.tsx` ~600 lines — extract edge-building and plugin node logic
- [ ] `preset load` prints actions but doesn't execute enable/disable
- [ ] `watcher.ts` `recursive:true` unsupported on Linux
- [ ] `doctor.ts` `checkMcpServerConnectivity` runs actual MCP commands (could use `which`)
- [ ] `dryRunSync` doesn't use `entryShape` for vscode/opencode preview (cosmetic)
- [ ] `doctor.ts` `memoryLimits` could derive from TOOL_REGISTRY
