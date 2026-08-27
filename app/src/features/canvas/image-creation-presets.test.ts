import { expect, test } from 'vitest'
import { createFixtureProviderRegistry } from '../../test/provider-fixtures'
import { imageCreationTemplateColumns, imageAiPlaceholderForLabel, resolveImagePreset } from './image-creation-presets'
import { promptCommandsFor } from './prompt-assist'
import { imageAnalysisParameterDefaults } from '../generation/image-analysis-parameters'

test('one catalog preserves the fifteen labels and all four layout groups', () => {
  const groups = imageCreationTemplateColumns.flat()
  expect(groups.map(group => group.title)).toEqual(['分镜叙事', '质感调节', '空间与机位', '设定图'])
  expect(groups.flatMap(group => group.items.map(item => item.label))).toEqual([
    '调度故事板', '故事板', '25宫格连贯分镜', '剧情推演四宫格', '画面推演 - 3秒后', '画面推演 - 5秒前',
    '人像质感调节', '电影级光影校正', '720全景', '多机位九宫格', '角色脸部三视图', '角色设定图', '角色三视图', '场景设定图', '产品设定图',
  ])
})

test('menu and Slash presets route to the same provider/prompt, tools remain local', () => {
  const preset = imageAiPlaceholderForLabel('多机位九宫格')!
  const slash = promptCommandsFor('image').find(command => command.id === 'image-ai-nine-grid')!
  expect(slash.aiProviderId).toBe(preset.providerId)
  expect(slash.promptText).toBe(preset.promptText)
  expect(resolveImagePreset('多机位九宫格')).toMatchObject({ kind: 'analysis', providerId: preset.providerId })
  expect(resolveImagePreset('角色设定图')).toMatchObject({ kind: 'placeholder', providerId: 'setting-image-api' })
  expect(resolveImagePreset('故事板')).toEqual({ kind: 'tool', label: '故事板' })
})

test('analysis defaults read manifest values and saved parameters win without multiplying a preset', () => {
  const provider = createFixtureProviderRegistry().require('multi-camera-grid-api')
  expect(imageAnalysisParameterDefaults(provider)).toMatchObject({ resolution: '1.5K', count: 1 })
  expect(provider.parameterSchema.count).toEqual({ type: 'enum', options: ['1'], defaultValue: '1' })
  expect(imageAnalysisParameterDefaults(provider, { resolution: '2K', useBox: true })).toMatchObject({ resolution: '2K', count: 1, useBox: true })
  const custom = { ...provider, parameterSchema: { ...provider.parameterSchema, resolution: { type: 'enum' as const, options: ['1K'], defaultValue: '1K' } } }
  expect(imageAnalysisParameterDefaults(custom).resolution).toBe('1K')
})
