import type { CanvasNode, Project } from '../project/model'
import {
  libraryRecordToAsset,
  type LibraryAssetRecord,
} from './library-model'

export interface AttachAssetEnvironment {
  now(): string
  randomId(): string
}

export interface AttachLibraryAssetResult {
  project: Project
  node: CanvasNode
}

export class UnsupportedLibraryAssetError extends Error {
  constructor() {
    super('音频素材将在专业剪辑阶段开放')
    this.name = 'UnsupportedLibraryAssetError'
  }
}

const defaultEnvironment: AttachAssetEnvironment = {
  now: () => new Date().toISOString(),
  randomId: () => crypto.randomUUID(),
}

function nextPlacement(project: Project): CanvasNode['position'] {
  const x = project.nodes.length === 0
    ? 340
    : Math.max(...project.nodes.map((node) => node.position.x)) + 340
  let y = 80

  while (project.nodes.some((node) => node.position.x === x && node.position.y === y)) {
    y += 220
  }

  return { x, y }
}

function projectIds(project: Project): Set<string> {
  return new Set([
    ...project.assets.map(({ id }) => id),
    ...project.nodes.flatMap((node) => [
      node.id,
      ...node.versions.map(({ id }) => id),
    ]),
  ])
}

export function attachLibraryAssetToProject(
  record: LibraryAssetRecord,
  project: Project,
  environment: AttachAssetEnvironment = defaultEnvironment,
): AttachLibraryAssetResult {
  if (record.kind === 'audio') {
    throw new UnsupportedLibraryAssetError()
  }

  const usedIds = projectIds(project)
  const takeId = () => {
    let id = environment.randomId()
    while (usedIds.has(id)) id = environment.randomId()
    usedIds.add(id)
    return id
  }
  const nodeId = takeId()
  const versionId = takeId()
  const createdAt = environment.now()
  const node: CanvasNode = {
    id: nodeId,
    kind: record.kind,
    title: record.name,
    position: nextPlacement(project),
    versions: [
      {
        id: versionId,
        createdAt,
        prompt: record.name,
        assetId: record.id,
      },
    ],
    activeVersionId: versionId,
    sourceChanged: false,
  }

  return {
    node,
    project: {
      ...project,
      updatedAt: createdAt,
      assets: project.assets.some(({ id }) => id === record.id)
        ? project.assets
        : [...project.assets, libraryRecordToAsset(record)],
      nodes: [...project.nodes, node],
    },
  }
}
