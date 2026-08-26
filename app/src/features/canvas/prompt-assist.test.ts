import { describe, expect, test } from 'vitest'

import {
  executePromptCommand,
  matchAutoLinkCandidates,
  promptCommandsFor,
  replaceSlashQuery,
  slashQuery,
} from './prompt-assist'

describe('prompt slash commands', () => {
  test('discovers a slash query and executes every registered image command', () => {
    expect(slashQuery('雨夜 / 电影')).toBe('电影')
    const commands = promptCommandsFor('image')

    expect(commands.map(({ section }) => section)).toEqual(
      expect.arrayContaining(['preset', 'tool', 'parameter']),
    )
    for (const command of commands) {
      const result = executePromptCommand(command, `场景 /${command.slash}`)
      expect(result.prompt).not.toContain(`/${command.slash}`)
      expect(
        result.prompt.trim() ||
          result.createNodeKind ||
          Object.keys(result.imageSettings ?? {}).length,
      ).toBeTruthy()
    }
  })

  test('replaces only the active slash expression', () => {
    expect(replaceSlashQuery('保留/旧词 最后/竖屏', '竖屏电影构图')).toBe(
      '保留/旧词 最后竖屏电影构图',
    )
  })

  test('registers the five image AI presets as guarded placeholder commands', () => {
    const aiCommands = promptCommandsFor('image').filter(
      ({ aiProviderId }) => aiProviderId,
    )
    expect(aiCommands.map(({ slash }) => slash)).toEqual([
      '九宫格',
      '四宫格',
      '25宫格',
      '光影',
      '设定图',
    ])
    expect(aiCommands.every(({ promptText }) => Boolean(promptText))).toBe(true)
  })
})

describe('local AutoLink retrieval', () => {
  const candidates = [
    {
      nodeId: 'character-lin',
      title: '林苑角色',
      kind: 'character' as const,
      tags: ['雨夜', '黑色风衣', '人物'],
    },
    {
      nodeId: 'asset-bridge',
      title: '古桥薄雾',
      kind: 'image' as const,
      tags: ['清晨', '古桥', '薄雾'],
    },
  ]

  test('matches title and tags locally, excludes existing references, and ranks exact hits', () => {
    expect(matchAutoLinkCandidates('雨夜里的林苑', candidates).map(({ nodeId }) => nodeId)).toEqual([
      'character-lin',
    ])
    expect(matchAutoLinkCandidates('清晨薄雾', candidates, new Set(['asset-bridge']))).toEqual([])
  })
})
