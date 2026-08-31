import { describe, expect, it, vi } from 'vitest'
import { createApp, type AppOptions } from '../src/app'
import type { WorkerBindings } from '../src/bindings'

const env: WorkerBindings = {
  DEVICE_TOKEN_SECRET: 'fixture-device-secret-with-enough-entropy',
  INVITE_CODES: 'FIXTURE-INVITE,SECOND-INVITE',
  ARK_API_KEY: 'fixture-ark-key',
  OPENSPEECH_API_KEY: 'fixture-openspeech-key',
  ARK_API_BASE: 'https://fixture.ark.invalid/api/v3',
  OPENSPEECH_API_BASE: 'https://fixture.speech.invalid/api/v3',
  SEEDREAM_MODEL_ID: 'fixture-seedream',
  SEEDANCE_MODEL_ID: 'fixture-seedance',
  ARK_TEXT_MODEL_ID: 'fixture-doubao',
  OPENSPEECH_RESOURCE_ID: 'fixture-tts-resource',
  DEVICE_TOKEN_TTL_SECONDS: '86400',
  UPSTREAM_TIMEOUT_MS: '15',
}

const proxyCases = [
  {
    name: '图片',
    path: '/api/proxy/image',
    validBody: { prompt: '清晨薄雾中的古桥', size: '1424x800' },
    invalidBody: { prompt: '', size: '1424x800' },
    upstreamUrl: 'https://fixture.ark.invalid/api/v3/images/generations',
    expectedBody: {
      model: 'fixture-seedream',
      prompt: '清晨薄雾中的古桥',
      size: '1424x800',
      response_format: 'url',
      output_format: 'png',
      watermark: false,
    },
  },
  {
    name: '视频',
    path: '/api/proxy/video',
    validBody: {
      prompt: '薄雾缓缓越过石桥',
      duration: 5,
      aspectRatio: '16:9',
      resolution: '720p',
      sound: true,
    },
    invalidBody: { prompt: '测试', duration: 60 },
    upstreamUrl: 'https://fixture.ark.invalid/api/v3/contents/generations/tasks',
    expectedBody: {
      model: 'fixture-seedance',
      content: [{ type: 'text', text: '薄雾缓缓越过石桥' }],
      duration: 5,
      ratio: '16:9',
      resolution: '720p',
      generate_audio: true,
      watermark: false,
    },
  },
  {
    name: '文本',
    path: '/api/proxy/text',
    validBody: {
      prompt: '为古桥写一句分镜描述',
      system: '你是分镜编剧',
      maxTokens: 600,
      temperature: 0.6,
    },
    invalidBody: { prompt: '测试', temperature: 3 },
    upstreamUrl: 'https://fixture.ark.invalid/api/v3/chat/completions',
    expectedBody: {
      model: 'fixture-doubao',
      messages: [
        { role: 'system', content: '你是分镜编剧' },
        { role: 'user', content: '为古桥写一句分镜描述' },
      ],
      max_tokens: 600,
      temperature: 0.6,
      stream: false,
    },
  },
  {
    name: '语音',
    path: '/api/proxy/tts',
    validBody: {
      text: '清晨的薄雾，正缓缓漫过古桥。',
      voice: 'zh_female_vv_uranus_bigtts',
      speed: 1.1,
      volume: 80,
      pitch: 2,
      sampleRate: 24000,
      format: 'mp3',
    },
    invalidBody: { text: '', speed: 1 },
    upstreamUrl: 'https://fixture.speech.invalid/api/v3/tts/unidirectional',
    expectedBody: {
      req_params: {
        text: '清晨的薄雾，正缓缓漫过古桥。',
        speaker: 'zh_female_vv_uranus_bigtts',
        additions: JSON.stringify({ post_process: { pitch: 2 } }),
        audio_params: {
          format: 'mp3',
          sample_rate: 24000,
          speech_rate: 10,
          loudness_rate: 60,
        },
      },
    },
  },
] as const

async function deviceToken(options: AppOptions = {}) {
  const app = createApp(options)
  const response = await app.request('/api/auth/device', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      deviceId: 'fixture-device-0001',
      inviteCode: 'FIXTURE-INVITE',
    }),
  }, env)
  expect(response.status).toBe(200)
  const body = await response.json() as { token: string }
  return body.token
}

async function authorizedRequest(
  path: string,
  body: unknown,
  options: AppOptions = {},
) {
  const token = await deviceToken(options)
  return createApp(options).request(path, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  }, env)
}

describe('设备鉴权', () => {
  it('邀请码错误时返回安全中文错误且不签发 token', async () => {
    const response = await createApp().request('/api/auth/device', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: 'fixture-device-0001',
        inviteCode: 'WRONG',
      }),
    }, env)

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: { code: 'INVITE_CODE_INVALID', message: '邀请码无效或已停用。' },
    })
  })

  it('有效邀请码签发不包含邀请码或服务密钥的设备 token', async () => {
    const token = await deviceToken()

    expect(token).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u)
    expect(token).not.toContain('FIXTURE-INVITE')
    expect(token).not.toContain(env.ARK_API_KEY)
  })
})

