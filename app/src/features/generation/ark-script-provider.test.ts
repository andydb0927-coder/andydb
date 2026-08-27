import { expect, test, vi } from 'vitest'
import { createArkScriptProviders } from './ark-script-provider'
import { scriptBreakdownFixture, scriptChatFixture, scriptShotsFixture, scriptV2ConfigFixture as config } from '../script/fixtures/script-v2.fixture'
import { parseScriptBreakdown } from '../script/script-workflow'
import type { GenerationRequest } from './generation-adapter'

const request: GenerationRequest = { projectId: 'p', nodeId: 's', operation: 'regenerate', targetKind: 'text', prompt: '小舟提灯走上清晨的古桥', referenceAssets: [], parameters: { scriptV2Action: 'breakdown' } }

test('reuses chat completions transport and freezes a validated breakdown before returning persistable data', async () => {
  const fetchFn = vi.fn<typeof fetch>(async () => Response.json(scriptChatFixture(scriptBreakdownFixture)))
  const provider = createArkScriptProviders({ ...config, fetchFn })[0]
  const result = await provider.generate(request, { signal: new AbortController().signal })
  expect(fetchFn).toHaveBeenCalledTimes(1)
  expect(fetchFn.mock.calls[0][0]).toBe(`${config.apiBase}/chat/completions`)
  expect(JSON.parse(String(fetchFn.mock.calls[0][1]?.body))).toMatchObject({ max_tokens: 4096, temperature: 0.2, stream: false, thinking: { type: 'disabled' } })
  expect(result.persistence).toBe('project')
  expect(JSON.parse(result.version.textContent!).characters[0].name).toBe('小舟')
  expect(result.usage).toMatchObject({ inputTokens: 200, outputTokens: 300 })
})

test('storyboard contract includes scene/character context and rejects invalid references', async () => {
  const fetchFn = vi.fn<typeof fetch>(async () => Response.json(scriptChatFixture(scriptShotsFixture)))
  const provider = createArkScriptProviders({ ...config, fetchFn })[1]
  const parameters = { scriptV2Action: 'storyboard', scriptContext: JSON.stringify(parseScriptBreakdown(JSON.stringify(scriptBreakdownFixture))) }
  const result = await provider.generate({ ...request, parameters }, { signal: new AbortController().signal })
  expect(JSON.parse(result.version.textContent!).shots).toHaveLength(2)
  expect(String(fetchFn.mock.calls[0][1]?.body)).toContain('scene-1-1')
  fetchFn.mockResolvedValueOnce(Response.json(scriptChatFixture({ shots: [{ ...scriptShotsFixture.shots[0], sceneId: 'missing' }] })))
  await expect(provider.generate({ ...request, parameters }, { signal: new AbortController().signal })).rejects.toThrow('分镜结果格式无效')
})

test.each([401, 403, 429, 500])('sanitizes HTTP %s and never returns fake success', async status => {
  const provider = createArkScriptProviders({ ...config, fetchFn: vi.fn(async () => new Response('private-key upstream-detail', { status })) })[0]
  await expect(provider.generate(request, { signal: new AbortController().signal })).rejects.not.toThrow('private-key')
  await expect(provider.generate(request, { signal: new AbortController().signal })).rejects.toThrow()
})

test('offline/disabled and aborted operations never send a request', async () => {
  const fetchFn = vi.fn<typeof fetch>()
  await expect(createArkScriptProviders({ ...config, mode: 'mock', fetchFn })[0].generate(request, { signal: new AbortController().signal })).rejects.toThrow('配置')
  const controller = new AbortController(); controller.abort()
  await expect(createArkScriptProviders({ ...config, fetchFn })[0].generate(request, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
  expect(fetchFn).not.toHaveBeenCalled()
})

test('storyboard validates against persisted scene identities rather than renumbering edited chapters', async () => {
  const source = parseScriptBreakdown(JSON.stringify(scriptBreakdownFixture))
  source.chapters[0].scenes![0].id = 'scene-previous-chapter-4'
  const fetchFn = vi.fn<typeof fetch>(async () => Response.json(scriptChatFixture({ shots: [{ ...scriptShotsFixture.shots[0], sceneId: 'scene-previous-chapter-4' }] })))
  const provider = createArkScriptProviders({ ...config, fetchFn })[1]
  const result = await provider.generate({ ...request, parameters: { scriptContext: JSON.stringify(source) } }, { signal: new AbortController().signal })
  expect(JSON.parse(result.version.textContent!).shots[0].sceneId).toBe('scene-previous-chapter-4')
})
