import { expect, test } from 'vitest'
import { parseScriptBreakdown, parseScriptShots, scriptShotRange, buildScriptShotRequest } from './script-workflow'
import { scriptBreakdownFixture, scriptShotsFixture } from './fixtures/script-v2.fixture'
import { createDefaultProviderRegistry } from '../generation/model-provider-registry'
import { makeProjectFixture } from '../../test/fixtures'

test('validates structured chapters, characters and props and resolves shot references', () => {
  const breakdown = parseScriptBreakdown(JSON.stringify(scriptBreakdownFixture))
  expect(breakdown.chapters[0].scenes).toHaveLength(2)
  expect(breakdown.characters[0]).toMatchObject({ id: 'character-1', name: '小舟' })
  const shots = parseScriptShots(JSON.stringify(scriptShotsFixture), breakdown)
  expect(shots[0]).toMatchObject({ sceneId: 'scene-1-1', characterIds: ['character-1'] })
  expect(shots[0].status).toBeUndefined()
})

test.each(['null', '{}', 'not json', JSON.stringify({ ...scriptBreakdownFixture, characters: [{ name: 'x' }] }), JSON.stringify({ ...scriptBreakdownFixture, chapters: [{ title: 'x', summary: 'y', scenes: [] }] })])('rejects malformed breakdown without fabricated fallback: %s', text => {
  expect(() => parseScriptBreakdown(text)).toThrow('剧本拆解结果格式无效')
})

test('rejects unknown scene/character references and oversized shots', () => {
  const breakdown = parseScriptBreakdown(JSON.stringify(scriptBreakdownFixture))
  for (const shot of [{ ...scriptShotsFixture.shots[0], sceneId: 'missing' }, { ...scriptShotsFixture.shots[0], referenceCharacters: ['不存在'] }]) {
    expect(() => parseScriptShots(JSON.stringify({ shots: [shot] }), breakdown)).toThrow('分镜结果格式无效')
  }
  expect(() => parseScriptShots(JSON.stringify({ shots: Array(41).fill(scriptShotsFixture.shots[0]) }), breakdown)).toThrow('分镜结果格式无效')
})

test('selects inclusive shot interval, skips completed results and validates bounds', () => {
  const shots = parseScriptShots(JSON.stringify(scriptShotsFixture), parseScriptBreakdown(JSON.stringify(scriptBreakdownFixture)))
  shots[0].assetId = 'saved-image'
  shots[0].status = 'succeeded'
  expect(scriptShotRange(shots, 1, 2).map(shot => shot.id)).toEqual([shots[1].id])
  for (const [start, end] of [[0, 2], [2, 1], [1, 3], [1.5, 2]]) expect(() => scriptShotRange(shots, start, end)).toThrow('分镜区间')
})

test('builds a one-image request using manifest defaults, editable camera fields and character description', () => {
  const breakdown = parseScriptBreakdown(JSON.stringify(scriptBreakdownFixture))
  const shots = parseScriptShots(JSON.stringify(scriptShotsFixture), breakdown)
  const project = makeProjectFixture()
  const node = { ...project.nodes[0], details: { type: 'script' as const, ...breakdown, shots } }
  const provider = createDefaultProviderRegistry().require('seedream-5-pro-api')
  const request = buildScriptShotRequest(project, node, shots[0], provider, { aspectRatio: '21:9', resolution: '2K' })
  expect(request.parameters).toMatchObject({ count: 1, aspectRatio: '21:9', resolution: '2K', scriptV2Action: 'shot', scriptV2ShotId: shots[0].id })
  expect(request.prompt).toContain('缓慢前推')
  expect(request.prompt).toContain('蓝色外套')
  expect(request.providerId).toBe('seedream-5-pro-api')
})
