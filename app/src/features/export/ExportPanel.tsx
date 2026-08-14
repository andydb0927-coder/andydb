import { Download, RotateCcw, Square } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'

import type { JobStatus } from '../project/model'
import type {
  ExportAdapter,
  ExportResult,
  ExportSettings,
} from './export-adapter'
import { RegistryExportAdapter } from './registry-export-adapter'

const defaults: ExportSettings = {
  width: 1920,
  height: 1080,
  aspectRatio: '16:9',
  frameRate: 24,
  watermark: false,
}

interface ExportPanelProps {
  projectId: string
  adapter?: ExportAdapter
}

interface ExportPanelJob {
  id: number
  status: JobStatus
  settings: ExportSettings
  progress: number
  result?: ExportResult
  error?: string
}

const statusCopy: Record<JobStatus, string> = {
  queued: '排队中',
  running: '正在导出',
  succeeded: '演示导出已完成',
  failed: '导出失败',
  cancelled: '已取消',
}

export function ExportPanel({ projectId, adapter }: ExportPanelProps) {
  const defaultAdapter = useMemo(
    () => new RegistryExportAdapter(projectId),
    [projectId],
  )
  const exportAdapter = adapter ?? defaultAdapter
  const [watermark, setWatermark] = useState(false)
  const [jobs, setJobs] = useState<ExportPanelJob[]>([])
  const nextJobId = useRef(1)
  const controllers = useRef(new Map<number, AbortController>())
  const progressTimers = useRef(new Map<number, ReturnType<typeof setInterval>>())

  const patchJob = (id: number, patch: Partial<ExportPanelJob>) => {
    setJobs((current) =>
      current.map((job) => (job.id === id ? { ...job, ...patch } : job)),
    )
  }

  const clearProgress = (id: number) => {
    const timer = progressTimers.current.get(id)
    if (timer) clearInterval(timer)
    progressTimers.current.delete(id)
  }

  const run = (job: ExportPanelJob) => {
    setTimeout(() => {
      const controller = new AbortController()
      controllers.current.set(job.id, controller)
      patchJob(job.id, { status: 'running', progress: 0, error: undefined })

      let progressStep = 0
      const timer = setInterval(() => {
        progressStep += 1
        patchJob(job.id, {
          progress: Math.min(83, Math.round((progressStep / 6) * 100)),
        })
      }, 300)
      progressTimers.current.set(job.id, timer)

      void exportAdapter.start(
        job.settings,
        controller.signal,
        (progress) => patchJob(job.id, { progress }),
      ).then(
        (result) => {
          clearProgress(job.id)
          controllers.current.delete(job.id)
          patchJob(job.id, { status: 'succeeded', progress: 100, result })
        },
        (error: unknown) => {
          clearProgress(job.id)
          controllers.current.delete(job.id)
          if (controller.signal.aborted) {
            patchJob(job.id, { status: 'cancelled', progress: 0 })
            return
          }
          patchJob(job.id, {
            status: 'failed',
            error: error instanceof Error ? error.message : '未知错误',
          })
        },
      )
    }, 0)
  }

  const start = () => {
    const job: ExportPanelJob = {
      id: nextJobId.current,
      status: 'queued',
      settings: { ...defaults, watermark },
      progress: 0,
    }
    nextJobId.current += 1
    setJobs((current) => [...current, job])
    run(job)
  }

  const retry = (job: ExportPanelJob) => {
    const retried = {
      ...job,
      status: 'queued' as const,
      progress: 0,
      result: undefined,
      error: undefined,
    }
    setJobs((current) =>
      current.map((candidate) => (candidate.id === job.id ? retried : candidate)),
    )
    run(retried)
  }

  const cancel = (id: number) => {
    controllers.current.get(id)?.abort()
    clearProgress(id)
    patchJob(id, { status: 'cancelled', progress: 0 })
  }

  return (
    <section className="export-panel" aria-labelledby="export-panel-title">
      <div className="export-panel__heading">
        <div>
          <p>本地原型</p>
          <h2 id="export-panel-title">导出设置</h2>
        </div>
        <button type="button" onClick={start}>导出影片</button>
      </div>
      <div className="export-panel__settings">
        <label>
          分辨率
          <select aria-label="分辨率" value="1920×1080" disabled>
            <option>1920×1080</option>
          </select>
        </label>
        <label>
          画幅比
          <select aria-label="画幅比" value="16:9" disabled>
            <option>16:9</option>
          </select>
        </label>
        <label>
          帧率
          <select aria-label="帧率" value="24fps" disabled>
            <option>24fps</option>
          </select>
        </label>
        <label className="export-panel__watermark">
          <input
            aria-label="水印"
            type="checkbox"
            checked={watermark}
            onChange={(event) => setWatermark(event.target.checked)}
          />
          水印
        </label>
      </div>
      <ol className="export-panel__jobs" aria-label="导出任务">
        {jobs.map((job) => {
          const remainingSeconds = Math.max(
            0,
            Math.ceil(((100 - job.progress) / 100) * 1.8),
          )
          return (
            <li key={job.id} aria-label={`导出任务 ${job.id}`}>
              <div className="export-panel__job-heading">
                <strong>任务 {job.id}</strong>
                <span>{statusCopy[job.status]}</span>
              </div>
              {job.status === 'running' ? (
                <div className="export-panel__progress">
                  <div aria-label="总体进度">{job.progress}%</div>
                  <progress max={100} value={job.progress} />
                  <span>预计剩余 {remainingSeconds} 秒</span>
                  <span>可在后台继续</span>
                  <button type="button" onClick={() => cancel(job.id)}>
                    <Square aria-hidden="true" />
                    取消导出
                  </button>
                </div>
              ) : null}
              {job.status === 'failed' ? (
                <div className="export-panel__failure">
                  <span>{job.error}</span>
                  <button type="button" aria-label={`重试任务 ${job.id}`} onClick={() => retry(job)}>
                    <RotateCcw aria-hidden="true" />
                    重试
                  </button>
                </div>
              ) : null}
              {job.status === 'succeeded' && job.result ? (
                <div className="export-panel__result">
                  <span>演示导出</span>
                  {job.result.providerName && job.result.modelName ? (
                    <span>{job.result.providerName} · {job.result.modelName}</span>
                  ) : null}
                  {job.result.cost !== undefined ? (
                    <span>消耗 {job.result.cost} 积分</span>
                  ) : null}
                  <a href={job.result.downloadUrl} download>
                    <Download aria-hidden="true" />
                    下载演示文件
                  </a>
                </div>
              ) : null}
            </li>
          )
        })}
      </ol>
      <p className="export-panel__disclosure">
        此流程为确定性本地演示，不代表生产级视频渲染。
      </p>
    </section>
  )
}