describe.each(proxyCases)('$name代理', ({
  path,
  validBody,
  invalidBody,
  upstreamUrl,
  expectedBody,
}) => {
  it('没有设备 token 时在发出上游请求前拒绝', async () => {
    const fetchFn = vi.fn<typeof fetch>()
    const response = await createApp({ fetchFn }).request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBody),
    }, env)

    expect(response.status).toBe(401)
    expect(fetchFn).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toEqual({
      error: { code: 'AUTH_REQUIRED', message: '请先完成设备验证。' },
    })
  })

  it('参数不合法时在发出上游请求前返回中文错误', async () => {
    const fetchFn = vi.fn<typeof fetch>()
    const response = await authorizedRequest(path, invalidBody, { fetchFn })

    expect(response.status).toBe(400)
    expect(fetchFn).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'INVALID_REQUEST' },
    })
  })

  it('只使用 Worker Secret 调用白名单上游并返回成功响应', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response(
      JSON.stringify({ code: 0, data: { id: 'fixture-result' } }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ))
    const response = await authorizedRequest(path, validBody, { fetchFn })

    expect(response.status).toBe(200)
    expect(fetchFn).toHaveBeenCalledOnce()
    const [url, init] = fetchFn.mock.calls[0]!
    expect(url).toBe(upstreamUrl)
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual(expectedBody)
    const headers = new Headers(init?.headers)
    if (path === '/api/proxy/tts') {
      expect(headers.get('X-Api-Key')).toBe(env.OPENSPEECH_API_KEY)
      expect(headers.get('X-Api-Resource-Id')).toBe(env.OPENSPEECH_RESOURCE_ID)
      expect(headers.get('Authorization')).toBeNull()
    } else {
      expect(headers.get('Authorization')).toBe(`Bearer ${env.ARK_API_KEY}`)
      expect(headers.get('X-Api-Key')).toBeNull()
    }
    await expect(response.json()).resolves.toEqual({
      code: 0,
      data: { id: 'fixture-result' },
    })
  })

  it.each([
    [401, 'UPSTREAM_AUTH_FAILED', '上游鉴权失败，请检查服务端Key配置。'],
    [403, 'UPSTREAM_ACCESS_DENIED', '上游服务拒绝访问，请确认资源已开通。'],
    [404, 'UPSTREAM_NOT_FOUND', '模型或接入点不可用。'],
    [429, 'UPSTREAM_RATE_LIMITED', '请求过于频繁。'],
  ] as const)('把上游 %s 映射为安全中文错误', async (
    upstreamStatus,
    code,
    message,
  ) => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response(
      JSON.stringify({ error: { message: 'sensitive upstream detail' } }),
      { status: upstreamStatus, headers: { 'Content-Type': 'application/json' } },
    ))
    const response = await authorizedRequest(path, validBody, { fetchFn })

    expect(response.status).toBe(502)
    const responseText = await response.text()
    expect(JSON.parse(responseText)).toEqual({
      error: { code, message, upstreamStatus },
    })
    expect(responseText).not.toContain('sensitive')
  })

  it.each([
    [403, 'AccountOverdueError', 'UPSTREAM_ACCOUNT_OVERDUE', '火山方舟账号余额不足，请前往控制台充值后重试。'],
    [403, 'AuthenticationError', 'UPSTREAM_AUTH_FAILED', '上游鉴权失败，请检查服务端Key配置。'],
  ] as const)('把上游 %s + %s 精确映射', async (
    upstreamStatus,
    upstreamCode,
    code,
    message,
  ) => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response(
      JSON.stringify({ error: { code: upstreamCode, message: 'sensitive upstream detail' } }),
      { status: upstreamStatus, headers: { 'Content-Type': 'application/json' } },
    ))
    const response = await authorizedRequest(path, validBody, { fetchFn })

    expect(response.status).toBe(502)
    const responseText = await response.text()
    expect(JSON.parse(responseText)).toEqual({
      error: { code, message, upstreamStatus },
    })
    expect(responseText).not.toContain('sensitive')
  })

  it('未识别的上游错误保留通用映射并附带状态码', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response(
      JSON.stringify({ error: { code: 'UnknownProviderError', message: 'sensitive' } }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    ))
    const response = await authorizedRequest(path, validBody, { fetchFn })

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'UPSTREAM_FAILED',
        message: '上游服务暂时不可用，请稍后重试。',
        upstreamStatus: 500,
      },
    })
  })

  it('上游超时映射为 504 中文错误', async () => {
    const fetchFn = vi.fn<typeof fetch>((_input, init) => new Promise((_, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('aborted', 'AbortError'))
      }, { once: true })
    }))
    const response = await authorizedRequest(path, validBody, {
      fetchFn,
      timeoutMs: 5,
    })

    expect(response.status).toBe(504)
    await expect(response.json()).resolves.toEqual({
      error: { code: 'UPSTREAM_TIMEOUT', message: '上游服务响应超时，请稍后重试。' },
    })
  })
})

describe('视频任务轮询代理', () => {
  it('把示例 Seedance 接入点视为未配置且不请求上游', async () => {
    const fetchFn = vi.fn<typeof fetch>()
    const token = await deviceToken({ fetchFn })
    const placeholderEnv: WorkerBindings = {
      ...env,
      SEEDANCE_MODEL_ID: 'replace-with-account-enabled-endpoint-id',
    }
    const response = await createApp({ fetchFn }).request('/api/proxy/video', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(proxyCases[1].validBody),
    }, placeholderEnv)

    expect(response.status).toBe(503)
    expect(fetchFn).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toEqual({
      error: { code: 'PROVIDER_NOT_CONFIGURED', message: '上游服务配置未完成。' },
    })
  })

  it('用设备 token 查询白名单 Seedance 任务端点', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response(
      JSON.stringify({ id: 'task-fixture-0001', status: 'succeeded' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ))
    const token = await deviceToken({ fetchFn })
    const response = await createApp({ fetchFn }).request(
      '/api/proxy/video/task-fixture-0001',
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    )

    expect(response.status).toBe(200)
    expect(fetchFn).toHaveBeenCalledWith(
      'https://fixture.ark.invalid/api/v3/contents/generations/tasks/task-fixture-0001',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: `Bearer ${env.ARK_API_KEY}` }),
      }),
    )
  })
})
