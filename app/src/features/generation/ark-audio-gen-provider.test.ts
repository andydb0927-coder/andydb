import { describe, expect, test, vi } from 'vitest'

import {
  arkAudioConfigFixture,
  arkAudioCreateRequestFixture,
  arkAudioErrorFixtures,
  arkAudioGenerationRequestFixture,
  arkAudioSuccessFixture,
} from './fixtures/ark-audio.fixture'
import { createArkAudioGenProvider } from './ark-audio-gen-provider'

function provider(fetchFn: typeof fetch, overrides = {}) {
  return createArkAudioGenProvider({
    mode: arkAudioConfigFixture.mode,
    apiKey: arkAudioConfigFixture.apiKey,
    apiBase: arkAudioConfigFixture.apiBase,
    modelId: arkAudioConfigFixture.audioModelId,
    fetchFn,
    ...overrides,
  })
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('Ark audio generation live provider', () => {
  test('maps duration into the official prompt and persists base64 audio with billed duration', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(arkAudioSuccessFixture),
    )

    const result = await provider(fetchFn).generate(
      arkAudioGenerationRequestFixture,
      { signal: new AbortController().signal },
    )

    expect(fetchFn).toHaveBeenCalledWith(
      'https://fixture.speech.invalid/api/v3/tts/create',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-Api-Key': 'fixture-speech-api-key',
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify(arkAudioCreateRequestFixture),
      }),
    )
    expect(result).toMatchObject({
      persistence: 'project',
      asset: {
        kind: 'audio',
        mimeType: 'audio/mpeg',
        url: 'data:audio/mpeg;base64,SUQzBAUG',
        durationSeconds: 11.8,
      },
      usage: {
        providerId: 'ark-audio-gen',
        modelName: '豆包音频生成 1.0',
        estimatedCostCny: 0.2,
      },
    })
    expect(result.version.assetId).toBe(result.asset.id)
  })

  test.each([
    ['unauthorized', '豆包音频生成鉴权失败（401）'],
    ['forbidden', '豆包音频生成访问被拒绝（403）'],
    ['rateLimited', '豆包音频生成请求过于频繁（429）'],
    ['failed', '豆包音频生成服务暂不可用（500）'],
  ] as const)('maps %s responses to safe Chinese errors', async (key, message) => {
    const fixture = arkAudioErrorFixtures[key]
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(fixture.body, fixture.status),
    )
    await expect(provider(fetchFn).generate(
      arkAudioGenerationRequestFixture,
      { signal: new AbortController().signal },
    )).rejects.toThrow(message)
  })

  test('rejects a success response without base64 or HTTPS audio', async () => {
    const fixture = arkAudioErrorFixtures.malformedAudio
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(fixture.body, fixture.status),
    )
    await expect(provider(fetchFn).generate(
      arkAudioGenerationRequestFixture,
      { signal: new AbortController().signal },
    )).rejects.toThrow('豆包音频生成未返回可用音频')
  })

  test('forwards AbortSignal and does not issue a second request', async () => {
    const controller = new AbortController()
    const fetchFn = vi.fn<typeof fetch>().mockImplementation(async (_input, init) => {
      expect(init?.signal).toBe(controller.signal)
      controller.abort()
      throw new DOMException('fixture cancelled', 'AbortError')
    })
    await expect(provider(fetchFn).generate(
      arkAudioGenerationRequestFixture,
      { signal: controller.signal },
    )).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchFn).toHaveBeenCalledOnce()
  })
})
