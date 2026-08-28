import { useEffect, useRef, useState } from 'react'
import type { Project, PipelineNodeConfig } from '../project/model'
import type { ProjectRepository } from '../project/project-repository'
import { useProjectStore } from '../project/project-store'
import type { ProviderRegistry } from '../generation/model-provider-registry'
import { generationErrorMessage } from '../generation/generation-errors'
import { isActiveTask } from '../generation/task-status'
import { PipelineRepository } from './pipeline-repository'
import { PipelineRunner } from './pipeline-runner'
import { createPipelineExecutor, pipelineProjectSnapshot } from './pipeline-executor'
import { recoverPipelineRun, type PipelineRun } from './pipeline-model'
import { createPipelineTemplate, instantiatePipelineTemplate, type PipelineTemplate } from './pipeline-template'

const defaultRepository = new PipelineRepository()

export function usePipelineAutomation(
  project: Project | undefined,
  projectRepository: Pick<ProjectRepository, 'save'>,
  registry: ProviderRegistry,
  repository = defaultRepository,
) {
  const [open, setOpen] = useState(false)
  const [startNodeId, setStartNodeId] = useState('')
  const [run, setRun] = useState<PipelineRun>()
  const [history, setHistory] = useState<PipelineRun[]>([])
  const [templates, setTemplates] = useState<PipelineTemplate[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const active = useRef<{ runner: PipelineRunner; dispose(): void } | undefined>(undefined)
  const scope = useRef(0)
  const starting = useRef(false)
  const projectId = project?.id, canvasId = project?.activeCanvasId

  useEffect(() => {
    const token = ++scope.current
    setOpen(false); setRun(undefined); setHistory([]); setError(''); setStartNodeId('')
    if (!projectId) return
    setLoading(true)
    void Promise.all([repository.list(projectId, canvasId), repository.templates()]).then(async ([runs, savedTemplates]) => {
      if (scope.current !== token) return
      const current = useProjectStore.getState().activeProject
      if (current?.id !== projectId || current.activeCanvasId !== canvasId) return
      const recovered = runs.map(item => recoverPipelineRun(item, current.jobs))
      for (let index = 0; index < runs.length; index++) {
        if (!isActiveTask(runs[index].status)) continue
        await repository.save(recovered[index])
        if (scope.current !== token) return
        for (const step of runs[index].steps) {
          const job = current.jobs.find(job => job.id === step.jobId)
          if (job && isActiveTask(job.status)) useProjectStore.getState().updateGenerationJob(projectId, { ...job, status: 'cancelled', error: '页面重载，旧任务已中断；确认后可继续管线。', updatedAt: new Date().toISOString() })
        }
      }
      setHistory(recovered); setTemplates(savedTemplates)
      setRun(recovered.find(item => isActiveTask(item.status)) ?? recovered[0])
    }).catch(cause => { if (scope.current === token) setError(generationErrorMessage(cause, '管线记录读取失败，请重新打开项目。')) }).finally(() => { if (scope.current === token) setLoading(false) })
    return () => {
      scope.current++
      const previous = active.current; active.current = undefined; starting.current = false
      if (previous) {
        if (isActiveTask(previous.runner.snapshot.status)) {
          // Synchronous abort happens before disposal; saving is allowed to finish for the old scope.
          void previous.runner.cancel(true).catch(cause => console.error('管线中断记录保存失败', generationErrorMessage(cause)))
        }
        previous.dispose()
      }
    }
  }, [projectId, canvasId, repository])

  function currentProject() {
    const current = useProjectStore.getState().activeProject
    if (!current || current.id !== projectId || current.activeCanvasId !== canvasId) throw new Error('项目或画布已切换，请重新打开管线面板。')
    return current
  }
  function attach(snapshot: PipelineRun) {
    active.current?.dispose()
    const token = scope.current
    const executor = createPipelineExecutor({ projectId: snapshot.projectId, canvasId: snapshot.canvasId, repository: projectRepository, registry })
    const runner = new PipelineRunner(snapshot, {
      execute: executor.execute, save: value => repository.save(value),
      onChange: value => {
        if (scope.current !== token) return
        setRun(value)
        setHistory(items => [value, ...items.filter(item => item.id !== value.id)].sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
      },
    })
    active.current = { runner, dispose: executor.dispose }
    return runner
  }
  function controller() {
    currentProject()
    if (!run) throw new Error('请先创建管线运行。')
    return active.current?.runner.snapshot.id === run.id ? active.current.runner : attach(run)
  }
  function perform(action: () => Promise<unknown> | void) {
    const token = scope.current
    setError('')
    void Promise.resolve().then(action).catch(cause => {
      if (scope.current === token) setError(generationErrorMessage(cause, '管线操作失败，本地结果已保留。'))
    })
  }
  return {
    open, run, history, templates, error, loading, startNodeId,
    show(nodeId?: string) { setStartNodeId(nodeId ?? run?.startNodeId ?? ''); setOpen(true) },
    close() { setOpen(false) },
    setStartNodeId,
    updateConfig(nodeId: string, config: PipelineNodeConfig) { useProjectStore.getState().updateNode(nodeId, { pipelineConfig: config }) },
    start(snapshot: PipelineRun) {
      if (starting.current || (active.current && isActiveTask(active.current.runner.snapshot.status))) return
      starting.current = true
      perform(async () => {
        try {
          const current = currentProject()
          if (snapshot.projectId !== current.id || snapshot.canvasId !== current.activeCanvasId) throw new Error('管线不属于当前画布。')
          await projectRepository.save(pipelineProjectSnapshot(current))
          currentProject()
          await attach(snapshot).start()
        } finally { starting.current = false }
      })
    },
    pause() { perform(() => controller().pause()) },
    resume() { perform(() => controller().resume()) },
    cancel() { perform(() => controller().cancel()) },
    skip(nodeId: string) { perform(() => controller().skip(nodeId)) },
    retry(nodeId: string) { perform(() => controller().retry(nodeId)) },
    saveTemplate(name: string) { perform(async () => {
      await repository.saveTemplate(createPipelineTemplate(currentProject(), startNodeId, name))
      setTemplates(await repository.templates())
    }) },
    renameTemplate(template: PipelineTemplate, name: string) { perform(async () => {
      await repository.saveTemplate({ ...template, name }); setTemplates(await repository.templates())
    }) },
    deleteTemplate(id: string) { perform(async () => { await repository.deleteTemplate(id); setTemplates(await repository.templates()) }) },
    instantiate(template: PipelineTemplate) { perform(async () => {
      currentProject()
      const imported = instantiatePipelineTemplate(template)
      useProjectStore.getState().mergeCanvasWorkflow(imported)
      await projectRepository.save(pipelineProjectSnapshot(currentProject()))
      setStartNodeId(imported.nodes[0].id)
    }) },
  }
}
