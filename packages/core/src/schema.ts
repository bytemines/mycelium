/**
 * Zod schemas for Mycelium configuration validation
 */

import { z } from "zod";
import { TOOL_ID_VALUES } from "./tools/_registry.js";

// ============================================================================
// Tool Schemas
// ============================================================================

export const toolIdSchema = z.enum(TOOL_ID_VALUES);

// ============================================================================
// MCP Schemas
// ============================================================================

export const mcpServerConfigSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  enabled: z.boolean().optional().default(true),
  tools: z.array(toolIdSchema).optional(),
  excludeTools: z.array(toolIdSchema).optional(),
});

export const mcpsConfigSchema = z.object({
  mcps: z.record(z.string(), mcpServerConfigSchema),
});

// ============================================================================
// Skill Schemas
// ============================================================================

export const skillManifestSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  version: z.string().optional(),
  author: z.string().optional(),
  tools: z.array(toolIdSchema).optional(),
  excludeTools: z.array(toolIdSchema).optional(),
  enabled: z.boolean().optional().default(true),
});

// ============================================================================
// Manifest Schemas
// ============================================================================

export const manifestSchema = z.object({
  version: z.string(),
  tools: z.record(
    toolIdSchema,
    z.object({
      enabled: z.boolean(),
    })
  ),
});

// ============================================================================
// Machine Override Schemas
// ============================================================================

export const machineOverridesSchema = z.object({
  hostname: z.string(),
  mcps: z.record(z.string(), mcpServerConfigSchema.partial()).optional(),
  skills: z.record(z.string(), skillManifestSchema.partial()).optional(),
});

