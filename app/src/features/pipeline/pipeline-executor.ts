import type { Asset, CanvasNode, GenerationJob, Project } from '../project/model'
import { useProjectStore } from '../project/project-store'
import { WirelessCanvasDatabase, type ProjectRepository } from '../project/project-repository'
import type { GenerationAdapter, GenerationRequest, GenerationResult } from '../generation/generation-adapter'
import { GenerationQueue } from '../generation/generation-queue'
import { RegistryGenerationAdapter } from '../generation/registry-generation-adapter'
import { isPinnedArkTool } from '../generation/runtime-generation-adapter'
import { isActiveTask } from '../generation/task-status'
import type { ProviderRegistry } from '../generation/model-provider-registry'
import { buildGenerationRequest, generationEligibilityFailure } from '../canvas/canvas-generation-request'
import { arkImageUpscaleUnavailable } from '../generation/ark-image-edit-provider'
import { loadImageElement } from '../media/browser-media-processing'
import { resolveSubjectRequest } from '../subjects/subject-consistency'
import { SubjectRepository } from '../subjects/subject-repository'
import { PipelineStorageError, type PipelineRun, type PipelineStep } from './pipeline-model'
import type { PipelineExecutorContext } from './pipeline-runner'

/** Jobs may finish between the autosave debounce and a project switch. */
export function pipelineProjectSnapshot(project: Project): Project {
  return { ...project, canvases: project.canvases?.map(canvas => canvas.id === project.activeCanvasId
    ? { ...canvas, nodes: project.nodes, edges: project.edges, groups: project.groups ?? [], updatedAt: project.updatedAt }
    : canvas) }
}

function textOutput(node: CanvasNode) {
  const version = node.versions.find(version => version.id === node.activeVersionId)
  if (version?.textContent) return version.textContent
  if (node.details?.type === 'text') return node.details.content
  if (node.details?.type === 'script') return node.details.chapters.map(chapter => `${chapter.title}\n${chapter.summary}`).join('\n')
  return ''
}
function nodeAsset(project: Project, node: CanvasNode) {
  const result = node.imageResults?.find(result => result.id === node.activeResultId)
  const version = node.versions.find(version => version.id === node.activeVersionId)
  return project.assets.find(asset => asset.id === (result?.assetId ?? version?.assetId))
}
export function pipelineRequest(project: Project, node: CanvasNode, registry: ProviderRegistry): GenerationRequest {
  const sourceNodes = project.edges.filter(edge => edge.targetNodeId === node.id).flatMap(edge => project.nodes.filter(parent => parent.id === edge.sourceNodeId))
  const text = sourceNodes.map(parent => textOutput(parent)).filter(Boolean).join('\n\n')
  const own = node.details?.type === 'text' || node.details?.type === 'audio' ? node.details.prompt : node.details?.type === 'script' ? node.details.outline : node.imageGeneration?.prompt
  const prompt = [text, own?.trim() || node.versions.find(version => version.id === node.activeVersionId)?.prompt].filter(Boolean).join('\n\n')
  const configured = node.generationConfig
  const selectedProviderId = configured?.providerId ?? node.modelProviderId
  if (selectedProviderId) registry.require(selectedProviderId)
  const request = configured && isPinnedArkTool(configured.providerId)
    ? { ...structuredClone(configured), projectId: project.id, nodeId: node.id, operation: 'regenerate' as const, prompt }
    : buildGenerationRequest(project, node, 'regenerate', prompt, registry)
  if (selectedProviderId && selectedProviderId !== request.providerId) throw new Error('节点模型与当前生成类型不匹配，请先修改模型。')
  const references = sourceNodes.flatMap(parent => { const asset = nodeAsset(project, parent); return asset && asset.kind !== 'text' ? [{ url: asset.url, kind: asset.kind, mimeType: asset.mimeType }] : [] })
  if (references.length && request.parameters?.generationMode !== '文生视频') request.referenceAssets = references.map((reference, index) => ({ ...reference, ...(configured?.referenceAssets[index]?.role ? { role: configured.referenceAssets[index].role } : {}) }))
  return request
}

