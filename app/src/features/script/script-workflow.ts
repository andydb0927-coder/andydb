import type { CanvasNode, GenerationJob, Project, ScriptChapter, ScriptCharacter, ScriptNodeDetails, ScriptProp, ScriptShot } from '../project/model'
import type { GenerationRequest, GenerationResult } from '../generation/generation-adapter'
import type { ModelProvider } from '../generation/model-provider-registry'
import { isScriptDetailsShape } from './script-project-references'

export const scriptBreakdownProviderId = 'ark-script-breakdown'
export const scriptStoryboardProviderId = 'ark-script-storyboard'
export interface ScriptBreakdown { chapters: ScriptChapter[]; characters: ScriptCharacter[]; props: ScriptProp[] }
export type ScriptImageParameters = { aspectRatio: string; resolution: string }
export type ScriptV2Action = 'breakdown' | 'storyboard' | 'shot' | 'subject'

function record(value: unknown, failure: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(failure)
  return value as Record<string, unknown>
}
function text(value: unknown, max: number, failure: string) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(failure)
  return value.trim()
}
function list(value: unknown, min: number, max: number, failure: string): unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) throw new Error(failure)
  return value
}
function json(content: string, failure: string) {
  try { return record(JSON.parse(content.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')), failure) }
  catch { throw new Error(failure) }
}

export function parseScriptBreakdown(content: string): ScriptBreakdown {
  const failure = '剧本拆解结果格式无效，请检查剧本后重试；原内容已保留。'
  const value = json(content, failure)
  let sceneCount = 0
  const chapters = list(value.chapters, 1, 20, failure).map((item, index) => {
    const chapter = record(item, failure)
    const scenes = list(chapter.scenes, 1, 40, failure).map((item, sceneIndex) => {
      const scene = record(item, failure)
      sceneCount += 1
      if (sceneCount > 40) throw new Error(failure)
      return { id: `scene-${index + 1}-${sceneIndex + 1}`, title: text(scene.title, 80, failure), summary: text(scene.summary, 1000, failure) }
    })
    return { id: `chapter-${index + 1}`, title: text(chapter.title, 80, failure), summary: text(chapter.summary, 1000, failure), scenes }
  })
  const characters = list(value.characters, 0, 20, failure).map((item, index) => {
    const character = record(item, failure)
    return { id: `character-${index + 1}`, name: text(character.name, 80, failure), description: text(character.description, 400, failure) }
  })
  if (new Set(characters.map(c => c.name)).size !== characters.length) throw new Error(failure)
  const props = list(value.props, 0, 30, failure).map((item, index) => {
    const prop = record(item, failure)
    return { id: `prop-${index + 1}`, name: text(prop.name, 80, failure), description: text(prop.description, 400, failure) }
  })
  return { chapters, characters, props }
}

export function parseScriptShots(content: string, source: Pick<ScriptNodeDetails, 'chapters' | 'characters'>): ScriptShot[] {
  const failure = '分镜结果格式无效（场景或角色引用不匹配），原分镜已保留。'
  const value = json(content, failure)
  const sceneIds = new Set(source.chapters.flatMap(chapter => chapter.scenes?.map(s => s.id) ?? []))
  const characters = source.characters ?? []
  return list(value.shots, 1, 40, failure).map((item, index) => {
    const shot = record(item, failure)
    const sceneId = text(shot.sceneId, 100, failure)
    if (!sceneIds.has(sceneId)) throw new Error(failure)
    const characterIds = list(shot.referenceCharacters, 0, 20, failure).map(name => {
      const character = characters.find(character => character.name === name)
      if (!character) throw new Error(failure)
      return character.id
    })
    return { id: `shot-${index + 1}`, sceneId, title: text(shot.title, 80, failure), shotSize: text(shot.shotSize, 60, failure), cameraAngle: text(shot.cameraAngle, 100, failure), cameraMovement: text(shot.cameraMovement, 100, failure), prompt: text(shot.prompt, 2000, failure), characterIds: [...new Set(characterIds)] }
  })
}

export function parseScriptContext(content: string): ScriptNodeDetails {
  const failure = '剧本场景资料无效，请先拆解剧本。'
  const source = { ...json(content, failure), type: 'script' }
  parseScriptBreakdown(content) // Enforce the same size/content limits as the original analysis.
  if (!isScriptDetailsShape(source)) throw new Error(failure)
  return source // Preserve persisted scene/character IDs after chapter edits.
}

export function scriptShotRange(shots: readonly ScriptShot[], start: number, end: number) {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end > shots.length) throw new Error('请选择有效的分镜区间。')
  return shots.slice(start - 1, end).filter(shot => !shot.assetId)
}

export function buildScriptShotRequest(project: Project, node: CanvasNode, shot: ScriptShot, provider: ModelProvider, parameters: ScriptImageParameters): GenerationRequest {
  const details = node.details
  if (details?.type !== 'script') throw new Error('脚本节点不存在。')
  if (!shot.prompt.trim()) throw new Error('请填写分镜提示词。')
  const characters = (details.characters ?? []).filter(c => shot.characterIds.includes(c.id))
  if (characters.length !== new Set(shot.characterIds).size) throw new Error('分镜引用的角色不存在。')
  const references = [...new Set(characters.flatMap(c => c.referenceAssetId ? [c.referenceAssetId] : []))].map(id => {
    const asset = project.assets.find(a => a.id === id && a.kind === 'image')
    if (!asset) throw new Error('角色参考图已删除，请重新选择。')
    return { kind: 'image' as const, url: asset.url, mimeType: asset.mimeType }
  })
  return {
    projectId: project.id, nodeId: node.id, operation: 'regenerate', providerId: provider.id, targetKind: 'image',
    prompt: `${shot.prompt.trim()}\n景别：${shot.shotSize}；机位：${shot.cameraAngle}；运镜意图：${shot.cameraMovement}。${characters.length ? `\n参考角色：${characters.map(c => `${c.name}（${c.description}）`).join('；')}` : ''}\n输出一张独立分镜画面，不拼宫格。`,
    parameters: { ...Object.fromEntries(Object.entries(provider.parameterSchema).flatMap(([key, definition]) => definition ? [[key, definition.defaultValue]] : [])), ...parameters, count: 1, scriptV2Action: 'shot', scriptV2ShotId: shot.id },
    referenceAssets: references,
  }
}

export function scriptJobAction(job: GenerationJob): ScriptV2Action | undefined {
  const action = job.generationConfig?.parameters?.scriptV2Action
  return action === 'breakdown' || action === 'storyboard' || action === 'shot' || action === 'subject' ? action : undefined
}

/** No side effects: the project store atomically saves this alongside assets, versions and jobs. */
export function scriptDetailsAfterResult(source: CanvasNode, job: GenerationJob, result: GenerationResult): ScriptNodeDetails | undefined {
  if (source.details?.type !== 'script') return undefined
  const details = source.details
  const action = scriptJobAction(job)
  if (action === 'breakdown') return { ...details, ...parseScriptBreakdown(result.version.textContent ?? ''), shots: [], outline: job.prompt, generatedByModel: job.modelName }
  if (action === 'storyboard') return { ...details, shots: parseScriptShots(result.version.textContent ?? '', details) }
  if (action === 'shot') {
    const shotId = job.generationConfig?.parameters?.scriptV2ShotId
    if (!details.shots?.some(s => s.id === shotId) || result.asset.kind !== 'image') throw new Error('分镜结果与来源不匹配。')
    return { ...details, shots: details.shots.map(s => s.id === shotId ? { ...s, assetId: result.asset.id, generationJobId: job.id, status: job.status, error: job.error } : s) }
  }
  return action === 'subject' ? details : undefined
}

export function scriptDetailsAfterJob(source: CanvasNode, job: GenerationJob) {
  if (source.details?.type !== 'script' || scriptJobAction(job) !== 'shot') return source.details
  return { ...source.details, shots: source.details.shots?.map(shot => shot.id === job.generationConfig?.parameters?.scriptV2ShotId ? { ...shot, generationJobId: job.id, status: job.status, error: job.error } : shot) }
}
