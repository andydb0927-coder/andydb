import { mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import type { LibTvCatalog, LibTvGenerateBody } from '../../src/features/generation/libtv-contract.js'
import {
  createLibTvGenerationExecutor,
  executeLibTvGeneration,
  hasExpectedReferenceSignature,
} from './generation-command.js'
import type { CliRunner } from './types.js'

const remoteProjectUuid = '11111111-2222-3333-4444-555555555555'
const fullPrompt = '不可出现在错误中的完整提示词'

const catalog: LibTvCatalog = {
  cliInstalled: true,
  authenticated: true,
  writesEnabled: true,
  projects: [{ uuid: remoteProjectUuid, name: '低成本验收' }],
  imageModels: [{ modelKey: 'image-key', modelName: 'Image Model' }],
  videoModels: [{ modelKey: 'video-key', modelName: 'Video Model' }],
}

// Genuine 2 x 2 media encoded by the installed Playwright Chromium Canvas on
// 2026-08-11. Keeping the bytes inline makes the tests deterministic and avoids
// launching a browser at test runtime.
const pngBytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAF0lEQVR4AWLKT/7/H4SZGIBgwhwGBgAAAAD//zchSWwAAAAGSURBVAMATgAG0WonAaQAAAAASUVORK5CYII=',
  'base64',
)
const jpegBytes = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAACAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAcEAACAgMBAQAAAAAAAAAAAAABAgADBAUGESH/xAAVAQEBAAAAAAAAAAAAAAAAAAADBv/EABcRAQADAAAAAAAAAAAAAAAAAAABAzL/2gAMAwEAAhEDEQA/AL/y3PaW/mNRbdqNdZa+HSzu+MhLEoCST59MRErrNSN//9k=',
  'base64',
)
const webpBytes = Buffer.from(
  'UklGRioCAABXRUJQVlA4WAoAAAAgAAAAAQAAAQAASUNDUMgBAAAAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADZWUDggPAAAALABAJ0BKgIAAgABQCYloAJ0AQ72oiAA/vm76/l/ZgfT/shHe2X4CpQN7sSC/+rQ//5aH//LQ/c3xiAAAA==',
  'base64',
)

// Genuine 16 x 16 H.264 MP4 produced by macOS AVAssetWriter using
// /private/tmp/libtv-fixture.swift. file(1): ISO Media, MP4 v2.
// SHA-256: 0ece66d67fc00b61809889aa36247c6cdb5edc2c6bc03e768fee5aa64c1e0e55
const mp4Bytes = Buffer.from(
  'AAAAHGZ0eXBtcDQyAAAAAWlzb21tcDQxbXA0MgAAAAFtZGF0AAAAAAAAAIUAAAA7BgUyR1ZK3FxMQz+U78URPNFDqAEAAAMAAQMAAAMAAQIAAeYACwAAAwAAAwAAAwBkDAOJJAEN/////4AAAAAyJbggH94I5Uz/gsnnm1JEAFF77diPegoZHua5g6fVtrMN82GsqGNvqOenAAA2gBXDPRgAAAKnbW9vdgAAAGxtdmhkAAAAAOagsr3moLK9AAACWAAAACgAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAjN0cmFrAAAAXHRraGQAAAAB5qCyveagsr0AAAABAAAAAAAAACgAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAABAAAAAQAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAAoAAAAAAABAAAAAAGrbWRpYQAAACBtZGhkAAAAAOagsr3moLK9AAACWAAAAChVxAAAAAAAMWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABDb3JlIE1lZGlhIFZpZGVvAAAAAVJtaW5mAAAAFHZtaGQAAAABAAAAAAAAAAAAAAAkZGluZgAAABxkcmVmAAAAAAAAAAEAAAAMdXJsIAAAAAEAAAESc3RibAAAAKFzdHNkAAAAAAAAAAEAAACRYXZjMQAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAQABAASAAAAEgAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABj//wAAACdhdmNDAWQAC//hAAwnZAALrFZQw3gWYKUBAAQo7jyw/fj4AAAAAApmaWVsAQAAAAAKY2hybQAAAAAAGHN0dHMAAAAAAAAAAQAAAAEAAAAoAAAADXNkdHAAAAAAIAAAABxzdHNjAAAAAAAAAAEAAAABAAAAAQAAAAEAAAAUc3RzegAAAAAAAAB1AAAAAQAAABRzdGNvAAAAAAAAAAEAAAAs',
  'base64',
)

