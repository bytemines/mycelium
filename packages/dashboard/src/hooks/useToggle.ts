import { useState, useCallback } from "react";

export function useToggle(initialState = false) {
  const [state, setState] = useState(initialState);
  const toggle = useCallback(() => setState(s => !s), []);
  const set = useCallback((v: boolean) => setState(v), []);
  return { state, toggle, set } as const;
}

export function useToggles(initial: Record<string, boolean> = {}) {
  const [state, setState] = useState(initial);
  const toggle = useCallback((key: string) => setState(s => ({ ...s, [key]: !s[key] })), []);
  const set = useCallback((key: string, value: boolean) => setState(s => ({ ...s, [key]: value })), []);
  const setMultiple = useCallback((updates: Record<string, boolean>) => setState(s => ({ ...s, ...updates })), []);
  const reset = useCallback((next: Record<string, boolean>) => setState(next), []);
  return { state, toggle, set, setMultiple, reset } as const;
}
