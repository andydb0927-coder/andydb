import type { GenerationRequest } from '../generation-adapter'

export const arkTextConfigFixture = {
  mode: 'ark-text-dev',
  apiKey: 'fixture-ark-platform-key',
  apiBase: 'https://fixture.ark.invalid/api/v3',
  modelId: 'doubao-seed-2-1-pro-260628',
} as const

export const arkTextGenerationRequestFixture: GenerationRequest = {
  projectId: 'fixture-project',
  nodeId: 'fixture-text-node',
  operation: 'regenerate',
  targetKind: 'text',
  providerId: 'ark-text-llm',
  prompt: '为雨夜重逢的电影预告写一段克制的旁白',
  parameters: {
    outputKind: 'text',
    maxTokens: 1200,
    temperature: 0.7,
    thinking: 'disabled',
    stream: false,
  },
  referenceAssets: [],
}

export const arkScriptGenerationRequestFixture: GenerationRequest = {
  ...arkTextGenerationRequestFixture,
  nodeId: 'fixture-script-node',
  prompt: '一盏河灯引出失踪真相',
  parameters: {
    ...arkTextGenerationRequestFixture.parameters,
    outputKind: 'script',
    sceneCount: 2,
  },
}

export const arkTextCreateRequestFixture = {
  model: 'doubao-seed-2-1-pro-260628',
  messages: [
    {
      role: 'system',
      content:
        '你是中文创作助手。直接输出可用成稿，不要解释推理过程。',
    },
    {
      role: 'user',
      content: '为雨夜重逢的电影预告写一段克制的旁白',
    },
  ],
  max_tokens: 1200,
  temperature: 0.7,
  thinking: { type: 'disabled' },
  stream: false,
} as const

export const arkTextSuccessFixture = {
  id: 'chatcmpl-fixture-text',
  object: 'chat.completion',
  created: 1_778_000_000,
  model: 'doubao-seed-2-1-pro-260628',
  choices: [
    {
      index: 0,
      message: {
        role: 'assistant',
        content: '雨把城市洗得很安静，他们却在同一盏灯下再次看见了彼此。',
      },
      finish_reason: 'stop',
    },
  ],
  usage: {
    prompt_tokens: 42,
    completion_tokens: 28,
    total_tokens: 70,
  },
} as const

export const arkTextSseFixture = [
  'data: {"id":"chatcmpl-fixture-stream","choices":[{"index":0,"delta":{"role":"assistant","content":"雨声"},"finish_reason":null}]}',
  '',
  'data: {"id":"chatcmpl-fixture-stream","choices":[{"index":0,"delta":{"content":"停了，"},"finish_reason":null}]}',
  '',
  'data: {"id":"chatcmpl-fixture-stream","choices":[{"index":0,"delta":{"content":"灯还亮着。"},"finish_reason":null}],"usage":{"prompt_tokens":20,"completion_tokens":9,"total_tokens":29}}',
  '',
  'data: [DONE]',
  '',
].join('\n')

export const arkTextErrorFixtures = {
  unauthorized: {
    status: 401,
    body: { error: { code: 'AuthenticationError', message: 'fixture unauthorized' } },
  },
  forbidden: {
    status: 403,
    body: { error: { code: 'AccessDenied', message: 'fixture forbidden' } },
  },
  rateLimited: {
    status: 429,
    body: { error: { code: 'RateLimitExceeded', message: 'fixture rate limited' } },
  },
  failed: {
    status: 500,
    body: { error: { code: 'InternalServiceError', message: 'fixture failed' } },
  },
  malformed: {
    status: 200,
    body: { choices: [{ message: { role: 'assistant' } }] },
  },
  empty: {
    status: 200,
    body: { choices: [{ message: { role: 'assistant', content: '' } }] },
  },
} as const
