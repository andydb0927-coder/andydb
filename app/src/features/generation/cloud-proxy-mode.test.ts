import { beforeEach, describe, expect, test, vi } from 'vitest'

import { createArkTextLlmProvider } from './ark-text-llm-provider'
import { arkTextGenerationRequestFixture, arkTextSuccessFixture } from './fixtures/ark-text-llm.fixture'
import { seedanceVideoCreateSuccessFixture, seedanceVideoGenerationRequestFixture, seedanceVideoSuccessFixture, seedanceVideoTaskIdFixture } from './fixtures/seedance-video.fixture'
import { seedreamMinLoopGenerationRequestFixture, seedreamMinLoopSuccessFixture } from './fixtures/seedream-min-loop.fixture'
import { createSeedanceVideoProvider } from './seedance-video-provider'
import { createSeedreamLiveProvider } from './seedream-live-provider'

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('cloud proxy generation mode', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('wireless-canvas.cloud.device-token', 'fixture-device-token')
  })

  test('routes image generation through /api/proxy/image without exposing the Ark key', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(seedreamMinLoopSuccessFixture))
    const provider = createSeedreamLiveProvider({
      mode: 'cloud-proxy',
      backendUrl: 'https://cloud.example',
      fetchFn,
    })

    await provider.generate(seedreamMinLoopGenerationRequestFixture, {
      signal: new AbortController().signal,
    })

    expect(fetchFn).toHaveBeenCalledWith(
      'https://cloud.example/api/proxy/image',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer fixture-device-token' }),
      }),
    )
    expect(JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body))).toMatchObject({
      prompt: seedreamMinLoopGenerationRequestFixture.prompt,
      size: '2816x1584',
      referenceImages: [],
    })
    expect(JSON.stringify(fetchFn.mock.calls[0]?.[1]?.headers)).not.toContain('fixture-seedream-api-key')
  })

  test('routes Seedance creation and polling through the authenticated video proxy', async () => {
    const fetchFn = vi.fn<typeof fetch>(async (input) => {
      const url = String(input)
      if (url.endsWith('/api/proxy/video')) return jsonResponse(seedanceVideoCreateSuccessFixture)
      if (url.endsWith(`/api/proxy/video/${seedanceVideoTaskIdFixture}`)) return jsonResponse(seedanceVideoSuccessFixture)
      throw new Error(`unexpected request ${url}`)
    })
    const provider = createSeedanceVideoProvider({
      mode: 'cloud-proxy',
      backendUrl: 'https://cloud.example',
      fetchFn,
      pollIntervalMs: 0,
      maxPollAttempts: 2,
    })

    await provider.generate(seedanceVideoGenerationRequestFixture, {
      signal: new AbortController().signal,
    })

    expect(fetchFn.mock.calls.map(([input]) => String(input))).toEqual([
      'https://cloud.example/api/proxy/video',
      `https://cloud.example/api/proxy/video/${seedanceVideoTaskIdFixture}`,
    ])
    expect(JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body))).toMatchObject({
      prompt: seedanceVideoGenerationRequestFixture.prompt,
      duration: 8,
      aspectRatio: '9:16',
      resolution: '1080p',
      sound: true,
    })
  })

  test('routes non-streaming text generation through /api/proxy/text', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(arkTextSuccessFixture))
    const provider = createArkTextLlmProvider({
      mode: 'cloud-proxy',
      backendUrl: 'https://cloud.example',
      fetchFn,
    })

    await provider.generate(arkTextGenerationRequestFixture, {
      signal: new AbortController().signal,
    })

    expect(fetchFn).toHaveBeenCalledWith(
      'https://cloud.example/api/proxy/text',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer fixture-device-token' }),
      }),
    )
    expect(JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body))).toMatchObject({
      prompt: arkTextGenerationRequestFixture.prompt,
      maxTokens: 1200,
      temperature: 0.7,
    })
  })
})
