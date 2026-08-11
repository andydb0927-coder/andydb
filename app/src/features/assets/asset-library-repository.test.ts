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
})
