/**
 * Manifest Migrator — converts v1 manifest (enabled: boolean) to v2 (state: ItemState)
 */

export interface V1ManifestConfig {
  version?: string;
  skills?: Record<string, Record<string, unknown>>;
  mcps?: Record<string, Record<string, unknown>>;
  hooks?: Record<string, Record<string, unknown>>;
  [key: string]: unknown;
}

type PluginSkillsConfig = Record<string, Record<string, boolean>>;

export function migrateManifestV1ToV2(
  v1: V1ManifestConfig,
  pluginSkills?: PluginSkillsConfig,
): V1ManifestConfig {
  const result = structuredClone(v1);

  for (const section of ["skills", "mcps", "hooks"] as const) {
    const items = result[section];
    if (!items || typeof items !== "object") continue;
    for (const [_name, config] of Object.entries(items as Record<string, Record<string, unknown>>)) {
      // Convert enabled to state
      if (config.enabled === false) {
        config.state = "disabled";
      } else {
        config.state = "enabled";
      }
      delete config.enabled;

      // Add source from pluginName or default to "manual"
      if (!config.source) {
        config.source = (config.pluginName as string) ?? "manual";
      }
    }
  }

  // Import plugin-skills.json overrides
  if (pluginSkills) {
    for (const [_pluginName, skills] of Object.entries(pluginSkills)) {
      for (const [skillName, enabled] of Object.entries(skills)) {
        const skillsSection = result.skills as Record<string, Record<string, unknown>> | undefined;
        if (skillsSection?.[skillName]) {
          skillsSection[skillName].state = enabled ? "enabled" : "disabled";
        }
      }
    }
  }

  return result;
}