// Genuine 2 x 2 Chromium WebM fixture. file(1): WebM.
// SHA-256: 8799f4049682a1380cdb7a3c5ca3d325cad68ed6c069bff45f3e52e6a1dff0c9
const webmBytes = Buffer.from(
  'GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwEAAAAAAAF7EU2bdLlNu4tTq4QVSalmU6yBbk27i1OrhBZUrmtTrIGTTbuLU6uEH0O2dVOsgcFNu4xTq4QcU7trU6yCAWnsrgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmoCrXsYMPQkBEiYRDdIuFTYCGQ2hyb21lV0GGQ2hyb21lFlSua6mup9eBAXPFh0mO8s+MwzuDgQFV7oEBhoVWX1ZQOOCKsIECuoECU8CBAR9DtnUBAAAAAAAAnOeBAKDMoaKBAAAAEAIAnQEqAgACAASHCIWFiJmEiBgCAAwNYAD+9LgAdaGlpqPugQGlnhACAJ0BKgIAAgAEhwiFhYiZhIgYAgAMDWAA/valAKDJoamBAPQAEQIAEhDwABgJ1qgIMv/zTMD/gP7paR6+AKeqP/maP0m+k3cwAHWhmKaW7oEBpZGxAQASEPAAGAAYWC/0AAgAAPuBABxTu2uNu4uzgQC3hveBAfGBwQ==',
  'base64',
)
const pngDataUrl = `data:image/png;base64,${pngBytes.toString('base64')}`
const jpegDataUrl = `data:image/jpeg;base64,${jpegBytes.toString('base64')}`
const mp4DataUrl = `data:video/mp4;base64,${mp4Bytes.toString('base64')}`
const validReferenceFixtures = [
  ['PNG', 'image/png', 'image', pngBytes, 'png'],
  ['JPEG', 'image/jpeg', 'image', jpegBytes, 'jpg'],
  ['WebP', 'image/webp', 'image', webpBytes, 'webp'],
  ['MP4', 'video/mp4', 'video', mp4Bytes, 'mp4'],
  ['WebM', 'video/webm', 'video', webmBytes, 'webm'],
] as const

const rejectedSupportedReferenceFixtures = [
  ['PNG truncated before IEND', 'image/png', 'image', pngBytes.subarray(0, -12)],
  ['PNG header-only spoof', 'image/png', 'image', Buffer.from('89504e470d0a1a0a0000000d494844520000000100000001080200000000000000', 'hex')],
  ['JPEG truncated before EOI', 'image/jpeg', 'image', jpegBytes.subarray(0, -2)],
  ['JPEG marker-only spoof', 'image/jpeg', 'image', Buffer.from('ffd8ffe00002ffd9', 'hex')],
  ['WebP truncated payload', 'image/webp', 'image', webpBytes.subarray(0, -8)],
  ['WebP VP8X-only spoof', 'image/webp', 'image', Buffer.from('524946461600000057454250565038580a00000000000000000000000000', 'hex')],
  ['MP4 truncated before moov', 'video/mp4', 'video', mp4Bytes.subarray(0, 128)],
  ['MP4 ftyp-only spoof', 'video/mp4', 'video', Buffer.from('000000106674797069736f6d00000000', 'hex')],
  ['WebM truncated before media data', 'video/webm', 'video', webmBytes.subarray(0, 180)],
  ['WebM header-only spoof', 'video/webm', 'video', Buffer.from('1a45dfa38a4282847765626dec8100', 'hex')],
] as const

