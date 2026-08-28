import type { CanvasNode, GenerationJob, Project, ScriptNodeDetails, ScriptShot } from '../project/model'
import { useProjectStore } from '../project/project-store'
import type { ProjectRepository } from '../project/project-repository'
import type { SubjectRepository } from '../subjects/subject-repository'
import { parseSubjectDescription, subjectExtractionId } from '../generation/ark-subject-extraction-provider'
import { GenerationQueue } from '../generation/generation-queue'
import { RegistryGenerationAdapter } from '../generation/registry-generation-adapter'
import { isProviderEnabled, providerGenerationCost, type ProviderRegistry } from '../generation/model-provider-registry'
import { isActiveTask } from '../generation/task-status'
import { generationEligibilityFailure } from '../canvas/canvas-generation-request'
import type { GenerationRequest, GenerationResult } from '../generation/generation-adapter'
import { ImageSizeResolver } from '../generation/image-size-resolver'
import { buildScriptShotRequest, scriptBreakdownProviderId, scriptStoryboardProviderId, scriptShotRange, scriptJobAction, type ScriptImageParameters } from './script-workflow'
import { sendScriptShotToCanvas } from './script-canvas-actions'
import { resolveSubjectRequest, findSimilarSubjects, type SimilarSubject } from '../subjects/subject-consistency'
import type { CreateSubjectInput } from '../subjects/subject-model'

interface RunnerOptions {
  projectId: string
  canvasId?: string
  registry: ProviderRegistry
  repository: Pick<ProjectRepository, 'save'>
  subjects: Pick<SubjectRepository, 'create' | 'get' | 'list'> & Partial<Pick<SubjectRepository, 'merge'>>
  onSimilarSubjects?(input: CreateSubjectInput, candidates: SimilarSubject[]): Promise<'create' | string | undefined>
  onChange?(state: { busy: boolean; message: string }): void
}
interface CompletedJob { job: GenerationJob; result?: GenerationResult }

/** One scoped queue, the same task contract and persistence path as normal canvas generation. */
export class ScriptWorkflowRunner {
  private readonly options: RunnerOptions
  private readonly queue: GenerationQueue
  private readonly waiting = new Map<string, (value: CompletedJob) => void>()
  private readonly results = new Map<string, GenerationResult>()
  private executing = false
  private cancelled = false
  private disposed = false
  private activeJobId?: string

  constructor(options: RunnerOptions) {
    this.options = options
    this.queue = new GenerationQueue({
      adapter: new RegistryGenerationAdapter(options.registry),
      getLatestSequence: id => Math.max(0, ...(useProjectStore.getState().projectsById[id]?.jobs ?? []).map(j => j.sequence ?? 0)),
      onJobChange: job => {
        if (this.inScope()) useProjectStore.getState().updateGenerationJob(options.projectId, job)
        if (!isActiveTask(job.status)) {
          this.waiting.get(job.id)?.({ job, result: this.results.get(job.id) })
          this.waiting.delete(job.id)
          this.results.delete(job.id)
        } else this.feedback(`${job.modelName ?? '脚本'}：${job.status === 'queued' ? '已提交' : `生成中 ${job.progress ?? 0}%`}`)
      },
      onSuccess: (job, result) => {
        this.current()
        useProjectStore.getState().applyGenerationSuccess(options.projectId, job, result)
        this.results.set(job.id, result)
      },
    })
  }

