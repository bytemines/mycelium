/**
 * Anthropic Memory Tool Protocol Types (memory_20250818)
 *
 * Client-side interface for the Anthropic Memory Tool beta.
 * When Mycelium is exposed as an MCP server, it implements this protocol
 * to serve as the memory backend for Claude-powered agents.
 *
 * @see https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool
 */

export const MEMORY_TOOL_TYPE = "memory_20250818" as const;
export const MEMORY_TOOL_BETA_HEADER = "context-management-2025-06-27" as const;

export type MemoryToolCommand = "view" | "create" | "str_replace" | "insert" | "delete" | "rename";

export interface MemoryToolViewInput {
  command: "view";
  path: string;
  view_range?: [number, number];
}

export interface MemoryToolCreateInput {
  command: "create";
  path: string;
  file_text: string;
}

export interface MemoryToolStrReplaceInput {
  command: "str_replace";
  path: string;
  old_str: string;
  new_str: string;
}

export interface MemoryToolInsertInput {
  command: "insert";
  path: string;
  insert_line: number;
  insert_text: string;
}

export interface MemoryToolDeleteInput {
  command: "delete";
  path: string;
}

export interface MemoryToolRenameInput {
  command: "rename";
  old_path: string;
  new_path: string;
}

export type MemoryToolInput =
  | MemoryToolViewInput
  | MemoryToolCreateInput
  | MemoryToolStrReplaceInput
  | MemoryToolInsertInput
  | MemoryToolDeleteInput
  | MemoryToolRenameInput;
