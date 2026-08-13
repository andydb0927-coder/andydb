import { describe, expect, test, vi } from 'vitest'

import { loadWorkspaceManifest } from './workspace-manifest-client'

const validEnvelope = {
  schemaVersion: 1,
  data: {
    schemaVersion: 1,
    namespace: 'wireless-canvas.workspace',
    commands: [{
      id: 'workspace.project.export',
      description: '导出无线画布项目 JSON',
      method: 'POST',
      path: '/api/workspace/execute',
      inputSchemaId: 'input@1',
      outputSchemaId: 'output@1',
      fileFormat: 'wireless-canvas-project@1',
    }],
  },
}

describe('workspace manifest client', () => {
  test('reads and normalizes the same-origin versioned manifest', async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify(validEnvelope), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))

    await expect(loadWorkspaceManifest(request)).resolves.toEqual({
      namespace: 'wireless-canvas.workspace',
      commands: [{ id: 'workspace.project.export', description: '导出无线画布项目 JSON' }],
    })
    expect(request).toHaveBeenCalledWith('/api/workspace/manifest', expect.objectContaining({
      method: 'GET',
      credentials: 'same-origin',
    }))
  })

  test.each([
    ['unavailable response', new Response('', { status: 503 })],
    ['invalid envelope', new Response(JSON.stringify({ schemaVersion: 1, data: { namespace: 'private' } }), { status: 200 })],
  ])('returns one safe error for an %s', async (_case, response) => {
    const request = vi.fn().mockResolvedValue(response)
    await expect(loadWorkspaceManifest(request)).rejects.toThrow('本地 CLI 桥接不可用')
  })
})
