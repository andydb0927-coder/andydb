import { describe, expect, test } from 'vitest'

import type { AgentSkillDefinition } from './agent-skill'
import { builtinAgentSkills } from './builtin-skills'
import { loadAgentSkillPlugins } from './skill-loader'

const contributedSkill: AgentSkillDefinition = {
  id: 'plugin.continuity-check',
  version: 1,
  name: '连续性检查',
  description: '插件测试技能',
  category: 'maintenance',
  outputMode: 'card-or-node',
  inputSchema: { type: 'object', properties: {} },
  execute: () => ({ title: '连续性', summary: '通过', content: '通过', format: 'text' }),
}

describe('Agent skill plugin loading point', () => {
  test('loads built-ins before explicitly supplied local plugin skills', async () => {
    const runtime = loadAgentSkillPlugins([{ id: 'continuity', skills: [contributedSkill] }])

    expect(runtime.definitions.slice(0, builtinAgentSkills.length)).toEqual(builtinAgentSkills)
    expect(runtime.definitions.at(-1)).toBe(contributedSkill)
    await expect(runtime.registry.execute(
      contributedSkill.id,
      {},
      { project: { id: 'p', title: 'p', intent: '', createdAt: '', updatedAt: '', assets: [], nodes: [], edges: [], timeline: [], jobs: [], exportJobs: [] } },
    )).resolves.toMatchObject({ summary: '通过' })
  })

  test('rejects duplicate plugin ids and duplicate skill ids', () => {
    expect(() => loadAgentSkillPlugins([
      { id: 'same', skills: [] },
      { id: 'same', skills: [] },
    ])).toThrow('重复的 Agent 插件 id')
    expect(() => loadAgentSkillPlugins([
      { id: 'override', skills: [builtinAgentSkills[0]!] },
    ])).toThrow('重复的技能 id')
  })
})
