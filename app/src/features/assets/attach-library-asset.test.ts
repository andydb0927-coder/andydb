import { describe, expect, test } from 'vitest'

import { makeProjectFixture } from '../../test/fixtures'
import type { LibraryAssetRecord } from './library-model'
import {
  attachLibraryAssetToProject,
  type AttachAssetEnvironment,
} from './attach-library-asset'

const imageRecord: LibraryAssetRecord = {
  id: 'asset-rainy-reference',
  name: '雨夜参考',
  kind: 'image',
  mimeType: 'image/png',
  url: 'blob:wireless-canvas/rainy-reference',
  createdAt: '2026-08-11T08:00:00.000Z',
  source: 'upload',
  width: 1920,
  height: 1080,
}

const videoRecord: LibraryAssetRecord = {
  id: 'asset-river-video',
  name: '河岸镜头',
  kind: 'video',
  mimeType: 'video/mp4',
  url: 'blob:wireless-canvas/river-video',
  createdAt: '2026-08-11T08:01:00.000Z',
  source: 'generated',
  width: 1920,
  height: 1080,
  durationSeconds: 8,
}

const audioRecord: LibraryAssetRecord = {
  id: 'asset-wind-audio',
  name: '风声',
  kind: 'audio',
  mimeType: 'audio/mpeg',
  url: 'blob:wireless-canvas/wind-audio',
  createdAt: '2026-08-11T08:02:00.000Z',
  source: 'upload',
  durationSeconds: 12,
}

function fixedEnvironment(ids: string[]): AttachAssetEnvironment {
  return {
    now: () => '2026-08-11T09:00:00.000Z',
    randomId: () => ids.shift() ?? 'unexpected-id',
  }
}

describe('attaching a library asset to a project', () => {
  test('creates an image node while reusing one project asset snapshot', () => {
    const fixture = makeProjectFixture()
    const project = {
      ...fixture,
      nodes: fixture.nodes.map((node, index) =>
        index === fixture.nodes.length - 1
          ? { ...node, position: { x: 680, y: 80 } }
          : node,
      ),
    }
    const first = attachLibraryAssetToProject(
      imageRecord,
      project,
      fixedEnvironment(['attached-image-node', 'attached-image-version']),
    )
    const second = attachLibraryAssetToProject(
      imageRecord,
      first.project,
      fixedEnvironment(['attached-image-node-2', 'attached-image-version-2']),
    )

    expect(first.node).toMatchObject({
      kind: 'image',
      title: '雨夜参考',
      position: { x: 1020, y: 80 },
    })
    expect(second.project.assets.filter(({ id }) => id === imageRecord.id)).toHaveLength(1)
    expect(second.project.nodes.filter(({ title }) => title === '雨夜参考')).toHaveLength(2)
    expect(first.project.assets.find(({ id }) => id === imageRecord.id)).toEqual({
      id: imageRecord.id,
      kind: imageRecord.kind,
      mimeType: imageRecord.mimeType,
      url: imageRecord.url,
      width: imageRecord.width,
      height: imageRecord.height,
      durationSeconds: imageRecord.durationSeconds,
    })
    expect(project).toEqual({
      ...makeProjectFixture(),
      nodes: makeProjectFixture().nodes.map((node, index, nodes) =>
        index === nodes.length - 1
          ? { ...node, position: { x: 680, y: 80 } }
          : node,
      ),
    })
  })

  test('places a node 340px to the right of the current rightmost node', () => {
    const fixture = makeProjectFixture()
    const project = {
      ...fixture,
      nodes: [
        ...fixture.nodes,
        {
          ...fixture.nodes[0],
          id: 'rightmost-node',
          title: '最右节点',
          position: { x: 1500, y: 660 },
          versions: [],
          activeVersionId: '',
        },
      ],
    }

    const result = attachLibraryAssetToProject(
      imageRecord,
      project,
      fixedEnvironment(['right-placed-node', 'right-placed-version']),
    )

    expect(result.node.position).toEqual({ x: 1840, y: 80 })
  })

  test('uses a negative rightmost position when every node is left of the origin', () => {
    const fixture = makeProjectFixture()
    const project = {
      ...fixture,
      nodes: fixture.nodes.map((node, index) => ({
        ...node,
        position: { x: index === 0 ? -440 : -100, y: 80 },
      })),
    }

    const result = attachLibraryAssetToProject(
      imageRecord,
      project,
      fixedEnvironment(['negative-x-node', 'negative-x-version']),
    )

    expect(result.node.position).toEqual({ x: 240, y: 80 })
  })

  test('creates a video node with collision-free node and version ids', () => {
    const project = makeProjectFixture()
    const result = attachLibraryAssetToProject(
      videoRecord,
      project,
      fixedEnvironment([
        'shot-1',
        'version-shot-river-v1',
        'attached-video-node',
        'attached-video-version',
      ]),
    )

    expect(result.node).toMatchObject({
      id: 'attached-video-node',
      kind: 'video',
      title: '河岸镜头',
      versions: [
        {
          id: 'attached-video-version',
          createdAt: '2026-08-11T09:00:00.000Z',
          prompt: '来自素材库：河岸镜头',
          assetId: videoRecord.id,
        },
      ],
    })
    expect(result.project.updatedAt).toBe('2026-08-11T09:00:00.000Z')
  })

  test('rejects audio without changing the project', () => {
    const project = makeProjectFixture()
    const projectBefore = structuredClone(project)

    expect(() => attachLibraryAssetToProject(audioRecord, project, fixedEnvironment([])))
      .toThrow('音频素材将在专业剪辑阶段开放')
    expect(project).toEqual(projectBefore)
  })
})
