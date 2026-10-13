/**
 * Graph Component Tests - Written FIRST following TDD
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ReactFlowProvider, useReactFlow } from "@xyflow/react";

// Helper to wrap components with ReactFlowProvider
const renderWithProvider = (ui: React.ReactElement) => {
  return render(<ReactFlowProvider>{ui}</ReactFlowProvider>);
};

function DraggedLayoutControl() {
  const { setNodes } = useReactFlow();
  return <button onClick={() => setNodes(nodes => nodes.map(node => ({
    ...node, position: { x: 123, y: 456 },
  })))}>Move nodes</button>;
}

describe("Graph", () => {
  it("repositions the same node IDs when radial sliders change", async () => {
    const previousUrl = window.location.href;
    window.history.replaceState(null, "", "?debug");
    try {
      const { Graph } = await import("./Graph");
      const { container } = renderWithProvider(<Graph data={{
        tools: [
          { id: "claude-code", name: "Claude Code", status: "synced", installed: true },
          { id: "codex", name: "Codex", status: "synced", installed: true },
        ],
        skills: [{ name: "layout-skill", status: "synced" }],
        mcps: [{ name: "layout-mcp", status: "synced" }],
      }} />);
      await screen.findByText("layout-skill");
      fireEvent.click(screen.getByRole("button", { name: "Radial" }));
      fireEvent.click(screen.getByRole("button", { name: "hybrid" }));
      const positions = () => Array.from(container.querySelectorAll<HTMLElement>(".react-flow__node"))
        .map(node => [node.dataset.id, node.style.transform]);
      const nodeIds = positions().map(([id]) => id);
      for (const [label, value] of [["Gap", "200"], ["Center", "300"], ["Density", "100"]]) {
        const before = positions();
        fireEvent.change(screen.getByRole("slider", { name: new RegExp(`^${label} `) }), { target: { value } });
        await waitFor(() => expect(positions()).not.toEqual(before));
        expect(positions().map(([id]) => id)).toEqual(nodeIds);
      }
    } finally {
      window.history.replaceState(null, "", previousUrl);
    }
  });

  it("keeps positions when only resource data changes", async () => {
    const { Graph } = await import("./Graph");
    const data = {
      skills: [{ name: "stable-skill", status: "synced" as const, enabled: true }],
      mcps: [],
    };
    const { container, rerender } = renderWithProvider(<><Graph data={data} /><DraggedLayoutControl /></>);
    await screen.findByText("stable-skill");
    fireEvent.click(screen.getByRole("button", { name: "Move nodes" }));
    const positions = () => Array.from(container.querySelectorAll<HTMLElement>(".react-flow__node"))
      .map(node => [node.dataset.id, node.style.transform]);
    const before = positions();
    expect(before.every(([, transform]) => transform === "translate(123px,456px)")).toBe(true);
    rerender(<ReactFlowProvider><Graph data={{ ...data, skills: [{ ...data.skills[0], enabled: false }] }} /><DraggedLayoutControl /></ReactFlowProvider>);
    await waitFor(() => expect(screen.getByRole("switch", { hidden: true })).toHaveAttribute("aria-checked", "false"));
    expect(positions()).toEqual(before);
    fireEvent.click(screen.getByRole("button", { name: "Vertical" }));
    await waitFor(() => expect(positions()).not.toEqual(before));
  });

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
    };
    renderWithProvider(<Graph data={mockData} />);
    expect(await screen.findByText("test-skill")).toBeInTheDocument();
  });

  it("renders mcp nodes", async () => {
    const { Graph } = await import("./Graph");
    const mockData = {
      skills: [],
      mcps: [{ name: "git-mcp", status: "synced" as const }],
    };
    renderWithProvider(<Graph data={mockData} />);
    expect(await screen.findByText("git-mcp")).toBeInTheDocument();
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

  it("renders toggle switch", async () => {
    const { ResourceNode } = await import("./Graph");
    renderWithProvider(
      <ResourceNode data={{ name: "tdd", type: "skill", status: "synced", enabled: true }} />
    );
    const toggle = screen.getByRole("switch");
    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-checked", "true");
  });

  it("calls onToggle when switch is clicked", async () => {
    const { ResourceNode } = await import("./Graph");
    const onToggle = vi.fn();
    renderWithProvider(
      <ResourceNode data={{ name: "tdd", type: "skill", status: "synced", enabled: true, onToggle }} />
    );
    fireEvent.click(screen.getByRole("switch"));
    expect(onToggle).toHaveBeenCalledWith("skill", "tdd", false);
  });

  it("renders as disabled when enabled is false", async () => {
    const { ResourceNode } = await import("./Graph");
    renderWithProvider(
      <ResourceNode data={{ name: "tdd", type: "skill", status: "synced", enabled: false }} />
    );
    const toggle = screen.getByRole("switch");
    expect(toggle).toHaveAttribute("aria-checked", "false");
  });
});

describe("Graph toggle switches", () => {
  const mockData = {
    tools: [
      { id: "claude-code", name: "Claude Code", status: "synced" as const, installed: true },
    ],
    skills: [
      { name: "tdd", status: "synced" as const, enabled: true, connectedTools: ["claude-code"] },
    ],
    mcps: [
      { name: "git-mcp", status: "synced" as const, enabled: true, connectedTools: ["claude-code"] },
    ],
  };

  it("renders toggle switches and calls onToggle when clicked", async () => {
    const { Graph } = await import("./Graph");
    const onToggle = vi.fn();
    renderWithProvider(<Graph data={mockData} onToggle={onToggle} />);
    const toggles = await screen.findAllByRole("switch", { hidden: true });
    expect(toggles.length).toBeGreaterThan(0);
    fireEvent.click(toggles[0]);
    expect(onToggle).toHaveBeenCalledWith(
      expect.objectContaining({ type: "skill", name: "tdd" })
    );
  });
});
