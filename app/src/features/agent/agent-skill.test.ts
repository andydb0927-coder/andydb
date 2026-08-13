import { describe, expect, test } from 'vitest'

import { makeProjectFixture } from '../../test/fixtures'
import {
  AgentSkillExecutionCancelledError,
  AgentSkillOutputError,
  AgentSkillRegistry,
  AgentSkillValidationError,
  createSkillEnablementStore,
  type AgentSkillDefinition,
} from './agent-skill'

const skill: AgentSkillDefinition = {
  id: 'test.echo',
  version: 1,
  name: '回声',
  description: '返回输入',
  category: 'writing',
  outputMode: 'card-or-node',
  inputSchema: {
    type: 'object',
    required: ['message'],
    properties: {
      message: { type: 'string', label: '内容', minLength: 1 },
      count: { type: 'number', label: '数量', minimum: 1, maximum: 3, default: 1 },
      mode: { type: 'string', label: '模式', enum: ['短', '长'], default: '短' },
    },
  },
  execute(input) {
    return {
      title: '回声结果',
      summary: String(input.message),
      content: String(input.message).repeat(Number(input.count)),
      format: 'text',
    }
  },
}

describe('Agent skill registry', () => {
  test('registers definitions and executes validated input with defaults', async () => {
    const registry = new AgentSkillRegistry([skill])

    await expect(
      registry.execute('test.echo', { message: '你好' }, { project: makeProjectFixture() }),
    ).resolves.toEqual({
      title: '回声结果',
      summary: '你好',
      content: '你好',
      format: 'text',
    })
    expect(registry.list()).toEqual([skill])
  })

  test('rejects duplicate ids, unknown fields, missing fields and out-of-range values', async () => {
    expect(() => new AgentSkillRegistry([skill, skill])).toThrow('重复的技能 id')
    const registry = new AgentSkillRegistry([skill])
    const context = { project: makeProjectFixture() }

    await expect(registry.execute('missing', {}, context)).rejects.toBeInstanceOf(
      AgentSkillValidationError,
    )
    await expect(registry.execute('test.echo', {}, context)).rejects.toThrow('缺少必填字段')
    await expect(
      registry.execute('test.echo', { message: 'a', count: 4 }, context),
    ).rejects.toThrow('必须小于或等于 3')
    await expect(
      registry.execute('test.echo', { message: 'a', private: 'x' }, context),
    ).rejects.toThrow('不支持的字段')
  })

  test('rejects malformed plugin output with a stable output error', async () => {
    const invalid = {
      ...skill,
      id: 'test.invalid-output',
      execute: () => ({ title: ' ', summary: '摘要', content: '正文', format: 'text' as const }),
    }

    await expect(
      new AgentSkillRegistry([invalid]).execute(
        invalid.id,
        { message: '你好' },
        { project: makeProjectFixture() },
      ),
    ).rejects.toBeInstanceOf(AgentSkillOutputError)
  })

  test('discards an asynchronous result when its signal is cancelled', async () => {
    let resolveResult!: (value: Awaited<ReturnType<AgentSkillDefinition['execute']>>) => void
    const pendingSkill: AgentSkillDefinition = {
      ...skill,
      id: 'test.pending',
      execute: () => new Promise((resolve) => { resolveResult = resolve }),
    }
    const controller = new AbortController()
    const execution = new AgentSkillRegistry([pendingSkill]).execute(
      pendingSkill.id,
      { message: '你好' },
      { project: makeProjectFixture(), signal: controller.signal },
    )

    controller.abort()
    resolveResult({ title: '过期', summary: '过期', content: '过期', format: 'text' })
    await expect(execution).rejects.toBeInstanceOf(AgentSkillExecutionCancelledError)
  })
})

describe('skill enablement store', () => {
  test('defaults all registered skills to enabled and persists explicit changes', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    }
    const first = createSkillEnablementStore(storage, [skill])

    expect(first.isEnabled(skill.id)).toBe(true)
    first.setEnabled(skill.id, false)

    const restored = createSkillEnablementStore(storage, [skill])
    expect(restored.isEnabled(skill.id)).toBe(false)
    restored.setEnabled(skill.id, true)
    expect(restored.isEnabled(skill.id)).toBe(true)
  })

  test('ignores malformed and stale stored ids', () => {
    const storage = {
      getItem: () => JSON.stringify({ version: 1, disabled: ['missing', 42] }),
      setItem: () => undefined,
    }
    expect(createSkillEnablementStore(storage, [skill]).isEnabled(skill.id)).toBe(true)
  })
})
