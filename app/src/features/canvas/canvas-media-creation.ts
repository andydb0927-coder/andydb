import { libraryRecordToAsset, type LibraryAssetRecord } from '../assets/library-model'
import type { CanvasCreation, Project } from '../project/model'
import type { ProcessedMedia } from '../media/browser-media-processing'
type CanvasNodePosition = Project['nodes'][number]['position']

export function buildMediaAssetCreation(
  project: Project,
  record: LibraryAssetRecord,
  position: CanvasNodePosition,
): CanvasCreation {
  const nodeId = crypto.randomUUID()
  const versionId = crypto.randomUUID()
  const title = record.name.trim().slice(0, 80) || `素材 ${project.nodes.length + 1}`
  const alreadyInProject = project.assets.some(({ id }) => id === record.id)

  return {
    node: {
      id: nodeId,
      kind: record.kind === 'video' ? 'video' : record.kind === 'image' ? 'image' : 'text',
      title,
      position,
      versions: [{
        id: versionId,
        createdAt: new Date().toISOString(),
        prompt: title,
        assetId: record.id,
      }],
      activeVersionId: versionId,
      sourceChanged: false,
      ...(record.kind === 'audio'
        ? {
            details: {
              type: 'audio' as const,
              durationSeconds: record.durationSeconds ?? 0,
              voice: '温暖女声' as const,
              speed: 1,
              volume: 80,
              modelProviderId: 'ark-tts',
            },
          }
        : {}),
    },
    ...(alreadyInProject ? {} : { asset: libraryRecordToAsset(record) }),
  }
}

export function activeNodeAsset(project: Project, nodeId: string) {
  const node = project.nodes.find(({ id }) => id === nodeId)
  const version = node?.versions.find(({ id }) => id === node.activeVersionId)
  return project.assets.find(({ id }) => id === version?.assetId)
}

export function processedMediaRecord(
  media: ProcessedMedia,
  name: string,
  kind: LibraryAssetRecord['kind'],
): LibraryAssetRecord {
  return {
    id: crypto.randomUUID(),
    name,
    kind,
    mimeType: media.mimeType,
    url: media.dataUrl,
    createdAt: new Date().toISOString(),
    source: 'project',
    folderId: 'project',
    width: media.width,
    height: media.height,
    durationSeconds: media.durationSeconds,
    ...(media.framesPerSecond === undefined ? {} : { framesPerSecond: media.framesPerSecond }),
  }
}
