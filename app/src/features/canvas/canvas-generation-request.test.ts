import { expect, test } from 'vitest'
import { makeProjectFixture } from '../../test/fixtures'
import { createFixtureProviderRegistry } from '../../test/provider-fixtures'
import { buildGenerationRequest, generationEligibilityFailure, forceDemoProvider } from './canvas-generation-request'

test('extracted builder retains provider defaults, prompt and reference without mutating project', () => {
  const project = makeProjectFixture(), snapshot = structuredClone(project)
  const registry = createFixtureProviderRegistry()
  const request = buildGenerationRequest(project, project.nodes[0], 'regenerate', '古桥', registry)
  expect(request).toMatchObject({ projectId: project.id, nodeId: 'shot-1', targetKind: 'image', providerId: 'seedream-5-pro-api', prompt: '古桥' })
  expect(request.referenceAssets).toEqual([{ kind: 'image', mimeType: 'image/png', url: '/demo/shot-river.png' }])
  expect(project).toEqual(snapshot)
  expect(generationEligibilityFailure(request, registry)).toBeUndefined()
  expect(generationEligibilityFailure({ ...request, prompt: '', referenceAssets: [] }, registry)).toBe('请输入提示词或添加参考素材后再生成。')
})

test('whole-group execution remains demo-only and text-to-video clears references', () => {
  const project = makeProjectFixture(), registry = createFixtureProviderRegistry()
  const node = { ...project.nodes[0], generationConfig: { targetKind: 'video' as const, providerId: 'seedance-api', parameters: { generationMode: '文生视频' }, referenceAssets: [{ kind: 'image' as const, mimeType: 'image/png', url: '/source.png' }] } }
  const request = buildGenerationRequest(project, node, 'generate-video', '古桥', registry)
  expect(request.referenceAssets).toEqual([])
  expect(forceDemoProvider(request)).toEqual({ ...request, providerId: 'internal-demo' })
  expect(request.providerId).toBe('seedance-api')
})
