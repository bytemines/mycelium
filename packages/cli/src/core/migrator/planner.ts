/**
 * Migration Planner — generates a migration plan from tool scan results
 */
import type {
  ToolScanResult,
  ScannedSkill,
  ScannedMcp,
  ScannedMemory,
  PluginComponent,
  MigrationPlan,
  MigrationConflict,
  ConflictStrategy,
} from "@mycelium/core";

export function generateMigrationPlan(
  scans: ToolScanResult[],
  strategy: ConflictStrategy = "latest",
): MigrationPlan {
  const allSkills: ScannedSkill[] = [];
  const allMcps: ScannedMcp[] = [];
  const allMemory: ScannedMemory[] = [];
  const allComponents: PluginComponent[] = [];
  const conflicts: MigrationConflict[] = [];

  // Collect everything
  for (const scan of scans) {
    allSkills.push(...scan.skills);
    allMcps.push(...scan.mcps);
    allMemory.push(...scan.memory);
    allComponents.push(...(scan.components ?? []));
  }

  // Detect skill conflicts (same name from different tools)
  const skillsByName = new Map<string, ScannedSkill[]>();
  for (const skill of allSkills) {
    const group = skillsByName.get(skill.name) ?? [];
    group.push(skill);
    skillsByName.set(skill.name, group);
  }

  const resolvedSkills: ScannedSkill[] = [];
  for (const [name, group] of skillsByName) {
    if (group.length === 1) {
      resolvedSkills.push(group[0]);
      continue;
    }
    // Conflict
    const conflict: MigrationConflict = {
      name,
      type: "skill",
      entries: group.map((s) => ({
        source: s.source,
        version: s.version,
        lastUpdated: s.lastUpdated,
      })),
    };

    if (strategy === "latest") {
      // Pick newest or first
      const sorted = [...group].sort((a, b) => {
        if (a.lastUpdated && b.lastUpdated) {
          return b.lastUpdated.getTime() - a.lastUpdated.getTime();
        }
        return 0;
      });
      conflict.resolved = { source: sorted[0].source };
      resolvedSkills.push(sorted[0]);
    } else if (strategy === "all") {
      // Namespace as name@toolId
      for (const s of group) {
        resolvedSkills.push({ ...s, name: `${s.name}@${s.source}` });
      }
      conflict.resolved = { source: group[0].source };
    }
    // "interactive" leaves unresolved

    conflicts.push(conflict);
  }

  // Deduplicate MCPs by name
  const mcpsByName = new Map<string, ScannedMcp[]>();
  for (const mcp of allMcps) {
    const group = mcpsByName.get(mcp.name) ?? [];
    group.push(mcp);
    mcpsByName.set(mcp.name, group);
  }

  const resolvedMcps: ScannedMcp[] = [];
  for (const [name, group] of mcpsByName) {
    if (group.length === 1) {
      resolvedMcps.push(group[0]);
      continue;
    }
    // Check if configs differ
    const configStrings = group.map((m) => JSON.stringify(m.config));
    const allSame = configStrings.every((c) => c === configStrings[0]);
    if (allSame) {
      resolvedMcps.push(group[0]);
    } else {
      conflicts.push({
        name,
        type: "mcp",
        entries: group.map((m) => ({
          source: m.source,
          config: m.config,
        })),
        resolved: strategy !== "interactive" ? { source: group[0].source } : undefined,
      });
      if (strategy !== "interactive") {
        resolvedMcps.push(group[0]);
      }
    }
  }

  // Deduplicate components by type+name
  const componentKey = (c: PluginComponent) => `${c.type}:${c.name}`;
  const seenComponents = new Set<string>();
  const resolvedComponents: PluginComponent[] = [];
  for (const comp of allComponents) {
    const key = componentKey(comp);
    if (!seenComponents.has(key)) {
      seenComponents.add(key);
      resolvedComponents.push(comp);
    }
  }

  return {
    skills: resolvedSkills,
    mcps: resolvedMcps,
    memory: allMemory,
    components: resolvedComponents,
    conflicts,
    strategy,
  };
}
