/**
 * Dashboard Component Tests - Written FIRST following TDD
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

describe("Dashboard", () => {
  it("renders the header with title", async () => {
    const { Dashboard } = await import("./Dashboard");
    render(<Dashboard />);
    expect(screen.getByText("MYCELIUM")).toBeInTheDocument();
  });

  it("renders status indicators", async () => {
    const { Dashboard } = await import("./Dashboard");
    render(<Dashboard />);
    // Multiple status indicators: header + each stats card
    const indicators = screen.getAllByTestId("status-indicator");
    expect(indicators.length).toBeGreaterThanOrEqual(1);
  });

  it("renders sync button", async () => {
    const { Dashboard } = await import("./Dashboard");
    render(<Dashboard />);
    expect(screen.getByRole("button", { name: /sync/i })).toBeInTheDocument();
  });

  it("renders the graph container", async () => {
    const { Dashboard } = await import("./Dashboard");
    render(<Dashboard />);
    expect(screen.getByTestId("graph-container")).toBeInTheDocument();
  });

  it("renders stats cards for skills, mcps, memory, machines", async () => {
    const { Dashboard } = await import("./Dashboard");
    render(<Dashboard />);
    expect(screen.getByText("Skills")).toBeInTheDocument();
    expect(screen.getByText("MCPs")).toBeInTheDocument();
    expect(screen.getByText("Memory")).toBeInTheDocument();
    expect(screen.getByText("Machines")).toBeInTheDocument();
  });
});