const unsupportedAudioFixtures = [
  ['MP3 with ID3', 'audio/mpeg', Buffer.from('49443304000000000000', 'hex')],
  ['WAV', 'audio/wav', Buffer.from('524946462400000057415645666d7420100000000100010044ac000088580100020010006461746100000000', 'hex')],
  ['Ogg', 'audio/ogg', Buffer.from(`4f676753${'00'.repeat(22)}01084f70757348656164`, 'hex')],
] as const

const boundedStructureFixtures = [
  [
    'JPEG entropy with FF00 stuffing and a restart marker',
    'image/jpeg',
    Buffer.from(
      'ffd8ffc0000b080002000201011100ffda0008010100003f0011ff0022ffd033ffd9',
      'hex',
    ),
  ],
  [
    'odd-sized lossless WebP chunk with padding',
    'image/webp',
    Buffer.from('5249464612000000574542505650384c050000002f0000000000', 'hex'),
  ],
  [
    'extended WebP followed by an animation frame chunk',
    'image/webp',
    Buffer.from(
      '524946464000000057454250565038580a00000002000000010000010000414e4d462200000000000000000001000001000000000000565038200a0000000000009d012a02000200',
      'hex',
    ),
  ],
  [
    'WebM segment with an unknown size bounded by the input',
    'video/webm',
    Buffer.concat([
      webmBytes.subarray(0, 40),
      Buffer.from('01ffffffffffffff', 'hex'),
      webmBytes.subarray(48),
    ]),
  ],
] as const

let workspace: string

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'libtv-generation-test-'))
})

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true })
})

function body(overrides: Partial<LibTvGenerateBody> = {}): LibTvGenerateBody {
  return {
    confirmed: true,
    selection: {
      projectUuid: remoteProjectUuid,
      projectName: '低成本验收',
      imageModelName: 'Image Model',
      videoModelName: 'Video Model',
    },
    request: {
      projectId: 'local-project',
      nodeId: 'local-node',
      operation: 'regenerate',
      targetKind: 'image',
      prompt: fullPrompt,
      referenceAssets: [],
    },
    ...overrides,
  }
}

function runnerWithOutput(stdout = imageOutput()): { runner: CliRunner; calls: string[][] } {
  const calls: string[][] = []
  const runner: CliRunner = {
    run: vi.fn<CliRunner['run']>().mockImplementation(async (args) => {
      calls.push([...args])
      return { stdout: args[0] === 'node' ? stdout : '{"nodeKey":"reference"}', stderr: '' }
    }),
  }
  return { runner, calls }
}

function imageOutput(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: 'image',
    data: {
      url: ['https://assets.example.test/generated.png'],
      ...overrides,
    },
  })
}

function videoOutput(): string {
  return JSON.stringify({
    type: 'video',
    data: { url: ['https://assets.example.test/generated.mp4'] },
  })
}

async function expectRejectedWithoutRunnerCall(input: unknown): Promise<void> {
  const { runner } = runnerWithOutput()

  await expect(
    executeLibTvGeneration(input, catalog, runner, workspace),
  ).rejects.toThrow('LibTV generation request is invalid')
  expect(runner.run).not.toHaveBeenCalled()
  await expect(readdir(workspace)).resolves.toEqual([])
}

function referenceBody(
  mimeType: string,
  kind: 'image' | 'video' | 'audio',
  bytes: Buffer,
): LibTvGenerateBody {
  return body({
    request: {
      ...body().request,
      targetKind: kind === 'video' ? 'video' : 'image',
      referenceAssets: [
        {
          dataUrl: `data:${mimeType};base64,${bytes.toString('base64')}`,
          kind,
          mimeType,
        },
      ],
    },
  })
}

