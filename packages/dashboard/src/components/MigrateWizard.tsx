import { useState } from "react";

type WizardStep = "scan" | "review" | "apply" | "done";

interface ToolScanDisplay {
  toolId: string;
  toolName: string;
  installed: boolean;
  skillsCount: number;
  mcpsCount: number;
  memoryCount: number;
}

interface ScanItem {
  id: string;
  name: string;
  type: "skill" | "mcp" | "memory";
  source: string;
  conflict?: string;
  checked: boolean;
}

interface MigrateWizardProps {
  onClose?: () => void;
}

export function MigrateWizard({ onClose }: MigrateWizardProps) {
  const [step, setStep] = useState<WizardStep>("scan");
  const [scanning, setScanning] = useState(false);
  const [, setApplying] = useState(false);
  const [tools, setTools] = useState<ToolScanDisplay[]>([]);
  const [items, setItems] = useState<ScanItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [appliedCount, setAppliedCount] = useState(0);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  async function handleScan() {
    setScanning(true);
    setError(null);
    try {
      const res = await fetch("http://localhost:3378/api/migrate/scan");
      const data = await res.json();
      setTools(
        data.map((t: any) => ({
          toolId: t.toolId,
          toolName: t.toolName,
          installed: t.installed,
          skillsCount: t.skills?.length ?? 0,
          mcpsCount: t.mcps?.length ?? 0,
          memoryCount: t.memory?.length ?? 0,
        }))
      );
      const allItems: ScanItem[] = [];
      for (const t of data) {
        for (const s of t.skills ?? []) {
          allItems.push({ id: `${t.toolId}-skill-${s.name}`, name: s.name, type: "skill", source: t.toolName, conflict: s.conflict, checked: true });
        }
        for (const m of t.mcps ?? []) {
          allItems.push({ id: `${t.toolId}-mcp-${m.name}`, name: m.name, type: "mcp", source: t.toolName, conflict: m.conflict, checked: true });
        }
        for (const mem of t.memory ?? []) {
          allItems.push({ id: `${t.toolId}-memory-${mem.name}`, name: mem.name, type: "memory", source: t.toolName, conflict: mem.conflict, checked: true });
        }
      }
      setItems(allItems);
      setStep("review");
    } catch (e: any) {
      setError(e.message ?? "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  async function handleApply() {
    setApplying(true);
    setError(null);
    setStep("apply");
    try {
      const selected = items.filter((i) => i.checked);
      const res = await fetch("http://localhost:3378/api/migrate/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: selected.map((i) => ({ name: i.name, type: i.type, source: i.source })) }),
      });
      const result = await res.json();
      setAppliedCount(result.applied ?? selected.length);
      setStep("done");
    } catch (e: any) {
      setError(e.message ?? "Migration failed");
      setStep("review");
    } finally {
      setApplying(false);
    }
  }

  function toggleItem(id: string) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, checked: !i.checked } : i)));
  }

  function clearAll() {
    setItems((prev) => prev.map((i) => ({ ...i, checked: false })));
    setShowClearConfirm(false);
  }

  const stepLabels: Record<WizardStep, string> = { scan: "Scan", review: "Review", apply: "Apply", done: "Done" };
  const steps: WizardStep[] = ["scan", "review", "apply", "done"];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Step indicator */}
      <div className="flex items-center justify-center gap-2">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
                s === step ? "bg-primary text-primary-foreground" : steps.indexOf(step) > i ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
              }`}
            >
              {i + 1}
            </div>
            <span className="text-sm">{stepLabels[s]}</span>
            {i < steps.length - 1 && <div className="h-px w-8 bg-border" />}
          </div>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-500">{error}</div>
      )}

      {/* Step 1: Scan */}
      {step === "scan" && (
        <div className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
          <h2 className="text-lg font-semibold">Scan for Tools</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Detect installed AI tools and their configurations to migrate into Mycelium.
          </p>
          <button
            onClick={handleScan}
            disabled={scanning}
            className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {scanning ? "Scanning..." : "Start Scan"}
          </button>
        </div>
      )}

      {/* Step 2: Review */}
      {step === "review" && (
        <div className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Review Detected Items</h2>
            <div className="flex gap-2">
              {showClearConfirm ? (
                <>
                  <span className="text-sm text-muted-foreground">Clear all selections?</span>
                  <button onClick={clearAll} className="rounded-md bg-red-500 px-3 py-1 text-sm text-white hover:bg-red-600">
                    Confirm
                  </button>
                  <button onClick={() => setShowClearConfirm(false)} className="rounded-md border px-3 py-1 text-sm hover:bg-muted">
                    Cancel
                  </button>
                </>
              ) : (
                <button onClick={() => setShowClearConfirm(true)} className="rounded-md border px-3 py-1 text-sm hover:bg-muted">
                  Clear All
                </button>
              )}
            </div>
          </div>

          {/* Tool summary */}
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {tools.map((t) => (
              <div key={t.toolId} className="rounded-md border p-3 text-sm">
                <div className="font-medium">{t.toolName}</div>
                <div className="text-muted-foreground">
                  {t.skillsCount} skills, {t.mcpsCount} MCPs, {t.memoryCount} memory
                </div>
              </div>
            ))}
          </div>

          {/* Items list */}
          <div className="mt-4 max-h-64 space-y-1 overflow-y-auto">
            {items.map((item) => (
              <label key={item.id} className="flex items-center gap-3 rounded-md p-2 hover:bg-muted/50">
                <input type="checkbox" checked={item.checked} onChange={() => toggleItem(item.id)} className="rounded" />
                <span className="text-sm font-medium">{item.name}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{item.type}</span>
                <span className="text-xs text-muted-foreground">from {item.source}</span>
                {item.conflict && (
                  <span className="rounded-full bg-yellow-500/10 px-2 py-0.5 text-xs text-yellow-600">conflict: {item.conflict}</span>
                )}
              </label>
            ))}
            {items.length === 0 && <p className="text-sm text-muted-foreground">No items found.</p>}
          </div>

          <div className="mt-4 flex gap-2">
            <button onClick={() => setStep("scan")} className="rounded-md border px-4 py-2 text-sm hover:bg-muted">
              Back
            </button>
            <button
              onClick={handleApply}
              disabled={items.filter((i) => i.checked).length === 0}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              Apply ({items.filter((i) => i.checked).length} items)
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Apply */}
      {step === "apply" && (
        <div className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
          <h2 className="text-lg font-semibold">Applying Migration</h2>
          <div className="mt-4 flex items-center gap-3">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span className="text-sm text-muted-foreground">Migrating configurations...</span>
          </div>
        </div>
      )}

      {/* Step 4: Done */}
      {step === "done" && (
        <div className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
          <h2 className="text-lg font-semibold">Migration Complete</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Successfully migrated {appliedCount} items into Mycelium.
          </p>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => { setStep("scan"); setTools([]); setItems([]); }}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Sync Now
            </button>
            {onClose && (
              <button onClick={onClose} className="rounded-md border px-4 py-2 text-sm hover:bg-muted">
                Close
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
