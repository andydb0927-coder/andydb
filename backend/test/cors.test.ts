import { describe, expect, it } from 'vitest'

import { createApp } from '../src/app'
import type { WorkerBindings } from '../src/bindings'

const baseEnv: WorkerBindings = {
  DEVICE_TOKEN_SECRET: 'fixture-device-secret-with-enough-entropy',
  ARK_API_KEY: '',
  OPENSPEECH_API_KEY: '',
}

describe('跨域来源白名单', () => {
  it('允许显式配置的来源并回显精确来源', async () => {
    const response = await createApp().request('/api/health', {
      headers: { Origin: 'https://canvas.example.com' },
    }, {
      ...baseEnv,
      CORS_ALLOWED_ORIGINS: 'https://canvas.example.com,https://studio.example.com',
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://canvas.example.com')
    expect(response.headers.get('Vary')).toContain('Origin')
  })

  it('拒绝未在白名单内的跨域来源', async () => {
    const response = await createApp().request('/api/health', {
      headers: { Origin: 'https://attacker.example' },
    }, {
      ...baseEnv,
      CORS_ALLOWED_ORIGINS: 'https://canvas.example.com',
    })

    expect(response.status).toBe(403)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
    await expect(response.json()).resolves.toEqual({
      error: { code: 'CORS_ORIGIN_FORBIDDEN', message: '该来源未获准访问云端服务。' },
    })
  })

  it('未配置白名单时不放行带 Origin 的请求', async () => {
    const response = await createApp().request('/api/health', {
      headers: { Origin: 'https://canvas.example.com' },
    }, baseEnv)

    expect(response.status).toBe(403)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })

  it('不把通配符配置当作显式白名单', async () => {
    const response = await createApp().request('/api/health', {
      headers: { Origin: 'https://canvas.example.com' },
    }, {
      ...baseEnv,
      CORS_ALLOWED_ORIGINS: '*',
    })

    expect(response.status).toBe(403)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })

  it('为允许来源返回受限的 OPTIONS 预检响应', async () => {
    const response = await createApp().request('/api/proxy/image', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://canvas.example.com',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization, content-type',
      },
    }, {
      ...baseEnv,
      CORS_ALLOWED_ORIGINS: 'https://canvas.example.com',
    })

    expect(response.status).toBe(204)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://canvas.example.com')
    expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, PUT, DELETE, OPTIONS')
    expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Authorization, Content-Type')
    expect(response.headers.get('Access-Control-Max-Age')).toBe('600')
  })

  it('拒绝预检请求中的非白名单请求头', async () => {
    const response = await createApp().request('/api/proxy/image', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://canvas.example.com',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization, x-upstream-key',
      },
    }, {
      ...baseEnv,
      CORS_ALLOWED_ORIGINS: 'https://canvas.example.com',
    })

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: { code: 'CORS_PREFLIGHT_FORBIDDEN', message: '跨域预检请求不在允许范围内。' },
    })
  })
})
