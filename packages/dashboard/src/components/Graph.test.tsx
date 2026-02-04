/**
 * Graph Component Tests - Written FIRST following TDD
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";

// Helper to wrap components with ReactFlowProvider
const renderWithProvider = (ui: React.ReactElement) => {
  return render(<ReactFlowProvider>{ui}</ReactFlowProvider>);
};

describe("Graph", () => {
  it("renders the React Flow container", async () => {
    const { Graph } = await import("./Graph");
    renderWithProvider(<Graph />);
    expect(screen.getByTestId("react-flow-graph")).toBeInTheDocument();
  });

  it("renders tool nodes for each supported tool", async () => {
    const { Graph } = await import("./Graph");
    renderWithProvider(<Graph />);
    // Check for at least some tool nodes - use findByText for async layout
    expect(await screen.findByText("Claude Code")).toBeInTheDocument();
    expect(await screen.findByText("Codex CLI")).toBeInTheDocument();
  });

  it("renders skill nodes", async () => {
    const { Graph } = await import("./Graph");
    const mockData = {
      skills: [{ name: "test-skill", status: "synced" as const }],
      mcps: [],
      memory: [],
    };
    renderWithProvider(<Graph data={mockData} />);
    expect(await screen.findByText("test-skill")).toBeInTheDocument();
  });

  it("renders mcp nodes", async () => {
    const { Graph } = await import("./Graph");
    const mockData = {
      skills: [],
      mcps: [{ name: "git-mcp", status: "synced" as const }],
      memory: [],
    };
    renderWithProvider(<Graph data={mockData} />);
    expect(await screen.findByText("git-mcp")).toBeInTheDocument();
  });

  it("renders memory nodes", async () => {
    const { Graph } = await import("./Graph");
    const mockData = {
      skills: [],
      mcps: [],
      memory: [{ name: "MEMORY.md", scope: "shared" as const, status: "synced" as const }],
    };
    renderWithProvider(<Graph data={mockData} />);
    expect(await screen.findByText("MEMORY.md")).toBeInTheDocument();
  });
});

describe("ToolNode", () => {
  it("renders with tool name and status", async () => {
    const { ToolNode } = await import("./Graph");
    renderWithProvider(
      <ToolNode data={{ name: "Claude Code", status: "synced", installed: true }} />
    );
    expect(screen.getByText("Claude Code")).toBeInTheDocument();
    expect(screen.getByTestId("node-status-synced")).toBeInTheDocument();
  });

  it("displays correct status colors", async () => {
    const { ToolNode } = await import("./Graph");
    renderWithProvider(
      <ToolNode data={{ name: "Test", status: "error", installed: true }} />
    );
    expect(screen.getByTestId("node-status-error")).toBeInTheDocument();
  });
});

describe("ResourceNode", () => {
  it("renders with resource name and type", async () => {
    const { ResourceNode } = await import("./Graph");
    renderWithProvider(
      <ResourceNode data={{ name: "tdd-skill", type: "skill", status: "synced" }} />
    );
    expect(screen.getByText("tdd-skill")).toBeInTheDocument();
    expect(screen.getByText("skill")).toBeInTheDocument();
  });
});
