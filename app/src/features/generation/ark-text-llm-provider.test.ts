import { describe, expect, test, vi } from 'vitest'

import {
  arkScriptGenerationRequestFixture,
  arkTextConfigFixture,
  arkTextCreateRequestFixture,
  arkTextErrorFixtures,
  arkTextGenerationRequestFixture,
  arkTextSseFixture,
  arkTextSuccessFixture,
} from './fixtures/ark-text-llm.fixture'
import { createArkTextLlmProvider } from './ark-text-llm-provider'

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

function provider(fetchFn: typeof fetch, overrides = {}) {
  return createArkTextLlmProvider({
    ...arkTextConfigFixture,
    fetchFn,
    ...overrides,
  })
}

describe('Ark text LLM live provider', () => {
  test('maps a text node request to Chat Completions and returns a persistent text version', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(arkTextSuccessFixture),
    )
    const progress: number[] = []

    const result = await provider(fetchFn).generate(
      arkTextGenerationRequestFixture,
      {
        signal: new AbortController().signal,
        onProgress: (value) => progress.push(value),
      },
    )

    expect(fetchFn).toHaveBeenCalledOnce()
    expect(fetchFn).toHaveBeenCalledWith(
      'https://fixture.ark.invalid/api/v3/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer fixture-ark-platform-key',
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify(arkTextCreateRequestFixture),
      }),
    )
    expect(result).toMatchObject({
      persistence: 'project',
      asset: { kind: 'text', mimeType: 'text/plain' },
      version: {
        prompt: arkTextGenerationRequestFixture.prompt,
        textContent:
          '雨把城市洗得很安静，他们却在同一盏灯下再次看见了彼此。',
      },
      usage: {
        inputTokens: 42,
        outputTokens: 28,
        totalTokens: 70,
        estimatedCostCny: 0.001092,
      },
    })
    expect(result.version.assetId).toBe(result.asset.id)
    expect(decodeURIComponent(result.asset.url)).toContain('雨把城市')
    expect(progress).toEqual([10, 90, 100])
  })

  test('streams SSE deltas and assembles the final persisted text', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(arkTextSseFixture, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    )

    const result = await provider(fetchFn).generate(
      {
        ...arkTextGenerationRequestFixture,
        parameters: {
          ...arkTextGenerationRequestFixture.parameters,
          stream: true,
        },
      },
      { signal: new AbortController().signal },
    )

    expect(JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body))).toMatchObject({
      stream: true,
      stream_options: { include_usage: true },
    })
    expect(result.version.textContent).toBe('雨声停了，灯还亮着。')
    expect(result.usage).toMatchObject({
      inputTokens: 20,
      outputTokens: 9,
      totalTokens: 29,
    })
  })

  test('uses a script-specific system contract without leaking provider fields into UI data', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        ...arkTextSuccessFixture,
        choices: [{
          index: 0,
          finish_reason: 'stop',
          message: {
            role: 'assistant',
            content: JSON.stringify({ chapters: [
              { title: '场次 01', summary: '河灯漂近桥洞。' },
              { title: '场次 02', summary: '旧案被重新打开。' },
            ] }),
          },
        }],
      }),
    )

    await provider(fetchFn).generate(arkScriptGenerationRequestFixture, {
      signal: new AbortController().signal,
    })

    const body = JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body))
    expect(body.messages[0].content).toContain('2 个场次')
    expect(body.messages[0].content).toContain('JSON')
  })

  test.each([
    ['unauthorized', '文本鉴权失败（401）'],
    ['forbidden', '文本模型无访问权限（403）'],
    ['rateLimited', '文本生成请求过于频繁（429）'],
    ['failed', '文本生成服务暂不可用（500）'],
  ] as const)('maps %s responses to safe Chinese errors', async (key, message) => {
    const fixture = arkTextErrorFixtures[key]
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(fixture.body, { status: fixture.status }),
    )

    await expect(provider(fetchFn).generate(
      arkTextGenerationRequestFixture,
      { signal: new AbortController().signal },
    )).rejects.toThrow(message)
  })

  test.each(['malformed', 'empty'] as const)(
    'rejects %s success payloads without writing a result',
    async (key) => {
      const fixture = arkTextErrorFixtures[key]
      const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
        jsonResponse(fixture.body, { status: fixture.status }),
      )

      await expect(provider(fetchFn).generate(
        arkTextGenerationRequestFixture,
        { signal: new AbortController().signal },
      )).rejects.toThrow('豆包未返回可用文本')
    },
  )

  test('enables only explicit Ark-compatible dev modes and never falls back to Mock', () => {
    const enabledProvider = provider(vi.fn<typeof fetch>())
    expect(enabledProvider).toMatchObject({
      id: 'ark-text-llm',
      kind: 'live',
      modelName: '豆包 Seed 2.1 Pro',
    })
    expect(enabledProvider.disabledReason).toBeUndefined()
    expect(provider(vi.fn<typeof fetch>(), { mode: 'seedream-direct-dev' }).disabledReason)
      .toBeUndefined()
    expect(provider(vi.fn<typeof fetch>(), { mode: 'mock' }).disabledReason)
      .toBe('火山方舟文本开发验证未启用')
    expect(provider(vi.fn<typeof fetch>(), { apiKey: '' }).disabledReason)
      .toBe('火山方舟文本开发验证配置未完成')
  })

  test('forwards cancellation to fetch so timeouts cannot write a late result', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockImplementation(
      async (_input, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('fixture timeout', 'AbortError'))
        }, { once: true })
      }),
    )
    const controller = new AbortController()
    const pending = provider(fetchFn).generate(
      arkTextGenerationRequestFixture,
      { signal: controller.signal },
    )
    controller.abort()

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })
})
