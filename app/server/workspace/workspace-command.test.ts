// @vitest-environment node

import { describe, expect, test } from 'vitest'

import type { Project } from '../../src/features/project/model.js'
import {
  executeWorkspaceCommand,
  WORKSPACE_COMMAND_MANIFEST,
  WorkspaceCommandError,
} from './workspace-command.js'

const project: Project = {
  id: 'project-1', title: '雨夜追寻', intent: '雨夜寻找同伴',
  createdAt: '2026-08-13T08:00:00.000Z', updatedAt: '2026-08-13T09:00:00.000Z',
  assets: [
    { id: 'asset-1', kind: 'image', url: '/shot.png', mimeType: 'image/png', width: 1920, height: 1080 },
    { id: 'asset-2', kind: 'audio', url: '/rain.mp3', mimeType: 'audio/mpeg', durationSeconds: 12 },
  ],
  nodes: [{
    id: 'shot-1', kind: 'storyboard', title: '雨中屋顶', position: { x: 0, y: 0 },
    versions: [{ id: 'version-1', createdAt: '2026-08-13T08:00:00.000Z', prompt: '雨中屋顶', assetId: 'asset-1' }],
    activeVersionId: 'version-1', sourceChanged: false,
  }],
  edges: [], timeline: [{ id: 'legacy', nodeId: 'shot-1', order: 0, durationSeconds: 5, track: 'video' }],
  jobs: [], exportJobs: [],
}

describe('local workspace command manifest', () => {
  test('publishes four versioned commands with stable schema ids', () => {
    expect(WORKSPACE_COMMAND_MANIFEST).toMatchObject({
      schemaVersion: 1,
      namespace: 'wireless-canvas.workspace',
    })
    expect(WORKSPACE_COMMAND_MANIFEST.commands.map(({ id }) => id)).toEqual([
      'workspace.project.export',
      'workspace.project.import.validate',
      'workspace.assets.manifest',
      'workspace.timeline.edl',
    ])
    expect(WORKSPACE_COMMAND_MANIFEST.commands.every(
      ({ inputSchemaId, outputSchemaId }) => inputSchemaId.includes('@1') && outputSchemaId.includes('@1'),
    )).toBe(true)
  })
})

describe('local workspace command execution', () => {
  test('exports and validates a project JSON document without persistence', () => {
    const exported = executeWorkspaceCommand('workspace.project.export', { project })
    expect(exported).toMatchObject({
      filename: '雨夜追寻-项目.json',
      mimeType: 'application/json',
    })
    const document = JSON.parse(exported.content as string)
    expect(document).toEqual({
      format: 'wireless-canvas-project',
      schemaVersion: 1,
      project,
    })

    expect(executeWorkspaceCommand('workspace.project.import.validate', {
      content: exported.content,
    })).toEqual({
      valid: true,
      projectId: project.id,
      title: project.title,
      nodeCount: 1,
      assetCount: 2,
    })
  })

  test('exports an asset manifest with deterministic references', () => {
    const result = executeWorkspaceCommand('workspace.assets.manifest', { project })
    const document = JSON.parse(result.content as string)

    expect(result.filename).toBe('雨夜追寻-素材清单.json')
    expect(document.assets).toEqual([
      expect.objectContaining({ id: 'asset-1', referencedByNodeIds: ['shot-1'] }),
      expect.objectContaining({ id: 'asset-2', referencedByNodeIds: [] }),
    ])
  })

  test('exports timeline EDL using the shared professional timeline serializer', () => {
    const timeline = {
      id: project.id,
      projectId: project.id,
      title: '雨夜追寻剪辑',
      schemaVersion: 1,
      frameRate: 24,
      width: 1920,
      height: 1080,
      removedLegacyItemIds: [],
      createdAt: '2026-08-13T10:00:00.000Z',
      updatedAt: '2026-08-13T10:00:00.000Z',
      tracks: [{
        id: 'video-track', kind: 'video', name: '视频轨道', order: 0,
        clips: [{
          id: 'legacy', trackId: 'video-track', kind: 'video', name: '雨中屋顶', order: 0,
          startSeconds: 0, sourceInSeconds: 0, sourceOutSeconds: 5, sourceDurationSeconds: 5,
          source: { type: 'canvas-node', nodeId: 'shot-1', assetId: 'asset-1' },
        }],
      }],
    }
    const result = executeWorkspaceCommand('workspace.timeline.edl', { timeline })

    expect(result).toMatchObject({ filename: '雨夜追寻剪辑.edl', mimeType: 'text/plain' })
    expect(result.content).toContain('TITLE: 雨夜追寻剪辑')
    expect(result.content).toContain('* FROM CLIP NAME: 雨中屋顶')
  })

  test('returns normalized errors for unknown commands and invalid input', () => {
    expect(() => executeWorkspaceCommand('workspace.private', {})).toThrowError(
      expect.objectContaining<Partial<WorkspaceCommandError>>({ code: 'UNKNOWN_COMMAND' }),
    )
    expect(() => executeWorkspaceCommand('workspace.project.export', { project: { id: 'x' } })).toThrowError(
      expect.objectContaining<Partial<WorkspaceCommandError>>({ code: 'SCHEMA_VALIDATION_FAILED' }),
    )
    expect(() => executeWorkspaceCommand('workspace.project.import.validate', { content: '{' })).toThrowError(
      expect.objectContaining<Partial<WorkspaceCommandError>>({ code: 'SCHEMA_VALIDATION_FAILED' }),
    )
  })
})
