import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { SkillDetailPanel } from "./SkillDetailPanel";
import { fetchItemContent } from "@/lib/api";

vi.mock("@/lib/api", () => ({ fetchItemContent: vi.fn() }));
vi.mock("react-syntax-highlighter", () => ({ Prism: () => null }));
vi.mock("react-syntax-highlighter/dist/esm/styles/prism", () => ({ oneDark: {} }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const item = { name: "preview", source: "community", type: "agent" as const, description: "", url: "https://github.com/a/b/tree/main/agents/preview.md" };
const props = { open: true, onOpenChange: vi.fn(), onInstall: vi.fn(), onUpdate: vi.fn(), onRemove: vi.fn() };

describe("SkillDetailPanel audit", () => {
  it("audits preview content with the correct filename and clears results on item change", async () => {
    vi.mocked(fetchItemContent).mockResolvedValue("remote malicious content");
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ safe: false, findings: [{ severity: "high", message: "malicious preview", ruleId: "test", match: "" }] }) });
    vi.stubGlobal("fetch", fetcher);
    const { rerender } = render(<SkillDetailPanel {...props} item={item} />);
    await screen.findByText("remote malicious content");
    fireEvent.click(screen.getByRole("button", { name: "Audit" }));
    await screen.findByText(/malicious preview/);
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ content: "remote malicious content", fileName: "preview.md" });
    rerender(<SkillDetailPanel {...props} item={{ ...item, name: "other" }} />);
    await waitFor(() => expect(screen.queryByText(/malicious preview/)).toBeNull());
  });
  it("does not label a failed audit clean", async () => {
    vi.mocked(fetchItemContent).mockResolvedValue("preview body");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    render(<SkillDetailPanel {...props} item={item} />);
    await screen.findByText("preview body");
    fireEvent.click(screen.getByRole("button", { name: "Audit" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Audit" })).toBeTruthy());
    expect(screen.queryByText(/No security issues/)).toBeNull();
  });
});
