import { describe, it, expect } from "vitest";

describe("createMyceliumMcpServer", () => {
  it("creates an McpServer with name and version", async () => {
    const { createMyceliumMcpServer } = await import("./server.js");
    const server = createMyceliumMcpServer();
    expect(server).toBeDefined();
  });
});
