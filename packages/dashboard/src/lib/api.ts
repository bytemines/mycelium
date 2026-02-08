import type { ToggleAction, DashboardState } from "@mycelium/core";

const API_BASE = "http://localhost:3378";

export async function fetchDashboardState(): Promise<DashboardState> {
  const res = await fetch(`${API_BASE}/api/state`);
  return res.json();
}

export async function sendToggle(action: ToggleAction): Promise<void> {
  await fetch(`${API_BASE}/api/toggle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(action),
  });
}
