import type { CanvasNode, Project, SubjectReference } from '../project/model'
import type { GenerationRequest } from '../generation/generation-adapter'
import type { CreateSubjectInput, SubjectAsset } from './subject-model'

export const subjectSimilarityThreshold = 0.72
export interface SimilarSubject { subject: SubjectAsset; score: number; sameSource: boolean }

function terms(input: string) {
  const result = new Set<string>()
  for (const token of input.toLowerCase().match(/[a-z0-9]+|[\p{Script=Han}]+/gu) ?? []) {
    if (/^[a-z0-9]+$/.test(token) || token.length < 2) result.add(token)
    else for (let index = 0; index < token.length - 1; index++) result.add(token.slice(index, index + 2))
  }
  return result
}
export function findSimilarSubjects(input: CreateSubjectInput, subjects: SubjectAsset[]): SimilarSubject[] {
  const left = terms([input.description, ...input.tags].join(' '))
  return subjects.flatMap(subject => {
    const sameSource = subject.sampleImages.includes(input.coverUrl) || subject.coverUrl === input.coverUrl
    const right = terms([subject.description, ...subject.tags].join(' '))
    const overlap = [...left].filter(term => right.has(term)).length
    const union = new Set([...left, ...right]).size
    const textual = union ? overlap / union : 0
    const ratios = input.width && input.height && subject.width && subject.height
      ? [input.width / input.height, subject.width / subject.height] : undefined
    const score = sameSource ? 1 : ratios
      ? 0.85 * textual + 0.15 * Math.min(...ratios) / Math.max(...ratios) : textual
    return score > subjectSimilarityThreshold ? [{ subject, score, sameSource }] : []
  }).sort((a, b) => b.score - a.score)
}

export function subjectSnapshot(subject: SubjectAsset): SubjectReference {
  return { id: subject.id, name: subject.name, description: subject.description, coverUrl: subject.coverUrl, mimeType: subject.mimeType ?? 'image/png' }
}
export function isSubjectReference(value: unknown): value is SubjectReference {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<SubjectReference>
  return typeof item.id === 'string' && Boolean(item.id) && typeof item.name === 'string' && item.name.length <= 80 &&
    typeof item.description === 'string' && item.description.length <= 400 && typeof item.coverUrl === 'string' &&
    /^(https?:\/\/|data:image\/|\/)/.test(item.coverUrl) && !item.coverUrl.startsWith('//') &&
    typeof item.mimeType === 'string' && item.mimeType.startsWith('image/')
}
export function collectNodeSubjects(project: Project, node: CanvasNode): SubjectReference[] {
  const ids = new Set([node.id, ...project.edges.filter(edge => edge.targetNodeId === node.id).map(edge => edge.sourceNodeId)])
  const references = project.nodes.filter(source => ids.has(source.id) && source.subjectId).flatMap(source => {
    if (source.subjectSnapshot) return [{ ...source.subjectSnapshot }]
    const version = source.versions.find(version => version.id === source.activeVersionId)
    const asset = project.assets.find(asset => asset.id === version?.assetId && asset.kind === 'image')
    return asset ? [{ id: source.subjectId!, name: source.title, description: (version?.prompt ?? '').slice(0, 400), coverUrl: asset.url, mimeType: asset.mimeType }] : []
  })
  return [...new Map(references.map(reference => [reference.id, reference])).values()]
}

/** Refresh only before a NEW submission. Retries/history reuse the confirmed snapshot. */
export async function resolveSubjectRequest(request: GenerationRequest, repository: { get(id: string): Promise<SubjectAsset | undefined> }): Promise<GenerationRequest> {
  if (!request.subjects?.length) return request
  try {
    const subjects = await Promise.all(request.subjects.map(async snapshot => {
      const current = await repository.get(snapshot.id)
      return current ? subjectSnapshot(current) : { ...snapshot }
    }))
    return { ...request, subjects }
  } catch { throw new Error('主体资料读取失败，请重试；尚未提交生成。') }
}

/** Retry uses the confirmed snapshot rather than a later subject selection. */
export function restoreTaskSubjects(request: GenerationRequest, subjects?: SubjectReference[]): GenerationRequest {
  return { ...request, subjects: subjects?.map(subject => ({ ...subject })) }
}

/** Dispatch-only: preserve original editor/version text and add the confirmed reference images. */
export function prepareSubjectRequest(request: GenerationRequest): GenerationRequest {
  if (!request.subjects?.length) return request
  if (!request.subjects.every(isSubjectReference)) throw new Error('主体参考资料无效，请重新选择。')
  const subjects = [...new Map(request.subjects.map(subject => [subject.id, subject])).values()]
  const instructions = `保持参考主体一致（以以下特征为准）：\n${subjects.map(subject => `${subject.name}：${subject.description || '保持来源图片中的可见特征'}`).join('\n')}`
  const referenceAssets = [...new Map([...request.referenceAssets, ...subjects.map(subject => ({ kind: 'image' as const, url: subject.coverUrl, mimeType: subject.mimeType }))].map(reference => [reference.url, reference])).values()]
  return request.targetKind === 'text'
    ? { ...request, systemPromptPrefix: [request.systemPromptPrefix, instructions].filter(Boolean).join('\n\n') }
    : { ...request, prompt: `${instructions}\n\n${request.prompt}`, referenceAssets }
}

export interface SubjectProjectUsage { projectId: string; title: string; nodeReferences: number; characterReferences: number; shotReferences: number; generationCount: number }
export interface SubjectUsage extends Omit<SubjectProjectUsage, 'projectId' | 'title'> { projects: SubjectProjectUsage[] }
export function subjectUsage(subjectId: string, projects: Project[]): SubjectUsage {
  const records = projects.map(project => {
    const nodes = [...project.nodes, ...(project.canvases ?? []).filter(canvas => canvas.id !== project.activeCanvasId).flatMap(canvas => canvas.nodes)]
    const unique = [...new Map(nodes.map(node => [node.id, node])).values()]
    const record: SubjectProjectUsage = { projectId: project.id, title: project.title, nodeReferences: 0, characterReferences: 0, shotReferences: 0, generationCount: 0 }
    for (const node of unique) {
      if (node.subjectId === subjectId || node.generationConfig?.subjects?.some(subject => subject.id === subjectId)) record.nodeReferences++
      if (node.details?.type === 'script') {
        const characters = (node.details.characters ?? []).filter(character => character.subjectId === subjectId)
        record.characterReferences += characters.length
        record.shotReferences += (node.details.shots ?? []).filter(shot => characters.some(character => shot.characterIds.includes(character.id))).length
      }
    }
    record.generationCount = project.jobs.filter(job => job.generationConfig?.subjects?.some(subject => subject.id === subjectId)).length
    return record
  }).filter(record => record.nodeReferences + record.characterReferences + record.shotReferences + record.generationCount > 0)
  return { projects: records, nodeReferences: records.reduce((n, r) => n + r.nodeReferences, 0), characterReferences: records.reduce((n, r) => n + r.characterReferences, 0), shotReferences: records.reduce((n, r) => n + r.shotReferences, 0), generationCount: records.reduce((n, r) => n + r.generationCount, 0) }
}
