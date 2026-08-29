import { createDefaultProviderRegistry } from '../features/generation/model-provider-registry'
import type { ProviderRegistry } from '../features/generation/model-provider-registry'
import type { GenerationAdapter } from '../features/generation/generation-adapter'

/** Queue/cancellation unit tests address the hidden executor explicitly. */
export function createLifecycleAdapterFixture(registry: ProviderRegistry): GenerationAdapter {
  return {
    describe: (request) => registry.describe(request),
    start: (request, signal, onProgress) => registry.generate(
      { ...request, providerId: 'internal-demo' }, { signal, onProgress },
    ),
  }
}

/** Real adapters + fixture-only transport. No product-visible demo models. */
export function createFixtureProviderRegistry() {
  let sequence = 0
  const fetchFn: typeof fetch = async (input, init) => {
    const url = String(input)
    if (!url.startsWith('https://fixture.ark.invalid/')) {
      throw new Error(`Unexpected network in provider fixture: ${url}`)
    }
    init?.signal?.throwIfAborted()
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {}
    if (url.endsWith('/images/generations')) {
      return Response.json({ data: [{ url: `https://media.fixture.invalid/image-${++sequence}.png`, size: body.size }] })
    }
    if (url.endsWith('/chat/completions')) {
      const script = String(body.messages?.[0]?.content).includes('chapters')
      const prompt = body.messages?.at(-1)?.content ?? ''
      return Response.json({
        choices: [{ message: { content: script
          ? JSON.stringify({ chapters: [{ title: '场次 01', summary: prompt }] })
          : `已生成文本：${prompt}` } }],
        usage: { prompt_tokens: 20, completion_tokens: 30, total_tokens: 50 },
      })
    }
    if (url.endsWith('/contents/generations/tasks')) {
      return Response.json({ id: `fixture-task-${++sequence}` })
    }
    if (url.includes('/contents/generations/tasks/')) {
      return Response.json({ status: 'succeeded', content: { video_url: 'https://media.fixture.invalid/video.mp4' }, duration: 5 })
    }
    if (url.endsWith('/tts/unidirectional')) {
      return new Response(JSON.stringify({ code: 0, data: 'SUQzBAUG', usage: { text_words: 6 } }))
    }
    if (url.endsWith('/tts/create')) {
      return Response.json({ audio: 'SUQzBAUG', duration: 12 })
    }
    throw new Error(`Missing fixture: ${url}`)
  }
  const options = { mode: 'seedream-direct-dev', apiKey: 'fixture-only', apiBase: 'https://fixture.ark.invalid/api/v3', fetchFn }
  return createDefaultProviderRegistry({
    seedream: options,
    seedanceVideo: { ...options, modelId: 'doubao-seedance-2-0-260128', pollIntervalMs: 0 },
    arkText: options,
    arkTts: options,
    arkAudio: options,
  })
}
