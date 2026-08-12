// @vitest-environment node

import { describe, expect, test, vi } from 'vitest'

import { createWorkspaceHttpHandler } from './http-handler.js'
import { WORKSPACE_COMMAND_MANIFEST } from './workspace-command.js'

function request(path: string, method = 'GET', body?: unknown, contentType = 'application/json') {
  return new Request(`http://localhost${path}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': contentType },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

describe('workspace HTTP handler', () => {
  test('returns the no-store manifest in the shared success envelope', async () => {
    const handler = createWorkspaceHttpHandler()
    const response = await handler(request('/api/workspace/manifest'))

    expect(response?.status).toBe(200)
    expect(response?.headers.get('cache-control')).toBe('no-store')
    await expect(response?.json()).resolves.toEqual({ schemaVersion: 1, data: WORKSPACE_COMMAND_MANIFEST })
  })

  test('executes a command and returns a versioned data envelope', async () => {
    const execute = vi.fn().mockReturnValue({ filename: 'project.json', content: '{}', mimeType: 'application/json' })
    const handler = createWorkspaceHttpHandler({ execute })
    const response = await handler(request('/api/workspace/execute', 'POST', {
      schemaVersion: 1,
      command: 'workspace.project.export',
      input: { project: {} },
    }))

    expect(execute).toHaveBeenCalledWith('workspace.project.export', { project: {} })
    expect(response?.status).toBe(200)
    await expect(response?.json()).resolves.toEqual({
      schemaVersion: 1,
      data: {
        command: 'workspace.project.export',
        output: { filename: 'project.json', content: '{}', mimeType: 'application/json' },
      },
    })
  })

  test.each([
    ['/api/workspace/manifest', 'POST', 405, 'METHOD_NOT_ALLOWED'],
    ['/api/workspace/execute', 'GET', 405, 'METHOD_NOT_ALLOWED'],
  ])('normalizes method errors for %s', async (path, method, status, code) => {
    const response = await createWorkspaceHttpHandler()(request(path, method))
    expect(response?.status).toBe(status)
    await expect(response?.json()).resolves.toEqual({
      schemaVersion: 1,
      error: { code, message: 'Method not allowed' },
    })
  })

  test.each([
    {
      name: 'unsupported media type',
      request: () => request('/api/workspace/execute', 'POST', {}, 'text/plain'),
      status: 415,
      code: 'UNSUPPORTED_MEDIA_TYPE',
    },
    {
      name: 'invalid JSON',
      request: () => new Request('http://localhost/api/workspace/execute', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: '{',
      }),
      status: 400,
      code: 'INVALID_JSON',
    },
    {
      name: 'invalid envelope',
      request: () => request('/api/workspace/execute', 'POST', { schemaVersion: 2 }),
      status: 400,
      code: 'SCHEMA_VALIDATION_FAILED',
    },
  ])('returns a schema envelope for $name', async ({ request: makeRequest, status, code }) => {
    const response = await createWorkspaceHttpHandler()(makeRequest())
    expect(response?.status).toBe(status)
    expect(await response?.json()).toMatchObject({ schemaVersion: 1, error: { code } })
  })

  test('delegates unknown paths without executing anything', async () => {
    const execute = vi.fn()
    const handler = createWorkspaceHttpHandler({ execute })
    await expect(handler(request('/api/workspace/private'))).resolves.toBeUndefined()
    expect(execute).not.toHaveBeenCalled()
  })
})