export function pipelineEstimate(project: Project, run: PipelineRun, registry: ProviderRegistry) {
  let amount = 0
  const issues: string[] = []
  for (const step of run.steps) {
    const node = project.nodes.find(node => node.id === step.nodeId)
    if (!node) { issues.push(`${step.title}：节点不存在。`); continue }
    if (step.config.action !== 'generate') continue
    if (node.imageTool || node.videoTool?.kind === 'upscale' || node.effectTool) { issues.push(`${node.title}：此工具尚未接入自动执行，请跳过或改为使用现有结果。`); continue }
    try {
      const request = pipelineRequest(project, node, registry)
      const provider = registry.resolve(request)
      if (provider.disabledReason || provider.kind === 'placeholder') issues.push(`${node.title}：${provider.disabledReason ?? '模型待接入'}`)
      amount += registry.describe(request).estimatedCost
    } catch { issues.push(`${node.title}：模型或参数不受支持，请检查配置。`) }
  }
  return { amount, maximum: amount * (run.policy.mode === 'retry' ? run.policy.retries + 1 : 1), issues }
}

export async function transformPipelineImage(asset: Asset, config: PipelineStep['config'], signal: AbortSignal): Promise<GenerationResult> {
  signal.throwIfAborted()
  const image = await loadImageElement(asset.url)
  signal.throwIfAborted()
  const turns = ((config.rotationQuarterTurns ?? 0) % 4 + 4) % 4
  const canvas = document.createElement('canvas')
  canvas.width = turns % 2 ? image.naturalHeight : image.naturalWidth
  canvas.height = turns % 2 ? image.naturalWidth : image.naturalHeight
  const context = canvas.getContext('2d')
  if (!context) throw new Error('当前浏览器不支持图片后处理。')
  context.translate(canvas.width / 2, canvas.height / 2)
  context.rotate(turns * Math.PI / 2)
  context.scale(config.mirrorHorizontal ? -1 : 1, config.mirrorVertical ? -1 : 1)
  context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2)
  const output: Asset = { id: crypto.randomUUID(), kind: 'image', url: canvas.toDataURL('image/png'), mimeType: 'image/png', width: canvas.width, height: canvas.height }
  return { asset: output, version: { id: crypto.randomUUID(), createdAt: new Date().toISOString(), prompt: '管线本地图片后处理', assetId: output.id }, persistence: 'project' }
}

