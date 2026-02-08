/**
 * Conflict Detector Module
 *
 * Detects conflicting MCP and skill definitions between config levels
 * (global vs project) and generates warnings for the user.
 */

export interface ConfigConflict {
  type: "mcp" | "skill";
  name: string;
  message: string;
  globalValue: unknown;
  projectValue: unknown;
}

export interface PartialConfig {
  mcps?: Record<string, Record<string, unknown>>;
  skills?: Record<string, Record<string, unknown>>;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return false;

  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);

  if (aKeys.length !== bKeys.length) return false;

  return aKeys.every((key) => deepEqual(aObj[key], bObj[key]));
}

/**
 * Detect conflicts between global and project config levels.
 * Returns conflicts where the same key exists in both levels with different values.
 */
export function detectConflicts(
  globalConfig: PartialConfig | undefined | null,
  projectConfig: PartialConfig | undefined | null
): ConfigConflict[] {
  const conflicts: ConfigConflict[] = [];

  const globalMcps = globalConfig?.mcps ?? {};
  const projectMcps = projectConfig?.mcps ?? {};

  for (const name of Object.keys(globalMcps)) {
    if (name in projectMcps && !deepEqual(globalMcps[name], projectMcps[name])) {
      conflicts.push({
        type: "mcp",
        name,
        message: `MCP "${name}" is defined in both global and project configs with different settings. Project config will take priority.`,
        globalValue: globalMcps[name],
        projectValue: projectMcps[name],
      });
    }
  }

  const globalSkills = globalConfig?.skills ?? {};
  const projectSkills = projectConfig?.skills ?? {};

  for (const name of Object.keys(globalSkills)) {
    if (name in projectSkills && !deepEqual(globalSkills[name], projectSkills[name])) {
      conflicts.push({
        type: "skill",
        name,
        message: `Skill "${name}" is defined in both global and project configs with different settings. Project config will take priority.`,
        globalValue: globalSkills[name],
        projectValue: projectSkills[name],
      });
    }
  }

  return conflicts;
}