  private inScope() {
    const project = useProjectStore.getState().activeProject
    return project?.id === this.options.projectId && project.activeCanvasId === this.options.canvasId
  }
  private current(): Project {
    if (!this.inScope()) throw new Error('画布已切换，本轮任务已停止。')
    return useProjectStore.getState().activeProject!
  }
  private source(nodeId: string): { project: Project; node: CanvasNode; details: ScriptNodeDetails } {
    const project = this.current()
    const node = project.nodes.find(node => node.id === nodeId)
    if (node?.details?.type !== 'script') throw new Error('脚本节点不存在。')
    return { project, node, details: node.details }
  }
  private feedback(message: string) { this.options.onChange?.({ busy: this.executing, message }) }
  private async exclusive<T>(nodeId: string, operation: () => Promise<T>): Promise<T> {
    const { project } = this.source(nodeId)
    if (this.executing || project.jobs.some(j => j.nodeId === nodeId && isActiveTask(j.status))) throw new Error('脚本任务正在执行，请等待完成。')
    if (this.disposed) throw new Error('工作台已关闭，请重新打开。')
    this.executing = true; this.cancelled = false
    try { return await operation() }
    finally { this.executing = false; this.activeJobId = undefined; this.options.onChange?.({ busy: false, message: '' }) }
  }
  private validate(request: GenerationRequest) {
    const failure = generationEligibilityFailure(request, this.options.registry)
    if (failure) throw new Error(failure)
    this.options.registry.resolve(request)
  }
  private async save() {
    this.current()
    await useProjectStore.getState().persistActive(this.options.repository)
    this.current()
    if (['error', 'offline'].includes(useProjectStore.getState().saveStatus)) throw new Error('项目保存失败，已停止后续生成；结果仍在当前页面，请恢复保存后再刷新。')
  }
  private async submit(request: GenerationRequest): Promise<CompletedJob> {
    request = await resolveSubjectRequest(request, this.options.subjects)
    this.current()
    if (this.cancelled) throw new Error('本轮生成已取消，已完成结果保留。')
    this.validate(request)
    const job = this.queue.enqueue(request)
    this.activeJobId = job.id
    const completed = await new Promise<CompletedJob>(resolve => this.waiting.set(job.id, resolve))
    this.current()
    await this.save()
    if (completed.job.status === 'cancelled') throw new Error('本轮生成已取消，已完成结果保留。')
    return completed
  }

  analyze(nodeId: string, action: 'breakdown' | 'storyboard', outline?: string) {
    return this.exclusive(nodeId, async () => {
      const { project, details } = this.source(nodeId)
      const prompt = outline?.trim() ?? details.outline?.trim() ?? ''
      if (action === 'breakdown' && !prompt) throw new Error('请填写剧本原文。')
      if (action === 'storyboard' && !details.chapters.some(chapter => chapter.scenes?.length)) throw new Error('请先拆解剧本场景。')
      const request: GenerationRequest = {
        projectId: project.id, nodeId, operation: 'regenerate', targetKind: 'text',
        providerId: action === 'breakdown' ? scriptBreakdownProviderId : scriptStoryboardProviderId,
        prompt: prompt || '根据已拆解场景生成分镜。',
        parameters: { scriptV2Action: action, ...(action === 'storyboard' ? { scriptContext: JSON.stringify({ chapters: details.chapters, characters: details.characters ?? [], props: details.props ?? [] }) } : {}) },
        referenceAssets: [],
      }
      const { job } = await this.submit(request)
      if (job.status !== 'succeeded') throw new Error(job.error ?? '脚本分析失败，请重试。')
    })
  }

  quote(nodeId: string, start: number, end: number, parameters: ScriptImageParameters) {
    const { project, node, details } = this.source(nodeId)
    const provider = this.options.registry.require('seedream-5-pro-api')
    const shots = scriptShotRange(details.shots ?? [], start, end)
    const requests = shots.map(shot => buildScriptShotRequest(project, node, shot, provider, parameters))
    const cost = requests.reduce((sum, request) => sum + providerGenerationCost(provider, request.parameters), 0)
    const size = provider.sizePolicy ? new ImageSizeResolver(provider.sizePolicy).resolve(parameters) : undefined
    return { count: shots.length, cost, requests, size, provider }
  }

  generateShots(nodeId: string, start: number, end: number, parameters: ScriptImageParameters) {
    return this.exclusive(nodeId, async () => {
      const plan = this.quote(nodeId, start, end, parameters)
      if (!plan.count) throw new Error('所选分镜已有结果，无需重复生成。')
      plan.requests.forEach(request => this.validate(request))
      let completed = 0, failed = 0
      for (const request of plan.requests) {
        const { job } = await this.submit(request)
        if (job.status === 'succeeded') completed += 1
        else failed += 1
        this.feedback(`分镜已完成 ${completed}，失败 ${failed}，共 ${plan.count} 镜。`)
      }
      return { completed, failed }
    })
  }

  updateShot(nodeId: string, shotId: string, changes: Partial<Pick<ScriptShot, 'title' | 'shotSize' | 'cameraAngle' | 'cameraMovement' | 'prompt' | 'characterIds'>>) {
    if (this.executing) throw new Error('任务正在执行，完成后可编辑分镜。')
    const { details } = this.source(nodeId)
    useProjectStore.getState().updateNode(nodeId, { details: { ...details, shots: details.shots?.map(s => s.id === shotId ? { ...s, ...changes } : s) } })
  }

  sendShot(nodeId: string, shotId: string) {
    this.current()
    return sendScriptShotToCanvas(this.options.projectId, nodeId, shotId)
  }

