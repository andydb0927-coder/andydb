import { describe, expect, test } from 'vitest'

import { makeProjectFixture } from '../../../test/fixtures'
import type { Project } from '../../project/model'
import type { LibraryAssetRecord } from '../library-model'
import { collectAssetReferenceImpact, normalizeLibraryAssetName, projectReferencesAsset, requireLibraryAsset } from './asset-library-policy'

const asset: LibraryAssetRecord = {
  id: 'fixture-asset', name: '素材', kind: 'image', url: '/fixture.png', mimeType: 'image/png',
  createdAt: '2026-08-27T00:00:00Z', source: 'upload', folderId: 'project',
}

function emptyProject(): Project {
  return { ...makeProjectFixture(), assets: [], nodes: [], jobs: [], exportJobs: [] }
}

describe('素材域规则', () => {
  test('只规范名称，不改资产身份、数据或元信息', () => {
    const before = structuredClone(asset)
    expect(normalizeLibraryAssetName('  新名称  ')).toBe('新名称')
    expect(() => normalizeLibraryAssetName(' \n ')).toThrow('素材名称不能为空。')
    expect(requireLibraryAsset(asset)).toBe(asset)
    expect(() => requireLibraryAsset(undefined)).toThrow('素材不存在或已删除。')
    expect(asset).toEqual(before)
  })

  test.each(['asset', 'card', 'version', 'result', 'job', 'export'] as const)('保留%s引用检查语义', (kind) => {
    const project = emptyProject()
    const fixture = makeProjectFixture()
    const node = { ...fixture.nodes[0], versions: [] }
    if (kind === 'asset') project.assets = [asset]
    if (kind === 'card') project.nodes = [{ ...node, card: { kind: 'script', scenes: '', dialogue: '', shotNotes: '', imageAssetId: asset.id } }]
    if (kind === 'version') project.nodes = [{ ...node, versions: [{ ...fixture.nodes[0].versions[0], assetId: asset.id }] }]
    if (kind === 'result') project.nodes = [{ ...node, imageResults: [{ id: 'result-1', assetId: asset.id }] }]
    if (kind === 'job') project.jobs = [{ ...fixture.jobs[0], assetId: asset.id }]
    if (kind === 'export') project.exportJobs = [{ id: 'export', status: 'succeeded', createdAt: asset.createdAt, updatedAt: asset.createdAt, assetId: asset.id }]
    expect(projectReferencesAsset(project, asset.id)).toBe(true)
    expect(projectReferencesAsset(project, 'other')).toBe(false)
  })

  test('影响清单保留项目顺序、节点名去重且不更改快照', () => {
    const fixture = makeProjectFixture()
    const first = { ...fixture, id: 'first', nodes: [fixture.nodes[0], { ...fixture.nodes[0], id: 'duplicate-name' }] }
    const second = { ...emptyProject(), id: 'second', jobs: fixture.jobs }
    const projects = [first, emptyProject(), second]
    const before = structuredClone(projects)
    expect(collectAssetReferenceImpact(projects, fixture.assets[0].id)).toEqual({
      referencedProjects: [first, second], projectIds: ['first', 'second'], nodeTitles: ['河岸寻人'],
    })
    expect(projects).toEqual(before)
  })
})