async function expectReferenceRejectedWithoutSideEffects(
  mimeType: string,
  kind: 'image' | 'video' | 'audio',
  bytes: Buffer,
): Promise<void> {
  await expectRejectedWithoutRunnerCall(referenceBody(mimeType, kind, bytes))
}

describe('LibTV generation preflight', () => {
  test.each(validReferenceFixtures)(
    'recognizes the valid %s content signature for %s',
    (_format, mimeType, _kind, bytes) => {
      expect(hasExpectedReferenceSignature(bytes, mimeType)).toBe(true)
    },
  )

  test.each(boundedStructureFixtures)(
    'accepts %s',
    (_caseName, mimeType, bytes) => {
      expect(hasExpectedReferenceSignature(bytes, mimeType)).toBe(true)
    },
  )

  test.each(rejectedSupportedReferenceFixtures)(
    'rejects %s through the executor before any runner call or workspace write',
    async (_caseName, mimeType, kind, bytes) => {
      await expectReferenceRejectedWithoutSideEffects(mimeType, kind, bytes)
    },
  )

  test.each(validReferenceFixtures)(
    'does not recognize arbitrary bytes as the %s content signature for %s',
    (_format, mimeType) => {
      expect(
        hasExpectedReferenceSignature(Buffer.from('not the declared format'), mimeType),
      ).toBe(false)
    },
  )

  test.each(unsupportedAudioFixtures)(
    'does not advertise %s as a Task 3 reference signature',
    (_format, mimeType, bytes) => {
      expect(hasExpectedReferenceSignature(bytes, mimeType)).toBe(false)
    },
  )

  test.each(unsupportedAudioFixtures)(
    'rejects %s through the executor before any runner call or workspace write',
    async (_format, mimeType, bytes) => {
      await expectReferenceRejectedWithoutSideEffects(mimeType, 'audio', bytes)
    },
  )

  test('rejects a remote project UUID not present in the live catalog before any CLI call', async () => {
    await expectRejectedWithoutRunnerCall(
      body({ selection: { ...body().selection, projectUuid: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' } }),
    )
  })

  test('rejects a model name not present in the selected catalog before any CLI call', async () => {
    await expectRejectedWithoutRunnerCall(
      body({ selection: { ...body().selection, imageModelName: 'Unlisted Image Model' } }),
    )
  })

  test.each(['', '   ', '\n\t'])('rejects a blank prompt before any CLI call', async (prompt) => {
    await expectRejectedWithoutRunnerCall(body({ request: { ...body().request, prompt } }))
  })

  test('rejects a prompt longer than 8000 characters before any CLI call', async () => {
    await expectRejectedWithoutRunnerCall(
      body({ request: { ...body().request, prompt: 'x'.repeat(8001) } }),
    )
  })

  test('rejects more than three reference assets before any CLI call', async () => {
    await expectRejectedWithoutRunnerCall(
      body({
        request: {
          ...body().request,
          referenceAssets: Array.from({ length: 4 }, () => ({
            dataUrl: pngDataUrl,
            kind: 'image' as const,
            mimeType: 'image/png',
          })),
        },
      }),
    )
  })

  test('rejects a non-Data URL reference before any CLI call', async () => {
    await expectRejectedWithoutRunnerCall(
      body({
        request: {
          ...body().request,
          referenceAssets: [{ dataUrl: 'https://example.test/remote.png', kind: 'image', mimeType: 'image/png' }],
        },
      }),
    )
  })

  test('rejects an unsupported reference MIME type before any CLI call', async () => {
    await expectRejectedWithoutRunnerCall(
      body({
        request: {
          ...body().request,
          referenceAssets: [{ dataUrl: 'data:image/svg+xml;base64,PHN2Zy8+', kind: 'image', mimeType: 'image/svg+xml' }],
        },
      }),
    )
  })

  test('rejects a decoded reference larger than 20 MiB before any CLI call', async () => {
    const tooLargeDataUrl = `data:image/png;base64,${Buffer.alloc(20 * 1024 * 1024 + 1).toString('base64')}`
    await expectRejectedWithoutRunnerCall(
      body({
        request: {
          ...body().request,
          referenceAssets: [{ dataUrl: tooLargeDataUrl, kind: 'image', mimeType: 'image/png' }],
        },
      }),
    )
  })

  test.each(validReferenceFixtures)(
    'rejects %s content whose decoded signature contradicts %s before any write',
    async (_format, mimeType, kind) => {
      await expectRejectedWithoutRunnerCall(
        referenceBody(mimeType, kind, Buffer.from('declared mime does not match bytes')),
      )
    },
  )

  test.each<[string, LibTvGenerateBody['request']['referenceAssets']]>([
    [
      'two image references',
      [
        { dataUrl: pngDataUrl, kind: 'image', mimeType: 'image/png' },
        { dataUrl: jpegDataUrl, kind: 'image', mimeType: 'image/jpeg' },
      ],
    ],
    ['an audio reference', [{ dataUrl: 'data:audio/mpeg;base64,SUQz', kind: 'audio', mimeType: 'audio/mpeg' }]],
    ['a mismatched image MIME', [{ dataUrl: pngDataUrl, kind: 'image', mimeType: 'video/mp4' }]],
  ])('rejects video generation with %s before any CLI call', async (_caseName, referenceAssets) => {
    await expectRejectedWithoutRunnerCall(
      body({
        request: {
          ...body().request,
          targetKind: 'video',
          referenceAssets,
        },
      }),
    )
  })

  test('requires confirmed to be the literal true before any CLI call', async () => {
    await expectRejectedWithoutRunnerCall({ ...body(), confirmed: false })
    await expectRejectedWithoutRunnerCall({ ...body(), confirmed: 1 })
    await expectRejectedWithoutRunnerCall({ ...body(), confirmed: 'true' })
  })
})

describe('LibTV generation commands and temporary files', () => {
  test.each(validReferenceFixtures)(
    'keeps accepting a valid %s signature and uses its safe extension',
    async (_format, mimeType, kind, bytes, extension) => {
      const { runner, calls } = runnerWithOutput(kind === 'video' ? videoOutput() : imageOutput())

      await expect(
        executeLibTvGeneration(
          referenceBody(mimeType, kind, bytes),
          catalog,
          runner,
          workspace,
        ),
      ).resolves.toMatchObject({ kind })

      expect(calls[0]).toEqual([
        'upload',
        expect.any(String),
        '-p',
        remoteProjectUuid,
        '-f',
        expect.stringMatching(new RegExp(`\\.${extension}$`)),
        '-t',
        kind,
      ])
      await expect(readdir(workspace)).resolves.toEqual([])
    },
  )

  test('uploads a PNG sequentially then creates an image node with the official argument order', async () => {
    const calls: string[][] = []
    const runner: CliRunner = {
      run: vi.fn<CliRunner['run']>().mockImplementation(async (args) => {
        calls.push([...args])
        if (args[0] === 'upload') {
          const file = args[args.indexOf('-f') + 1]
          await expect(stat(file)).resolves.toMatchObject({ isFile: expect.any(Function) })
          return { stdout: '{"nodeKey":"reference"}', stderr: '' }
        }
        return { stdout: imageOutput(), stderr: '' }
      }),
    }
    const input = body({
      request: {
        ...body().request,
        prompt: '雨夜人物特写',
        referenceAssets: [{ dataUrl: pngDataUrl, kind: 'image', mimeType: 'image/png' }],
      },
    })

    await expect(executeLibTvGeneration(input, catalog, runner, workspace)).resolves.toEqual({
      kind: 'image',
      url: 'https://assets.example.test/generated.png',
      mimeType: 'image/*',
    })

    expect(calls).toHaveLength(2)
    const referenceName = calls[0][1]
    const generatedName = calls[1][6]
    expect(calls[0]).toEqual([
      'upload',
      referenceName,
      '-p',
      remoteProjectUuid,
      '-f',
      expect.stringMatching(/\.png$/),
      '-t',
      'image',
    ])
    expect(calls[1]).toEqual([
      'node',
      '--x',
      expect.any(String),
      '--y',
      expect.any(String),
      'create',
      generatedName,
      '-p',
      remoteProjectUuid,
      '-t',
      'image',
      '--prompt',
      '雨夜人物特写',
      '-s',
      'model=Image Model',
      '--left',
      referenceName,
      '--run',
    ])
    await expect(readdir(workspace)).resolves.toEqual([])
  })

  test.each<
    [
      string,
      LibTvGenerateBody['request']['referenceAssets'],
      'text2video' | 'singleImage2video' | 'video2video',
    ]
  >([
    ['text2video', [], 'text2video'],
    ['singleImage2video', [{ dataUrl: pngDataUrl, kind: 'image', mimeType: 'image/png' }], 'singleImage2video'],
    ['video2video', [{ dataUrl: mp4DataUrl, kind: 'video', mimeType: 'video/mp4' }], 'video2video'],
  ])('creates a video node for the supported %s mode', async (_caseName, referenceAssets, modeType) => {
    const { runner, calls } = runnerWithOutput(videoOutput())
    const input = body({
      request: {
        ...body().request,
        targetKind: 'video',
        referenceAssets,
      },
    })

    await expect(executeLibTvGeneration(input, catalog, runner, workspace)).resolves.toMatchObject({
      kind: 'video',
      url: 'https://assets.example.test/generated.mp4',
    })

    const nodeCommand = calls.at(-1)
    expect(nodeCommand).toEqual([
      'node',
      '--x',
      expect.any(String),
      '--y',
      expect.any(String),
      'create',
      expect.any(String),
      '-p',
      remoteProjectUuid,
      '-t',
      'video',
      '--prompt',
      fullPrompt,
      '-s',
      'model=Video Model',
      ...(referenceAssets.length === 1 ? ['--left', calls[0][1]] : []),
      '-s',
      `modeType=${modeType}`,
      '--run',
    ])
  })

  test('removes the exact temporary directory after an upload failure', async () => {
    const { runner } = runnerWithOutput()
    vi.mocked(runner.run).mockRejectedValueOnce(
      new Error(`upload failed ${workspace} ${fullPrompt} PRIVATE_TOKEN=secret`),
    )
    const input = body({
      request: {
        ...body().request,
        referenceAssets: [{ dataUrl: pngDataUrl, kind: 'image', mimeType: 'image/png' }],
      },
    })

    const error = await executeLibTvGeneration(input, catalog, runner, workspace).catch(
      (reason: unknown) => String(reason),
    )

    expect(error).toContain('LibTV generation failed')
    expect(error).not.toContain(workspace)
    expect(error).not.toContain(fullPrompt)
    expect(error).not.toContain('PRIVATE_TOKEN')
    await expect(readdir(workspace)).resolves.toEqual([])
  })

  test('retries one transient cleanup failure and removes the same exact directory', async () => {
    const controlledRm = vi.fn<typeof rm>()
      .mockRejectedValueOnce(new Error(`transient cleanup failure at ${workspace}`))
      .mockImplementation(rm)
    const executeWithControlledFileSystem = createLibTvGenerationExecutor({
      mkdtemp,
      writeFile,
      rm: controlledRm,
    })
    const { runner } = runnerWithOutput()
    const input = body({
      request: {
        ...body().request,
        referenceAssets: [{ dataUrl: pngDataUrl, kind: 'image', mimeType: 'image/png' }],
      },
    })

    await expect(
      executeWithControlledFileSystem(input, catalog, runner, workspace),
    ).resolves.toMatchObject({ kind: 'image' })

    expect(controlledRm).toHaveBeenCalledTimes(2)
    expect(controlledRm.mock.calls[1]).toEqual(controlledRm.mock.calls[0])
    await expect(readdir(workspace)).resolves.toEqual([])
  })

  test('bounds persistent cleanup failure and returns only a fixed redacted error', async () => {
    const rawCleanupError = `EACCES ${workspace}/libtv-generation-private ${fullPrompt} PRIVATE_TOKEN=secret`
    const controlledRm = vi.fn<typeof rm>().mockRejectedValue(new Error(rawCleanupError))
    const executeWithControlledFileSystem = createLibTvGenerationExecutor({
      mkdtemp,
      writeFile,
      rm: controlledRm,
    })
    const { runner } = runnerWithOutput()
    const input = body({
      request: {
        ...body().request,
        referenceAssets: [{ dataUrl: pngDataUrl, kind: 'image', mimeType: 'image/png' }],
      },
    })

    const error = await executeWithControlledFileSystem(input, catalog, runner, workspace).catch(
      (reason: unknown) => String(reason),
    )

    expect(error).toContain('LibTV temporary file cleanup failed')
    expect(error).not.toContain(workspace)
    expect(error).not.toContain(fullPrompt)
    expect(error).not.toContain('PRIVATE_TOKEN')
    expect(error).not.toContain('EACCES')
    expect(controlledRm).toHaveBeenCalledTimes(2)
    expect(controlledRm.mock.calls[1]).toEqual(controlledRm.mock.calls[0])
  })
})

describe('LibTV generation output parsing', () => {
  test('maps only allowlisted optional output metadata', async () => {
    const { runner } = runnerWithOutput(
      imageOutput({
        poster: 'https://assets.example.test/poster.png',
        width: 1920,
        height: 1080,
        duration: 4.5,
        privateTaskEnvelope: 'must not return',
      }),
    )

    await expect(executeLibTvGeneration(body(), catalog, runner, workspace)).resolves.toEqual({
      kind: 'image',
      url: 'https://assets.example.test/generated.png',
      mimeType: 'image/*',
      poster: 'https://assets.example.test/poster.png',
      width: 1920,
      height: 1080,
      durationSeconds: 4.5,
    })
  })

  test.each([
    ['non-JSON output', 'PRIVATE_TOKEN=not-json'],
    ['an empty URL array', JSON.stringify({ type: 'image', data: { url: [] } })],
    ['a Data URL result', JSON.stringify({ type: 'image', data: { url: [pngDataUrl] } })],
    ['a mismatched output kind', videoOutput()],
  ])('rejects %s without leaking output or request details', async (_caseName, stdout) => {
    const { runner } = runnerWithOutput(stdout)
    const error = await executeLibTvGeneration(body(), catalog, runner, workspace).catch(
      (reason: unknown) => String(reason),
    )

    expect(error).toContain('LibTV generation result is invalid')
    expect(error).not.toContain('PRIVATE_TOKEN')
    expect(error).not.toContain(fullPrompt)
    expect(error).not.toContain(workspace)
    expect(error).not.toContain(stdout)
  })

  test('redacts a CLI failure without exposing arguments or raw error output', async () => {
    const { runner } = runnerWithOutput()
    vi.mocked(runner.run).mockRejectedValueOnce(
      new Error(`libtv node --prompt ${fullPrompt} -f ${workspace}/reference.png PRIVATE_TOKEN=secret`),
    )

    const error = await executeLibTvGeneration(body(), catalog, runner, workspace).catch(
      (reason: unknown) => String(reason),
    )

    expect(error).toContain('LibTV generation failed')
    expect(error).not.toContain(fullPrompt)
    expect(error).not.toContain(workspace)
    expect(error).not.toContain('PRIVATE_TOKEN')
    expect(error).not.toContain('--prompt')
  })
})