export function createPipelineExecutor(options: {
  projectId: string; canvasId?: string; registry: ProviderRegistry; repository: Pick<ProjectRepository, 'save'>
  adapter?: GenerationAdapter
  transform?: typeof transformPipelineImage
}) {
  const dependencyEdges = structuredClone(useProjectStore.getState().projectsById[options.projectId]?.edges ?? [])
  const read = () => {
    const project = useProjectStore.getState().activeProject
    if (!project || project.id !== options.projectId || project.activeCanvasId !== options.canvasId) throw new DOMException('项目或画布已切换', 'AbortError')
    return project
  }
  const persist = async () => {
    let failure: unknown
    const active = useProjectStore.getState().activeProject
    if (active?.id !== options.projectId || active.activeCanvasId !== options.canvasId) {
      const original = useProjectStore.getState().projectsById[options.projectId]
      if (original) {
        try { await options.repository.save(pipelineProjectSnapshot(original)) }
        catch (error) { throw new PipelineStorageError(error) }
      }
      return
    }
    await useProjectStore.getState().persistActive({ save: async project => { try { await options.repository.save(project) } catch (error) { failure = error; throw error } } })
    if (failure || useProjectStore.getState().saveStatus === 'offline') throw new PipelineStorageError(failure)
  }
  const adapter = options.adapter ?? new RegistryGenerationAdapter(options.registry)
  let pending: { context: PipelineExecutorContext; resolve(value: { jobId: string }): void; reject(error: unknown): void; id?: string; cleanup(): void } | undefined
  const queue = new GenerationQueue({
    adapter: {
      describe: request => request.providerId === 'pipeline-local-image' ? { providerId: 'pipeline-local-image', providerName: '本地图片处理', modelName: '镜像与旋转', estimatedCost: 0 } : adapter.describe?.(request) ?? options.registry.describe(request),
      start: async (request, signal, progress) => {
        if (request.providerId !== 'pipeline-local-image') return adapter.start(request, signal, progress)
        const project = { ...read(), edges: dependencyEdges }, node = project.nodes.find(node => node.id === request.nodeId)!
        const parent = project.edges.filter(edge => edge.targetNodeId === node.id).map(edge => project.nodes.find(node => node.id === edge.sourceNodeId)).find(node => node && nodeAsset(project, node)?.kind === 'image')
        const asset = parent ? nodeAsset(project, parent) : nodeAsset(project, node)
        if (!asset || asset.kind !== 'image') throw new Error('图片后处理需要上游图片结果，请先生成或上传。')
        const result = await (options.transform ?? transformPipelineImage)(asset, pending!.context.step.config, signal)
        return { ...result, usage: { providerId: 'pipeline-local-image', providerName: '本地图片处理', modelName: '镜像与旋转', cost: 0, currency: 'credits' } }
      },
    },
    getLatestSequence: () => useProjectStore.getState().projectsById[options.projectId]?.jobs.reduce((max, job) => Math.max(max, job.sequence ?? 0), 0) ?? 0,
    onSuccess: (job, result) => { read(); useProjectStore.getState().applyGenerationSuccess(options.projectId, job, { ...result, persistence: 'project' }) },
    onJobChange: (job: GenerationJob) => {
      if (job.status !== 'succeeded') useProjectStore.getState().updateGenerationJob(options.projectId, job)
      pending?.context.onProgress(job.progress ?? 0, job.id)
      if (isActiveTask(job.status)) return
      const current = pending
      if (!current || (current.id && current.id !== job.id)) return
      pending = undefined; current.cleanup()
      void persist().then(() => job.status === 'succeeded' ? current.resolve({ jobId: job.id }) : current.reject(job.status === 'cancelled' ? new DOMException('管线已取消', 'AbortError') : new Error(job.error ?? '管线生成失败。')), current.reject)
    },
  })
  return {
    async execute(nodeId: string, context: PipelineExecutorContext): Promise<{ jobId?: string }> {
      context.signal.throwIfAborted()
      const project = read(), node = project.nodes.find(node => node.id === nodeId)
      if (!node) throw new Error('管线节点已被删除。')
      const completedJob = project.jobs.find(job => job.id === context.step.jobId && job.nodeId === nodeId && job.status === 'succeeded')
      if (completedJob) {
        await persist()
        context.signal.throwIfAborted()
        context.onProgress(100, completedJob.id)
        return { jobId: completedJob.id }
      }
      if (project.jobs.some(job => job.nodeId === nodeId && isActiveTask(job.status))) throw new Error('当前节点已有执行任务，请等待结束后重试。')
      if (context.step.config.action === 'reuse') {
        if (!nodeAsset(project, node) && !textOutput(node)) throw new Error('此节点没有可使用的结果，请先生成或输入内容。')
        context.onProgress(100); return {}
      }
      if (context.step.config.action === 'generate' && (node.imageTool || node.videoTool?.kind === 'upscale' || node.effectTool)) throw new Error(node.imageTool ? arkImageUpscaleUnavailable : '此工具暂不支持自动处理，请使用已有结果或跳过。')
      let request: GenerationRequest = context.step.config.action === 'image-transform'
        ? { projectId: project.id, nodeId: node.id, operation: 'regenerate', providerId: 'pipeline-local-image', targetKind: 'image', prompt: '本地图片后处理', referenceAssets: [] }
        : pipelineRequest({ ...project, edges: dependencyEdges }, node, options.registry)
      if (context.step.config.action !== 'image-transform') {
        if (request.subjects?.length) request = await resolveSubjectRequest(request, new SubjectRepository(new WirelessCanvasDatabase()))
        const failure = generationEligibilityFailure(request, options.registry)
        if (failure) throw new Error(failure)
      }
      context.signal.throwIfAborted(); read()
      return new Promise((resolve, reject) => {
        if (pending) { reject(new Error('已有管线步骤正在执行。')); return }
        const abort = () => { if (pending?.id) queue.cancel(pending.id) }
        pending = { context, resolve, reject, cleanup: () => context.signal.removeEventListener('abort', abort) }
        context.signal.addEventListener('abort', abort, { once: true })
        try { const job = queue.enqueue(request); if (pending) pending.id = job.id }
        catch (error) { pending?.cleanup(); pending = undefined; reject(error) }
      })
    },
    dispose() { queue.dispose() },
  }
}