  setCharacterReference(nodeId: string, characterId: string, assetId: string) {
    if (this.executing) throw new Error('任务正在执行，完成后可修改参考图。')
    const { project, details } = this.source(nodeId)
    if (assetId && !project.assets.some(asset => asset.id === assetId && asset.kind === 'image')) throw new Error('角色参考图不存在。')
    useProjectStore.getState().updateNode(nodeId, { details: {
      ...details, characters: details.characters?.map(character => character.id === characterId
        ? { ...character, referenceAssetId: assetId || undefined, subjectId: character.referenceAssetId === assetId ? character.subjectId : undefined } : character),
    } })
  }

  extractCharacter(nodeId: string, characterId: string, assetId: string) {
    return this.exclusive(nodeId, async () => {
      const { project, details } = this.source(nodeId)
      const character = details.characters?.find(c => c.id === characterId)
      const asset = project.assets.find(a => a.id === assetId && a.kind === 'image')
      if (!character || !asset) throw new Error('请选择已上传或已生成的角色参考图。')
      if (character.subjectId && character.referenceAssetId === assetId) {
        const existing = await this.options.subjects.get(character.subjectId)
        if (existing) return existing
      }
      const provider = this.options.registry.require(subjectExtractionId)
      if (!isProviderEnabled(provider)) throw new Error(provider.disabledReason ?? '主体提取未配置。')
      const { job, result } = await this.submit({
        projectId: project.id, nodeId, operation: 'regenerate', targetKind: 'text', providerId: subjectExtractionId,
        prompt: `描述角色“${character.name}”的参考图可见外貌和服装。剧本设定：${character.description}`,
        parameters: { scriptV2Action: 'subject' }, referenceAssets: [{ kind: 'image', url: asset.url, mimeType: asset.mimeType }],
      })
      if (job.status !== 'succeeded' || !result) throw new Error(job.error ?? '主体提取失败。')
      const parsed = parseSubjectDescription(result.version.textContent ?? '')
      const input: CreateSubjectInput = {
        name: character.name, description: `${character.description}\n可见外貌：${parsed.appearance}；服装：${parsed.clothing}`.slice(0, 400), tags: parsed.tags,
        coverUrl: asset.url, sampleImages: [asset.url], sourceAssetId: asset.id, sourceProjectId: project.id,
        width: asset.width, height: asset.height, mimeType: asset.mimeType,
        aiExtraction: { appearance: parsed.appearance, clothing: parsed.clothing, providerId: subjectExtractionId, modelName: provider.modelName, extractedAt: new Date().toISOString(), usage: result.usage },
      }
      const candidates = findSimilarSubjects(input, await this.options.subjects.list())
      let choice: string | undefined = 'create'
      if (candidates.length) {
        if (!this.options.onSimilarSubjects) throw new Error('发现相似主体，请在脚本工作台确认合并或仍新建。')
        choice = await this.options.onSimilarSubjects(input, candidates)
      }
      this.current()
      if (!choice || this.cancelled || this.disposed) throw new Error('已取消主体保存，未创建或合并记录。')
      const subject = choice === 'create' ? await this.options.subjects.create(input)
        : await (this.options.subjects.merge?.(choice, input) ?? Promise.reject(new Error('主体合并暂不可用。')))
      const latest = this.source(nodeId).details
      useProjectStore.getState().updateNode(nodeId, { details: { ...latest, characters: latest.characters?.map(c => c.id === characterId ? { ...c, subjectId: subject.id, referenceAssetId: asset.id } : c) } })
      await this.save()
      return subject
    })
  }

  cancel() { this.cancelled = true; if (this.activeJobId) this.queue.cancel(this.activeJobId) }
  resume() {
    this.disposed = false
    this.queue.resume()
    if (!this.inScope()) return
    const project = this.current()
    const nodeIds = new Set(project.nodes.filter(node => node.details?.type === 'script').map(node => node.id))
    // A fresh browser cannot resume an in-flight HTTP request. Never silently re-charge it.
    for (const job of project.jobs) {
      if (nodeIds.has(job.nodeId) && scriptJobAction(job) && isActiveTask(job.status) && !this.queue.get(job.id)) {
        useProjectStore.getState().updateGenerationJob(project.id, { ...job, status: 'cancelled', error: '上次脚本任务已中断，已完成结果保留；请确认费用后重试。', updatedAt: new Date().toISOString() })
      }
    }
  }
  dispose() { this.cancel(); this.disposed = true; this.queue.dispose() }
}
