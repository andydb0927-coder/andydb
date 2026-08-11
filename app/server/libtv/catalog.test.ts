import { describe, expect, test, vi } from 'vitest'

import type { CliRunner } from './types.js'
import { loadLibTvCatalog } from './catalog.js'

const projectUuid = '11111111-2222-3333-4444-555555555555'

function runnerWithCatalogResponses(): CliRunner {
  const run = vi.fn<CliRunner['run']>().mockImplementation(async (args) => {
    const command = args.join(' ')
    const stdoutByCommand: Record<string, string> = {
      '--version': '1.1.1\n',
      'account info': JSON.stringify({
        authenticated: true,
        user: {
          name: '王小明',
          email: 'wang@example.com',
          token: 'account-secret',
        },
      }),
      'project list -p 1 -s 50': JSON.stringify({
        projects: [
          {
            uuid: projectUuid,
            name: '低成本验收',
            ownerId: 'owner-123',
            token: 'project-secret',
            icon: 'https://example.com/project-icon.png',
            prefix: 'private-prefix',
            arbitraryResponseField: 'must not reach the browser',
          },
        ],
      }),
      'model search --type image': JSON.stringify({
        models: [
          {
            modelKey: 'image-key',
            modelName: 'Image Model',
            description: '图片',
            ownerId: 'model-owner',
            token: 'image-secret',
            icon: 'https://example.com/image-icon.png',
            prefix: 'image-prefix',
            arbitraryResponseField: 'must not reach the browser',
          },
        ],
      }),
      'model search --type video': JSON.stringify({
        models: [
          {
            modelKey: 'video-key',
            modelName: 'Video Model',
            description: '视频',
            pricingRule: '以提交为准',
            vip: false,
            ownerId: 'model-owner',
            token: 'video-secret',
            icon: 'https://example.com/video-icon.png',
            prefix: 'video-prefix',
            arbitraryResponseField: 'must not reach the browser',
          },
        ],
      }),
    }
    return { stdout: stdoutByCommand[command] ?? '', stderr: '' }
  })

  return { run }
}

describe('LibTV live catalog', () => {
  test('returns only the allowlisted catalog fields', async () => {
    const catalog = await loadLibTvCatalog(runnerWithCatalogResponses(), false)

    expect(catalog).toEqual({
      cliInstalled: true,
      cliVersion: '1.1.1',
      authenticated: true,
      writesEnabled: false,
      projects: [{ uuid: projectUuid, name: '低成本验收' }],
      imageModels: [
        { modelKey: 'image-key', modelName: 'Image Model', description: '图片' },
      ],
      videoModels: [
        {
          modelKey: 'video-key',
          modelName: 'Video Model',
          description: '视频',
          pricingRule: '以提交为准',
          vip: false,
        },
      ],
    })
  })

  test('reports a redacted unavailable catalog after a CLI failure', async () => {
    const runner: CliRunner = {
      run: vi.fn<CliRunner['run']>().mockRejectedValue(
        new Error('spawn /Users/example/.libtv/libtv ENOENT PRIVATE_TOKEN=secret'),
      ),
    }

    const catalog = await loadLibTvCatalog(runner, true)

    expect(catalog).toEqual({
      cliInstalled: false,
      authenticated: false,
      writesEnabled: true,
      projects: [],
      imageModels: [],
      videoModels: [],
      error: 'LibTV CLI is unavailable',
    })
    expect(JSON.stringify(catalog)).not.toContain('/Users/example/.libtv/libtv')
    expect(JSON.stringify(catalog)).not.toContain('PRIVATE_TOKEN')
  })
})
