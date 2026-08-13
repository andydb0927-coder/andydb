import { describe, expect, test } from 'vitest'

import { makeProjectFixture } from '../../test/fixtures'
import { createTimelineProject } from '../timeline/timeline-project'
import {
  createShareLink,
  parseProjectPackage,
  projectPackageFromShareLink,
  serializeProjectPackage,
  type LocalProjectPackage,
} from './project-package'

function makePackage(): LocalProjectPackage {
  const project = makeProjectFixture()
  return {
    kind: 'wireless-canvas-project',
    schemaVersion: 1,
    exportedAt: '2026-08-13T08:00:00.000Z',
    project,
    timeline: createTimelineProject(project),
    libraryAssets: [],
    collaboration: { collaborators: [], comments: [] },
  }
}

describe('project package codec', () => {
  test('serializes and parses a complete versioned project package', () => {
    const packageValue = makePackage()
    expect(parseProjectPackage(serializeProjectPackage(packageValue))).toEqual(packageValue)
  })

  test('round-trips a local-only share link and rejects unsupported packages', () => {
    const packageValue = makePackage()
    const link = createShareLink(packageValue, 'https://canvas.local/projects')

    expect(link).toContain('#local-share=')
    expect(projectPackageFromShareLink(link)).toEqual(packageValue)
    expect(() => parseProjectPackage('{"schemaVersion":2}')).toThrow('不支持的项目包版本')
  })

  test.each([
    ['invalid collaborator role', (value: LocalProjectPackage) => {
      value.collaboration.collaborators = [{
        id: 'member-1', projectId: value.project.id, name: '小林', role: 'admin',
        createdAt: value.exportedAt, updatedAt: value.exportedAt,
      } as never]
    }],
    ['empty collaborator name', (value: LocalProjectPackage) => {
      value.collaboration.collaborators = [{
        id: 'member-1', projectId: value.project.id, name: ' ', role: 'viewer',
        createdAt: value.exportedAt, updatedAt: value.exportedAt,
      }]
    }],
    ['invalid comment status', (value: LocalProjectPackage) => {
      value.collaboration.comments = [{
        id: 'comment-1', projectId: value.project.id, targetType: 'node', targetId: 'node-1',
        body: '修改', authorName: '本机所有者', status: 'deleted',
        createdAt: value.exportedAt, updatedAt: value.exportedAt,
      } as never]
    }],
    ['empty comment target', (value: LocalProjectPackage) => {
      value.collaboration.comments = [{
        id: 'comment-1', projectId: value.project.id, targetType: 'clip', targetId: ' ',
        body: '修改', authorName: '本机所有者', status: 'open',
        createdAt: value.exportedAt, updatedAt: value.exportedAt,
      }]
    }],
  ])('rejects %s records before import', (_case, mutate) => {
    const packageValue = makePackage()
    mutate(packageValue)
    expect(() => parseProjectPackage(JSON.stringify(packageValue))).toThrow('项目包协作记录无效')
  })
})
