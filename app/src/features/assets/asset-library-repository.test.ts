import Dexie from 'dexie'
import { afterEach, describe, expect, test } from 'vitest'

import { makeProjectFixture } from '../../test/fixtures'
import { ProjectRepository, WirelessCanvasDatabase } from '../project/project-repository'
import type { LibraryAssetRecord } from './library-model'
import { AssetLibraryRepository } from './asset-library-repository'

const databaseNames: string[] = []

function createRepositories() {
  const databaseName = `wireless-canvas-library-${crypto.randomUUID()}`
  databaseNames.push(databaseName)
  const database = new WirelessCanvasDatabase(databaseName)

  return {
    library: new AssetLibraryRepository(database),
    projects: new ProjectRepository(database),
  }
}

afterEach(async () => {
  await Promise.all(databaseNames.splice(0).map((name) => Dexie.delete(name)))
})

describe('asset library repository', () => {
  test('returns the existing record for identical file bytes', async () => {
    const { library: repository } = createRepositories()
    const file = new File(['same-media'], 'first.png', { type: 'image/png' })

    expect((await repository.importFile(file)).status).toBe('created')
    expect((await repository.importFile(new File(['same-media'], 'renamed.png', { type: 'image/png' }))).status).toBe('existing')
    expect(await repository.list()).toHaveLength(1)
  })

  test('deduplicates identical file bytes imported concurrently', async () => {
    const { library: repository } = createRepositories()
    const [first, second] = await Promise.all([
      repository.importFile(new File(['same-media'], 'first.png', { type: 'image/png' })),
      repository.importFile(new File(['same-media'], 'renamed.png', { type: 'image/png' })),
    ])

    expect([first.status, second.status].sort()).toEqual(['created', 'existing'])
    expect(first.record.id).toBe(second.record.id)
    expect(await repository.list()).toHaveLength(1)
  })

  test('indexes project assets without replacing richer library metadata', async () => {
    const { library, projects } = createRepositories()
    const uploadRecord: LibraryAssetRecord = {
      id: 'asset-upload-river-v1',
      name: '河岸参考图',
      kind: 'image',
      mimeType: 'image/png',
      url: 'blob:wireless-canvas/upload-river-v1',
      createdAt: '2026-08-11T08:00:00.000Z',
      source: 'upload',
      fingerprint: 'sha256:river-v1',
      byteSize: 2048,
      width: 1920,
      height: 1080,
    }
    const projectUsingUploadRecord = {
      ...makeProjectFixture(),
      assets: [
        {
          id: uploadRecord.id,
          kind: uploadRecord.kind,
          mimeType: uploadRecord.mimeType,
          url: uploadRecord.url,
          width: uploadRecord.width,
          height: uploadRecord.height,
        },
      ],
      nodes: [
        {
          ...makeProjectFixture().nodes[0],
          versions: [
            {
              ...makeProjectFixture().nodes[0].versions[0],
              assetId: uploadRecord.id,
            },
          ],
        },
      ],
      jobs: [],
    }

    await library.save(uploadRecord)
    await projects.save(projectUsingUploadRecord)

    expect(await library.load(uploadRecord.id)).toEqual(uploadRecord)

    await projects.save(makeProjectFixture())

    expect((await library.list()).some(({ id }) => id === 'asset-shot-river-v1')).toBe(true)
  })

  test('uses the owning node title for legacy assets and a stable asset id fallback', async () => {
    const { library, projects } = createRepositories()
    const fixture = makeProjectFixture()
    const orphanAsset = {
      id: 'asset-orphan-reference',
      kind: 'image' as const,
      mimeType: 'image/png',
      url: 'blob:wireless-canvas/orphan-reference',
    }

    await projects.save({
      ...fixture,
      assets: [...fixture.assets, orphanAsset],
    })

    expect(await library.load('asset-shot-river-v1')).toMatchObject({
      name: '河岸寻人',
      createdAt: '2026-08-06T08:00:00.000Z',
    })
    expect(await library.load(orphanAsset.id)).toMatchObject({
      name: 'asset-orphan-reference',
      createdAt: fixture.createdAt,
    })
  })

  test('indexes every multi-image result as a generated library asset with a stable result name', async () => {
    const { library, projects } = createRepositories()
    const fixture = makeProjectFixture()
    const resultAssets = [1, 2, 3, 4].map((number) => ({
      id: `asset-live-result-${number}`,
      kind: 'image' as const,
      mimeType: 'image/png',
      url: `https://media.fixture.invalid/live-result-${number}.png`,
      width: 1344,
      height: 3136,
    }))
    const node = {
      ...fixture.nodes[0],
      title: 'Seedream 四图',
      versions: [
        ...fixture.nodes[0].versions,
        {
          id: 'version-live-results',
          createdAt: fixture.createdAt,
          prompt: '四张结果',
          assetId: resultAssets[0].id,
          generationJobId: 'job-live-results',
        },
      ],
      activeVersionId: 'version-live-results',
      imageResults: resultAssets.map((asset, index) => ({
        id: `result-${index + 1}`,
        assetId: asset.id,
      })),
      activeResultId: 'result-1',
    }
    await projects.save({
      ...fixture,
      assets: [...fixture.assets, ...resultAssets],
      nodes: [node, ...fixture.nodes.slice(1)],
      jobs: [
        ...fixture.jobs,
        {
          id: 'job-live-results',
          projectId: fixture.id,
          nodeId: node.id,
          prompt: '四张结果',
          status: 'succeeded' as const,
          progress: 100,
          createdAt: fixture.createdAt,
          updatedAt: fixture.createdAt,
          attempt: 1,
          sequence: 1,
          operation: 'regenerate' as const,
          assetId: resultAssets[0].id,
        },
      ],
    })

    for (let index = 0; index < resultAssets.length; index += 1) {
      await expect(library.load(resultAssets[index].id)).resolves.toMatchObject({
        name: `Seedream 四图 · 结果 ${index + 1}`,
        source: 'generated',
        folderId: 'generated',
      })
    }
  })

  test('deletes an unreferenced library record and treats a repeated delete as missing', async () => {
    const { library } = createRepositories()
    const record = (await library.importFile(
      new File(['unused'], 'unused.png', { type: 'image/png' }),
    )).record

    await expect(library.deleteUnreferenced(record.id)).resolves.toEqual({
      status: 'deleted',
    })
    await expect(library.deleteUnreferenced(record.id)).resolves.toEqual({
      status: 'missing',
    })
    await expect(library.list()).resolves.toEqual([])
  })

  test('refuses deletion while any project history references the asset', async () => {
    const { library, projects } = createRepositories()
    const project = makeProjectFixture()
    await projects.save(project)

    await expect(
      library.deleteUnreferenced(project.assets[0].id),
    ).resolves.toEqual({
      status: 'referenced',
      projectIds: [project.id],
    })
    await expect(library.load(project.assets[0].id)).resolves.toBeDefined()
    await expect(projects.load(project.id)).resolves.toEqual(project)
  })

  test('protects a historical version reference even when the asset snapshot is absent', async () => {
    const { library, projects } = createRepositories()
    const record = (await library.importFile(
      new File(['history-only'], 'history.png', { type: 'image/png' }),
    )).record
    const fixture = makeProjectFixture()
    const project: typeof fixture = {
      ...fixture,
      assets: [],
      nodes: fixture.nodes.map((node, index) =>
        index === 0
          ? {
              ...node,
              versions: [
                ...node.versions,
                {
                  id: 'version-history-only',
                  createdAt: '2026-08-12T08:00:00.000Z',
                  prompt: '仅历史引用',
                  assetId: record.id,
                },
              ],
            }
          : node,
      ),
    }
    await projects.save(project)

    await expect(library.deleteUnreferenced(record.id)).resolves.toEqual({
      status: 'referenced',
      projectIds: [project.id],
    })
    await expect(library.load(record.id)).resolves.toEqual(record)
  })

  test('persists asset names and folders across repository instances', async () => {
    const databaseName = `wireless-canvas-library-${crypto.randomUUID()}`
    databaseNames.push(databaseName)
    const first = new AssetLibraryRepository(new WirelessCanvasDatabase(databaseName))
    const record = (await first.importFile(
      new File(['video-bytes'], 'camera.mp4', { type: 'video/mp4' }),
    )).record

    await first.rename(record.id, '主镜头')
    await first.move(record.id, 'generated')

    const reopened = new AssetLibraryRepository(new WirelessCanvasDatabase(databaseName))
    await expect(reopened.load(record.id)).resolves.toMatchObject({
      name: '主镜头',
      folderId: 'generated',
      kind: 'video',
    })
  })

  test('requires impact confirmation before deleting a referenced asset and detaches every reference after confirmation', async () => {
    const { library, projects } = createRepositories()
    const project = makeProjectFixture()
    const assetId = project.assets[0].id
    await projects.save(project)

    await expect(library.deleteAsset(assetId)).resolves.toEqual({
      status: 'referenced',
      projectIds: [project.id],
      nodeTitles: ['河岸寻人'],
    })

    await expect(
      library.deleteAsset(assetId, { detachReferences: true }),
    ).resolves.toEqual({
      status: 'deleted',
      projectIds: [project.id],
      nodeTitles: ['河岸寻人'],
    })
    await expect(library.load(assetId)).resolves.toBeUndefined()
    const reloaded = await projects.load(project.id)
    expect(reloaded?.assets.some(({ id }) => id === assetId)).toBe(false)
    expect(
      reloaded?.nodes.flatMap(({ versions }) => versions).some(({ assetId: id }) => id === assetId),
    ).toBe(false)
    expect(reloaded?.jobs.some(({ assetId: id }) => id === assetId)).toBe(false)
  })
})
