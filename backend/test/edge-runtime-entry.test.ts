import { describe, expect, it, vi } from 'vitest'

import worker, { installEdgeFetchListener } from '../src/index'
import type { WorkerBindings } from '../src/bindings'

const bindings: WorkerBindings = {
  DEVICE_TOKEN_SECRET: 'fixture-device-secret-with-enough-entropy',
  INVITE_CODES: 'EDGE-ENTRY',
  ARK_API_KEY: 'fixture-ark-key',
  OPENSPEECH_API_KEY: 'fixture-openspeech-key',
}

describe('边缘运行时双入口', () => {
  it('模块运行时默认导出 fetch 对象', async () => {
    const response = await worker.fetch(new Request('https://fixture.invalid/api/health'), bindings)
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ status: 'ok' })
  })

  it('Service Worker 运行时注册 fetch 监听并复用全局绑定', async () => {
    let listener: ((event: { request: Request; respondWith(value: Promise<Response>): void }) => void) | undefined
    const target = {
      env: bindings,
      addEventListener: vi.fn((type: string, value: typeof listener) => {
        expect(type).toBe('fetch')
        listener = value
      }),
    }
    installEdgeFetchListener(target)
    let responsePromise: Promise<Response> | undefined
    listener?.({
      request: new Request('https://fixture.invalid/api/auth/device', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: 'device-edge-entry', inviteCode: 'EDGE-ENTRY' }),
      }),
      respondWith(value) { responsePromise = value },
    })

    expect(target.addEventListener).toHaveBeenCalledOnce()
    const response = await responsePromise
    expect(response?.status).toBe(200)
  })
})
