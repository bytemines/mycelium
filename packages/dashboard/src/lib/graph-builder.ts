type Status = "synced" | "pending" | "error" | "disabled";

export interface ScanData {
  toolId: string;
  toolName: string;
  installed: boolean;
  skills: Array<{ name: string; source: string; marketplace?: string; pluginName?: string }>;
  mcps: Array<{ name: string; source: string; config: { command: string } }>;
  memory: Array<{ name: string; source: string }>;
}

export interface MigrateToggleState {
  skills: Record<string, boolean>;
  mcps: Record<string, boolean>;
  memory: Record<string, boolean>;
  tools: Record<string, boolean>;
}

export function buildGraphData(scans: ScanData[], toggleState: MigrateToggleState) {
  // Tools as destinations — installed ones are pre-selected
  const toolSet = new Map<string, { id: string; name: string; installed: boolean }>();
  for (const scan of scans) {
    if (scan.installed) {
      toolSet.set(scan.toolId, { id: scan.toolId, name: scan.toolName, installed: true });
    }
  }

  const tools = Array.from(toolSet.values()).map(t => ({
    id: t.id,
    name: t.name,
    status: (toggleState.tools[t.id] !== false ? "synced" : "disabled") as Status,
    installed: true,
  }));

  // Group skills by plugin
  const pluginMap = new Map<string, { marketplace: string; skills: string[]; enabled: boolean }>();
  const standaloneSkills: Array<{ name: string; status: Status; enabled: boolean; connectedTools: string[] }> = [];

  for (const scan of scans) {
    for (const skill of scan.skills) {
      if (skill.marketplace && skill.pluginName) {
        const key = `${skill.marketplace}/${skill.pluginName}`;
        const existing = pluginMap.get(key);
        if (existing) {
          if (!existing.skills.includes(skill.name)) existing.skills.push(skill.name);
        } else {
          pluginMap.set(key, {
            marketplace: skill.marketplace,
            skills: [skill.name],
            enabled: toggleState.skills[skill.name] !== false,
          });
        }
      } else {
        standaloneSkills.push({
          name: skill.name,
          status: "pending",
          enabled: toggleState.skills[skill.name] !== false,
          connectedTools: [scan.toolId],
        });
      }
    }
  }

  const plugins = Array.from(pluginMap.entries()).map(([key, val]) => {
    const pluginName = key.split("/")[1] || key;
    return {
      name: pluginName,
      marketplace: val.marketplace,
      componentCount: val.skills.length,
      enabled: val.skills.some(s => toggleState.skills[s] !== false),
      skills: val.skills,
    };
  });

  // MCPs — deduplicated by name
  const mcpSeen = new Set<string>();
  const mcps: Array<{ name: string; status: Status; enabled: boolean; connectedTools: string[] }> = [];
  for (const scan of scans) {
    for (const mcp of scan.mcps) {
      if (!mcpSeen.has(mcp.name)) {
        mcpSeen.add(mcp.name);
        mcps.push({
          name: mcp.name,
          status: "pending",
          enabled: toggleState.mcps[mcp.name] !== false,
          connectedTools: [scan.toolId],
        });
      }
    }
  }

  // Memory
  const memSeen = new Set<string>();
  const memory: Array<{ name: string; scope: "shared"; status: Status }> = [];
  for (const scan of scans) {
    for (const mem of scan.memory) {
      if (!memSeen.has(mem.name)) {
        memSeen.add(mem.name);
        memory.push({ name: mem.name, scope: "shared", status: "pending" });
      }
    }
  }

  return { tools, skills: standaloneSkills, mcps, memory, plugins };
}
