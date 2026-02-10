import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock enable
vi.mock("../../commands/enable.js", () => ({
  enableSkillOrMcp: vi.fn(),
}));

// Mock disable
vi.mock("../../commands/disable.js", () => ({
  disableSkillOrMcp: vi.fn(),
}));

// Mock add-helpers
vi.mock("../../core/add-helpers.js", () => ({
  addMcp: vi.fn(),
  addSkill: vi.fn(),
}));

// Mock remove
vi.mock("../../commands/remove.js", () => ({
  removeItem: vi.fn(),
}));

// Mock global-tracer
vi.mock("../../core/global-tracer.js", () => ({
  getTracer: () => ({
    createTrace: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  }),
}));

type ToolHandler = (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }> }>;

function createMockServer() {
  const tools = new Map<string, ToolHandler>();
  return {
    registerTool: vi.fn((name: string, _config: unknown, handler: ToolHandler) => {
      tools.set(name, handler);
    }),
    getHandler(name: string): ToolHandler {
      const h = tools.get(name);
      if (!h) throw new Error(`Tool ${name} not registered`);
      return h;
    },
  };
}

describe("registerItemTools", () => {
  let mockServer: ReturnType<typeof createMockServer>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockServer = createMockServer();
    const { registerItemTools } = await import("./item-tools.js");
    registerItemTools(mockServer as never);
  });

  it("registers all four tools", () => {
    expect(mockServer.registerTool).toHaveBeenCalledTimes(4);
    const names = mockServer.registerTool.mock.calls.map((c) => c[0]);
    expect(names).toContain("mycelium_enable");
    expect(names).toContain("mycelium_disable");
    expect(names).toContain("mycelium_add");
    expect(names).toContain("mycelium_remove");
  });

  describe("mycelium_enable", () => {
    it("calls enableSkillOrMcp and returns result", async () => {
      const { enableSkillOrMcp } = await import("../../commands/enable.js");
      const mockEnable = vi.mocked(enableSkillOrMcp);
      mockEnable.mockResolvedValue({
        success: true,
        name: "test-mcp",
        type: "mcp",
        level: "project",
        message: "mcp 'test-mcp' enabled",
      });

      const handler = mockServer.getHandler("mycelium_enable");
      const result = await handler({ name: "test-mcp", type: "mcp" });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(true);
      expect(parsed.name).toBe("test-mcp");
      expect(mockEnable).toHaveBeenCalledWith({ name: "test-mcp", global: false });
    });

    it("enables at global scope when specified", async () => {
      const { enableSkillOrMcp } = await import("../../commands/enable.js");
      const mockEnable = vi.mocked(enableSkillOrMcp);
      mockEnable.mockResolvedValue({ success: true, name: "my-skill", level: "global" });

      const handler = mockServer.getHandler("mycelium_enable");
      await handler({ name: "my-skill", type: "skill", scope: "global" });
      expect(mockEnable).toHaveBeenCalledWith({ name: "my-skill", global: true });
    });
  });

  describe("mycelium_disable", () => {
    it("calls disableSkillOrMcp and returns result", async () => {
      const { disableSkillOrMcp } = await import("../../commands/disable.js");
      const mockDisable = vi.mocked(disableSkillOrMcp);
      mockDisable.mockResolvedValue({
        success: true,
        name: "test-mcp",
        type: "mcp",
        level: "project",
        message: "mcp 'test-mcp' disabled",
      });

      const handler = mockServer.getHandler("mycelium_disable");
      const result = await handler({ name: "test-mcp", type: "mcp" });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(true);
      expect(parsed.message).toContain("disabled");
      expect(mockDisable).toHaveBeenCalledWith({ name: "test-mcp", global: false });
    });
  });

  describe("mycelium_add", () => {
    it("adds MCP with command and args", async () => {
      const { addMcp } = await import("../../core/add-helpers.js");
      const mockAddMcp = vi.mocked(addMcp);
      mockAddMcp.mockResolvedValue({ success: true, name: "context7", message: "Added MCP context7" });

      const handler = mockServer.getHandler("mycelium_add");
      const result = await handler({
        name: "context7",
        type: "mcp",
        command: "npx",
        args: ["-y", "@context7/mcp"],
      });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(true);
      expect(mockAddMcp).toHaveBeenCalledWith("context7", {
        command: "npx",
        args: ["-y", "@context7/mcp"],
        env: undefined,
        global: true,
      });
    });

    it("fails without command for MCP type", async () => {
      const handler = mockServer.getHandler("mycelium_add");
      const result = await handler({ name: "my-mcp", type: "mcp" });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain("command is required");
    });

    it("adds skill using source", async () => {
      const { addSkill } = await import("../../core/add-helpers.js");
      const mockAddSkill = vi.mocked(addSkill);
      mockAddSkill.mockResolvedValue({ success: true, name: "my-skill", message: "Added skill" });

      const handler = mockServer.getHandler("mycelium_add");
      const result = await handler({ name: "my-skill", type: "skill", source: "owner/repo" });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(true);
      expect(mockAddSkill).toHaveBeenCalledWith("owner/repo", { global: true });
    });

    it("returns error for unsupported plugin type on add", async () => {
      const handler = mockServer.getHandler("mycelium_add");
      const result = await handler({ name: "test", type: "plugin" });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain("Unsupported type for add");
    });
  });

  describe("mycelium_remove", () => {
    it("calls removeItem and sets state to deleted", async () => {
      const { removeItem } = await import("../../commands/remove.js");
      const mockRemove = vi.mocked(removeItem);
      mockRemove.mockResolvedValue({
        success: true,
        name: "old-mcp",
        section: "mcp",
        message: "mcp 'old-mcp' marked as deleted",
      });

      const handler = mockServer.getHandler("mycelium_remove");
      const result = await handler({ name: "old-mcp", type: "mcp" });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(true);
      expect(parsed.message).toContain("deleted");
      expect(mockRemove).toHaveBeenCalledWith("old-mcp", { type: "mcp" });
    });

    it("returns error when item not found", async () => {
      const { removeItem } = await import("../../commands/remove.js");
      const mockRemove = vi.mocked(removeItem);
      mockRemove.mockResolvedValue({
        success: false,
        name: "nonexistent",
        error: "'nonexistent' not found in manifest",
      });

      const handler = mockServer.getHandler("mycelium_remove");
      const result = await handler({ name: "nonexistent", type: "mcp" });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain("not found");
    });
  });
});
