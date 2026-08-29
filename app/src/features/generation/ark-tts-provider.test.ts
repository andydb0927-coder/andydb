import { describe, expect, test, vi } from 'vitest'

import {
  arkAudioConfigFixture,
  arkAudioErrorFixtures,
  arkTtsCreateRequestFixture,
  arkTtsGenerationRequestFixture,
  arkTtsSuccessFixture,
} from './fixtures/ark-audio.fixture'
import { createArkTtsProvider } from './ark-tts-provider'

function provider(fetchFn: typeof fetch, overrides = {}) {
  return createArkTtsProvider({
    mode: arkAudioConfigFixture.mode,
    apiKey: arkAudioConfigFixture.apiKey,
    apiBase: arkAudioConfigFixture.apiBase,
    modelId: arkAudioConfigFixture.ttsModelId,
    fetchFn,
    ...overrides,
  })
}

describe('Ark TTS live provider', () => {
  test('maps voice controls to the official chunked contract and persists all audio chunks', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(arkTtsSuccessFixture, { status: 200 }),
    )
    const progress: number[] = []

    const result = await provider(fetchFn).generate(
      arkTtsGenerationRequestFixture,
      {
        signal: new AbortController().signal,
        onProgress: (value) => progress.push(value),
      },
    )

    expect(fetchFn).toHaveBeenCalledWith(
      'https://fixture.speech.invalid/api/v3/tts/unidirectional',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-Api-Key': 'fixture-speech-api-key',
          'X-Api-Resource-Id': 'seed-tts-2.0',
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify(arkTtsCreateRequestFixture),
      }),
    )
    expect(result).toMatchObject({
      persistence: 'project',
      asset: {
        kind: 'audio',
        mimeType: 'audio/mpeg',
        url: 'data:audio/mpeg;base64,SUQzBAUG',
      },
      version: { prompt: arkTtsGenerationRequestFixture.prompt },
      usage: {
        providerId: 'ark-tts',
        modelName: '豆包语音合成 2.0',
        estimatedCostCny: 0.0018,
      },
    })
    expect(result.version.assetId).toBe(result.asset.id)
    expect(progress).toEqual([10, 90, 100])
  })

  test.each([
    ['unauthorized', '豆包语音合成鉴权失败（401）'],
    ['forbidden', '豆包语音合成访问被拒绝（403）'],
    ['rateLimited', '豆包语音合成请求过于频繁（429）'],
    ['failed', '豆包语音合成服务暂不可用（500）'],
  ] as const)('maps %s responses to safe Chinese errors', async (key, message) => {
    const fixture = arkAudioErrorFixtures[key]
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(fixture.body), { status: fixture.status }),
    )
    await expect(provider(fetchFn).generate(
      arkTtsGenerationRequestFixture,
      { signal: new AbortController().signal },
    )).rejects.toThrow(message)
  })

  test('rejects a success response without audio and never returns an unpersistable blob URL', async () => {
    const fixture = arkAudioErrorFixtures.malformedTts
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(fixture.body, { status: fixture.status }),
    )
    await expect(provider(fetchFn).generate(
      arkTtsGenerationRequestFixture,
      { signal: new AbortController().signal },
    )).rejects.toThrow('豆包语音合成未返回音频')
  })

  test('uses the official speech host when the shared base is the Ark host', () => {
    expect(provider(vi.fn<typeof fetch>(), {
      apiBase: 'https://ark.cn-beijing.volces.com/api/v3',
    }).officialApiEndpoint).toBe(
      'https://openspeech.bytedance.com/api/v3/tts/unidirectional',
    )
  })

  test('is gated by the shared development mode and API key', () => {
    expect(provider(vi.fn<typeof fetch>()).disabledReason).toBeUndefined()
    expect(provider(vi.fn<typeof fetch>(), { mode: 'mock' }).disabledReason)
      .toBe('火山方舟豆包语音开发验证未启用')
    expect(provider(vi.fn<typeof fetch>(), { apiKey: '' }).disabledReason)
      .toBe('豆包语音合成待专用资源授权：请配置 Speech API Key')
  })

  test('does not treat the shared Ark key as a dedicated Speech API key', () => {
    vi.stubEnv('VITE_SEEDREAM_API_KEY', 'fixture-ark-only-key')
    vi.stubEnv('VITE_ARK_TTS_API_KEY', '')
    try {
      const liveProvider = createArkTtsProvider({
        mode: 'seedream-direct-dev',
      })
      expect(liveProvider.disabledReason).toBe(
        '豆包语音合成待专用资源授权：请配置 Speech API Key',
      )
    } finally {
      vi.stubEnv('VITE_SEEDREAM_API_KEY', '')
      vi.stubEnv('VITE_ARK_TTS_API_KEY', '')
    }
  })
})
