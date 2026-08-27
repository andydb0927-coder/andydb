import type { CanvasNode, ScriptNodeDetails } from '../project/model'
import { isActiveTask, isTaskStatus } from '../generation/task-status'

/** The extra references owned by the script, in addition to normal node versions. */
export function scriptAssetReferences(details: CanvasNode['details']): string[] {
  if (details?.type !== 'script') return []
  return [...new Set([
    ...(details.shots ?? []).flatMap(shot => shot.assetId ? [shot.assetId] : []),
    ...(details.characters ?? []).flatMap(character => character.referenceAssetId ? [character.referenceAssetId] : []),
  ])]
}

export function detachScriptAsset(details: CanvasNode['details'], assetId: string): CanvasNode['details'] {
  if (details?.type !== 'script') return details
  return {
    ...details,
    characters: details.characters?.map(character => character.referenceAssetId === assetId
      ? { ...character, referenceAssetId: undefined, subjectId: undefined } : character),
    shots: details.shots?.map(shot => shot.assetId === assetId
      ? { ...shot, assetId: undefined, generationJobId: undefined, canvasNodeId: undefined, status: 'cancelled', error: '结果资产已删除，可重新生成。' } : shot),
  }
}

export function remapScriptReferences(details: CanvasNode['details'], assetIds: ReadonlyMap<string, string>, nodeIds: ReadonlyMap<string, string>): CanvasNode['details'] {
  if (details?.type !== 'script') return details
  return {
    ...details,
    // Subjects/jobs are not imported by workflow JSON; do not retain dangling identities.
    characters: details.characters?.map(character => ({ ...character, subjectId: undefined, referenceAssetId: character.referenceAssetId ? assetIds.get(character.referenceAssetId) : undefined })),
    shots: details.shots?.map(shot => ({
      ...shot, generationJobId: undefined,
      assetId: shot.assetId ? assetIds.get(shot.assetId) : undefined,
      canvasNodeId: shot.canvasNodeId ? nodeIds.get(shot.canvasNodeId) : undefined,
      ...(shot.status && isActiveTask(shot.status) ? { status: 'cancelled' as const, error: '导入不自动恢复生成，请确认费用后重试。' } : {}),
    })),
  }
}

function record(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value) }
function fields(value: unknown, required: string[], optional: string[] = []) {
  return record(value) && required.every(key => typeof value[key] === 'string') && optional.every(key => value[key] === undefined || typeof value[key] === 'string')
}
function optionalList(value: unknown, validate: (item: unknown) => boolean) { return value === undefined || (Array.isArray(value) && value.every(validate)) }

/** Legacy scripts without v2 fields remain valid; malformed external JSON is rejected early. */
export function isScriptDetailsShape(value: unknown): value is ScriptNodeDetails {
  if (!record(value) || value.type !== 'script' || !Array.isArray(value.chapters)) return false
  return value.chapters.every(chapter => fields(chapter, ['id', 'title', 'summary']) && record(chapter) && optionalList(chapter.scenes, scene => fields(scene, ['id', 'title', 'summary']))) &&
    optionalList(value.characters, character => fields(character, ['id', 'name', 'description'], ['referenceAssetId', 'subjectId'])) &&
    optionalList(value.props, prop => fields(prop, ['id', 'name', 'description'])) &&
    optionalList(value.shots, shot => fields(shot, ['id', 'sceneId', 'title', 'shotSize', 'cameraAngle', 'cameraMovement', 'prompt'], ['assetId', 'canvasNodeId', 'generationJobId', 'error']) && record(shot) && (shot.status === undefined || isTaskStatus(shot.status)) && Array.isArray(shot.characterIds) && shot.characterIds.every(id => typeof id === 'string'))
}
