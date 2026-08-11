import { describe, expect, test, vi } from 'vitest'

import type { CliRunner } from './types.js'
import { loadLibTvCatalog } from './catalog.js'

const projectUuid = '11111111-2222-3333-4444-555555555555'

const realCliStdout = {
  '--version': '1.1.1\n',
  'account info': JSON.stringify({
    accountsCount: 1,
    activeAccount: {
      id: 'account-123',
      name: '默认账户',
      token: 'active-account-secret',
    },
    teamId: 'team-123',
    user: {
      id: 'user-123',
      name: '王小明',
      email: 'wang@example.com',
      token: 'user-secret',
    },
  }),
  'project list -p 1 -s 50': JSON.stringify({
    projectMetaList: [
      {
        uuid: projectUuid,
        name: '低成本验收',
        id: 'project-123',
        ownerId: 'owner-123',
        token: 'project-secret',
        icon: 'https://example.com/project-icon.png',
        prefix: 'private-project-prefix',
        arbitraryResponseField: 'project-private-extra',
      },
    ],
    total: 1,
  }),
  'model search --type image': JSON.stringify({
    matchKind: 'model',
    matches: [
      {
        modelKey: 'image-key',
        modelName: 'Image Model',
        description: '图片',
        ownerId: 'image-owner',
        token: 'image-secret',
        icon: 'https://example.com/image-icon.png',
        prefix: 'private-image-prefix',
        arbitraryResponseField: 'image-private-extra',
      },
    ],
    nodeType: 'image',
    query: '',
  }),
  'model search --type video': JSON.stringify({
    matchKind: 'model',
    matches: [
      {
        modelKey: 'video-key',
        modelName: 'Video Model',
        description: '视频',
        pricingRule: '以提交为准',
        vip: false,
        ownerId: 'video-owner',
        token: 'video-secret',
        icon: 'https://example.com/video-icon.png',
        prefix: 'private-video-prefix',
        arbitraryResponseField: 'video-private-extra',
      },
    ],
    nodeType: 'video',
    query: '',
  }),
} satisfies Record<string, string>

function runnerWithCatalogResponses(
  overrides: Partial<Record<keyof typeof realCliStdout, string>> = {},
): CliRunner {
  const stdoutByCommand: Record<string, string> = { ...realCliStdout, ...overrides }
  const run = vi.fn<CliRunner['run']>().mockImplementation(async (args) => ({
    stdout: stdoutByCommand[args.join(' ')] ?? '',
    stderr: '',
  }))
  return { run }
}

describe('LibTV live catalog', () => {
  test('authenticates from a non-null user in the real account envelope', async () => {
    const catalog = await loadLibTvCatalog(runnerWithCatalogResponses(), false)

    expect(catalog.authenticated).toBe(true)
  })

  test('does not authenticate when the real account envelope has a null user', async () => {
    const accountInfo = JSON.stringify({
      accountsCount: 0,
      activeAccount: null,
      teamId: null,
      user: null,
    })

    const catalog = await loadLibTvCatalog(
      runnerWithCatalogResponses({ 'account info': accountInfo }),
      false,
    )

    expect(catalog.authenticated).toBe(false)
  })

  test('maps projectMetaList to allowlisted project summaries', async () => {
    const catalog = await loadLibTvCatalog(runnerWithCatalogResponses(), false)

    expect(catalog.projects).toEqual([{ uuid: projectUuid, name: '低成本验收' }])
  })

  test('maps image matches to allowlisted model summaries', async () => {
    const catalog = await loadLibTvCatalog(runnerWithCatalogResponses(), false)

    expect(catalog.imageModels).toEqual([
      { modelKey: 'image-key', modelName: 'Image Model', description: '图片' },
    ])
  })

  test('maps video matches to allowlisted model summaries', async () => {
    const catalog = await loadLibTvCatalog(runnerWithCatalogResponses(), false)

    expect(catalog.videoModels).toEqual([
      {
        modelKey: 'video-key',
        modelName: 'Video Model',
        description: '视频',
        pricingRule: '以提交为准',
        vip: false,
      },
    ])
  })

  test('returns exactly the safe live catalog without sensitive source fields', async () => {
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
    const serialized = JSON.stringify(catalog)
    for (const sensitiveValue of [
      '王小明',
      'wang@example.com',
      'owner-123',
      'user-secret',
      'project-secret',
      'image-secret',
      'video-secret',
      'project-icon.png',
      'private-project-prefix',
      'project-private-extra',
    ]) {
      expect(serialized).not.toContain(sensitiveValue)
    }
  })

  test('normalizes a single-line v-prefixed semantic version', async () => {
    const catalog = await loadLibTvCatalog(
      runnerWithCatalogResponses({ '--version': 'v1.1.1\n' }),
      false,
    )

    expect(catalog.cliVersion).toBe('1.1.1')
  })

  test.each([
    ['LF', '1.1.1\n\n'],
    ['CRLF', '1.1.1\r\n\r\n'],
  ])('rejects an extra physical %s version line', async (_lineEnding, versionStdout) => {
    const catalog = await loadLibTvCatalog(
      runnerWithCatalogResponses({ '--version': versionStdout }),
      false,
    )

    expect(catalog).toEqual({
      cliInstalled: true,
      authenticated: false,
      writesEnabled: false,
      projects: [],
      imageModels: [],
      videoModels: [],
      error: 'LibTV CLI version response is invalid',
    })
  })

  test('rejects multiline version output without reflecting it', async () => {
    const catalog = await loadLibTvCatalog(
      runnerWithCatalogResponses({ '--version': '1.1.1\nPRIVATE_TOKEN=version-secret\n' }),
      false,
    )

    expect(catalog).toEqual({
      cliInstalled: true,
      authenticated: false,
      writesEnabled: false,
      projects: [],
      imageModels: [],
      videoModels: [],
      error: 'LibTV CLI version response is invalid',
    })
    expect(JSON.stringify(catalog)).not.toContain('PRIVATE_TOKEN')
    expect(JSON.stringify(catalog)).not.toContain('version-secret')
  })

  test('reports a precise redacted error for a malformed project envelope', async () => {
    const catalog = await loadLibTvCatalog(
      runnerWithCatalogResponses({
        'project list -p 1 -s 50': JSON.stringify({
          projectMetaList: 'PRIVATE_TOKEN=project-secret',
          total: 1,
        }),
      }),
      true,
    )

    expect(catalog).toEqual({
      cliInstalled: true,
      cliVersion: '1.1.1',
      authenticated: false,
      writesEnabled: true,
      projects: [],
      imageModels: [],
      videoModels: [],
      error: 'LibTV project response is invalid',
    })
    expect(JSON.stringify(catalog)).not.toContain('PRIVATE_TOKEN')
    expect(JSON.stringify(catalog)).not.toContain('project-secret')
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
