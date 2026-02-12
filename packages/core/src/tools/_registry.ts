import type { ToolDescriptor, Capability, PathSpec, PlatformPaths } from "./_types.js";
import { expandPath } from "../utils.js";
import { claudeCode } from "./claude-code.js";
import { codex } from "./codex.js";
import { geminiCli } from "./gemini-cli.js";
import { opencode } from "./opencode.js";
import { openclaw } from "./openclaw.js";
import { cursor } from "./cursor.js";
import { vscode } from "./vscode.js";
import { antigravity } from "./antigravity.js";

export const TOOL_REGISTRY: Record<string, ToolDescriptor> = {
  [claudeCode.id]: claudeCode,
  [codex.id]: codex,
  [geminiCli.id]: geminiCli,
  [opencode.id]: opencode,
  [openclaw.id]: openclaw,
  [cursor.id]: cursor,
  [vscode.id]: vscode,
  [antigravity.id]: antigravity,
};

export const ALL_TOOL_IDS = Object.keys(TOOL_REGISTRY);
export const TOOL_ID_VALUES = ALL_TOOL_IDS as [string, ...string[]];

export function resolvePath(pathSpec: PathSpec): string | null {
  if (pathSpec === null) return null;
  if (typeof pathSpec === "string") return expandPath(pathSpec);
  const platform = process.platform as keyof PlatformPaths;
  const p = pathSpec[platform] ?? pathSpec.linux;
  return expandPath(p);
}

export function getDescriptor(id: string): ToolDescriptor {
  const desc = TOOL_REGISTRY[id];
  if (!desc) throw new Error(`Unknown tool: ${id}`);
  return desc;
}

export function toolsWithCapability(cap: Capability): ToolDescriptor[] {
  return Object.values(TOOL_REGISTRY).filter(t => t.capabilities.includes(cap));
}

export function validateRegistry(): string[] {
  const errors: string[] = [];
  return errors;
}
