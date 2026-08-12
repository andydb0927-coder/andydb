import { AgentSkillRegistry, type AgentSkillDefinition } from './agent-skill'
import { builtinAgentSkills } from './builtin-skills'

export interface AgentSkillPlugin {
  id: string
  skills: readonly AgentSkillDefinition[]
}

export interface AgentSkillRuntime {
  definitions: readonly AgentSkillDefinition[]
  registry: AgentSkillRegistry
}

export function loadAgentSkillPlugins(
  plugins: readonly AgentSkillPlugin[] = [],
): AgentSkillRuntime {
  const pluginIds = new Set<string>()
  for (const plugin of plugins) {
    if (pluginIds.has(plugin.id)) {
      throw new Error(`重复的 Agent 插件 id：${plugin.id}`)
    }
    pluginIds.add(plugin.id)
  }
  const definitions = [
    ...builtinAgentSkills,
    ...plugins.flatMap(({ skills }) => skills),
  ]
  return { definitions, registry: new AgentSkillRegistry(definitions) }
}

export const defaultAgentSkillRuntime = loadAgentSkillPlugins()
