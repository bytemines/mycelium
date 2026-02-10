import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PluginDetailPanel } from "./PluginDetailPanel";

const basePlugin = {
  name: "test-plugin",
  marketplace: "skillsmp",
  version: "1.0.0",
  description: "A test plugin",
  enabled: true,
  skills: ["skill-a", "skill-b"],
  agents: [],
  commands: ["cmd-x"],
  hooks: [],
  libs: [],
};

describe("PluginDetailPanel", () => {
  it("renders item toggle switches for each item", () => {
    render(
      <PluginDetailPanel
        plugin={basePlugin}
        onClose={() => {}}
        onTogglePlugin={() => {}}
      />,
    );
    const switches = screen.getAllByRole("switch");
    // 2 skills + 1 command = 3 switches
    expect(switches).toHaveLength(3);
  });

  it("toggle switches reflect enabled state", () => {
    render(
      <PluginDetailPanel
        plugin={basePlugin}
        onClose={() => {}}
        onTogglePlugin={() => {}}
      />,
    );
    const switches = screen.getAllByRole("switch");
    for (const sw of switches) {
      expect(sw.getAttribute("aria-checked")).toBe("true");
    }
  });

  it("calls onToggleItem when a switch is clicked", () => {
    const onToggleItem = vi.fn();
    render(
      <PluginDetailPanel
        plugin={basePlugin}
        onClose={() => {}}
        onTogglePlugin={() => {}}
        onToggleItem={onToggleItem}
      />,
    );
    const switches = screen.getAllByRole("switch");
    fireEvent.click(switches[0]);
    expect(onToggleItem).toHaveBeenCalledWith("test-plugin", "skill-a", false);
  });

  it("updates switch state optimistically on click", () => {
    render(
      <PluginDetailPanel
        plugin={basePlugin}
        onClose={() => {}}
        onTogglePlugin={() => {}}
      />,
    );
    const switches = screen.getAllByRole("switch");
    fireEvent.click(switches[0]);
    expect(switches[0].getAttribute("aria-checked")).toBe("false");
  });

  it("does not render switches when plugin is null", () => {
    const { container } = render(
      <PluginDetailPanel
        plugin={null}
        onClose={() => {}}
        onTogglePlugin={() => {}}
      />,
    );
    expect(container.innerHTML).toBe("");
  });
});
