import {
  Download,
  Eye,
  Film,
  Grid2X2,
  Image as ImageIcon,
  List,
  Music2,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import type {
  Asset,
  GenerationConfiguration,
  GenerationJob,
  Project,
} from '../project/model'

type HistoryKind = GenerationConfiguration['targetKind']
type ThumbnailSize = 'small' | 'large'

const kindCopy: Record<HistoryKind, string> = {
  image: '图片',
  video: '视频',
  audio: '音频',
}

const statusCopy: Record<GenerationJob['status'], string> = {
  queued: '排队中',
  running: '生成中',
  succeeded: '已完成',
  failed: '失败',
  cancelled: '已取消',
}

interface HistoryRecord {
  job: GenerationJob
  title: string
  kind: HistoryKind
  asset?: Asset
  config: GenerationConfiguration
}

interface GenerationHistoryPanelProps {
  project: Project
  loading?: boolean
  now?: Date
  insertionMode?: boolean
  onDeleteJobs(jobIds: string[]): void
  onResend(jobId: string): void
  onUse(jobId: string): void
}

function inferKind(project: Project, job: GenerationJob): HistoryKind {
  if (job.generationConfig) return job.generationConfig.targetKind
  const asset = project.assets.find(({ id }) => id === job.assetId)
  if (asset) return asset.kind
  const node = project.nodes.find(({ id }) => id === job.nodeId)
  if (node?.kind === 'video' || node?.kind === 'preview') return 'video'
  return 'image'
}

function historyRecords(project: Project): HistoryRecord[] {
  return project.jobs.map((job) => {
    const node = project.nodes.find(({ id }) => id === job.nodeId)
    const asset = project.assets.find(({ id }) => id === job.assetId)
    const kind = inferKind(project, job)
    return {
      job,
      kind,
      asset,
      title:
        job.status === 'succeeded' && node
          ? node.title
          : job.prompt || node?.title || '未命名任务',
      config: job.generationConfig ?? {
        targetKind: kind,
        ...(job.providerId ? { providerId: job.providerId } : {}),
        referenceAssets: [],
      },
    }
  })
}

function localDateKey(value: string) {
  const date = new Date(value)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function shiftDate(date: Date, days: number) {
  const shifted = new Date(date)
  shifted.setHours(0, 0, 0, 0)
  shifted.setDate(shifted.getDate() + days)
  return shifted
}

function formatDateHeading(value: string, now: Date) {
  const key = localDateKey(value)
  if (key === localDateKey(now.toISOString())) return '今天'
  if (key === localDateKey(shiftDate(now, -1).toISOString())) return '昨天'
  const date = new Date(value)
  return `更早 · ${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
}

function downloadAsset(asset: Asset, title: string) {
  const anchor = document.createElement('a')
  anchor.href = asset.url
  anchor.download = title
  anchor.rel = 'noopener'
  anchor.click()
}

function HistoryMedia({ record }: { record: HistoryRecord }) {
  if (record.asset?.kind === 'image') {
    return <img src={record.asset.url} alt="" />
  }
  if (record.asset?.kind === 'video') {
    return <video src={record.asset.url} muted preload="metadata" />
  }
  if (record.kind === 'audio') return <Music2 aria-hidden="true" />
  if (record.kind === 'video') return <Film aria-hidden="true" />
  return <ImageIcon aria-hidden="true" />
}

export function GenerationHistoryPanel({
  project,
  loading = false,
  now = new Date(),
  insertionMode = false,
  onDeleteJobs,
  onResend,
  onUse,
}: GenerationHistoryPanelProps) {
  const records = useMemo(() => historyRecords(project), [project])
  const [kind, setKind] = useState<HistoryKind>(() =>
    records.some((record) => record.kind === 'image')
      ? 'image'
      : records.some((record) => record.kind === 'video')
        ? 'video'
        : records.some((record) => record.kind === 'audio')
          ? 'audio'
          : 'image',
  )
  const [thumbnailSize, setThumbnailSize] =
    useState<ThumbnailSize>('large')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [previewRecord, setPreviewRecord] = useState<HistoryRecord>()
  const [resendRecord, setResendRecord] = useState<HistoryRecord>()
  const dialogTriggerRef = useRef<HTMLButtonElement | null>(null)
  const visibleRecords = useMemo(
    () => records.filter((record) => record.kind === kind),
    [kind, records],
  )
  const selectableIds = visibleRecords
    .filter(({ job }) => job.status !== 'queued' && job.status !== 'running')
    .map(({ job }) => job.id)
  const groups = useMemo(() => {
    const grouped = new Map<string, HistoryRecord[]>()
    for (const record of [...visibleRecords].sort((left, right) =>
      right.job.updatedAt.localeCompare(left.job.updatedAt),
    )) {
      const heading = formatDateHeading(record.job.updatedAt, now)
      const group = grouped.get(heading) ?? []
      group.push(record)
      grouped.set(heading, group)
    }
    return [...grouped.entries()]
  }, [now, visibleRecords])

  useEffect(() => {
    setSelectedIds((current) => {
      const visible = new Set(visibleRecords.map(({ job }) => job.id))
      return new Set([...current].filter((id) => visible.has(id)))
    })
  }, [visibleRecords])

  useEffect(() => {
    if (!previewRecord && !resendRecord) return
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopImmediatePropagation()
      setPreviewRecord(undefined)
      setResendRecord(undefined)
      queueMicrotask(() => dialogTriggerRef.current?.focus())
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [previewRecord, resendRecord])

  if (loading) {
    return (
      <div className="generation-history__loading" role="status">
        <span aria-hidden="true" />
        正在加载生成历史…
      </div>
    )
  }

  const selectedRecords = visibleRecords.filter(({ job }) =>
    selectedIds.has(job.id),
  )
  const closeDialog = () => {
    setPreviewRecord(undefined)
    setResendRecord(undefined)
    queueMicrotask(() => dialogTriggerRef.current?.focus())
  }

  return (
    <div
      className="generation-history"
      aria-label="生成历史内容"
      data-thumbnail-size={thumbnailSize}
    >
      {insertionMode ? (
        <p className="generation-history__notice">
          选择“使用”会把完成结果插入刚才的画布位置。
        </p>
      ) : null}
      <div className="generation-history__tabs" role="tablist" aria-label="历史类型">
        {(['image', 'video', 'audio'] as const).map((candidate) => {
          const count = records.filter((record) => record.kind === candidate).length
          return (
            <button
              key={candidate}
              type="button"
              role="tab"
              aria-selected={kind === candidate}
              onClick={() => setKind(candidate)}
            >
              {kindCopy[candidate]} {count}
            </button>
          )
        })}
      </div>

      <div className="generation-history__toolbar" aria-label="生成历史批量操作">
        <button
          type="button"
          onClick={() => setSelectedIds(new Set(selectableIds))}
        >
          全选当前页
        </button>
        <button
          type="button"
          onClick={() =>
            setSelectedIds((current) =>
              new Set(selectableIds.filter((id) => !current.has(id))),
            )
          }
        >
          反选当前页
        </button>
        <button
          type="button"
          disabled={!selectedRecords.some(({ asset }) => asset)}
          onClick={() => {
            for (const record of selectedRecords) {
              if (record.asset) downloadAsset(record.asset, record.title)
            }
          }}
        >
          <Download aria-hidden="true" />批量下载
        </button>
        <button
          type="button"
          disabled={selectedIds.size === 0}
          onClick={() => {
            const ids = [...selectedIds]
            onDeleteJobs(ids)
            setSelectedIds(new Set())
          }}
        >
          <Trash2 aria-hidden="true" />批量删除
        </button>
        <span className="generation-history__size-controls" aria-label="缩略图大小">
          <button
            type="button"
            aria-label="小缩略图"
            aria-pressed={thumbnailSize === 'small'}
            onClick={() => setThumbnailSize('small')}
          >
            <List aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="大缩略图"
            aria-pressed={thumbnailSize === 'large'}
            onClick={() => setThumbnailSize('large')}
          >
            <Grid2X2 aria-hidden="true" />
          </button>
        </span>
      </div>

      {groups.length ? (
        <div className="generation-history__groups">
          {groups.map(([heading, group]) => (
            <section key={heading} className="generation-history__group">
              <h3>{heading}</h3>
              <div className="generation-history__grid">
                {group.map((record) => {
                  const canUse = Boolean(
                    record.job.status === 'succeeded' && record.asset,
                  )
                  return (
                    <article
                      key={record.job.id}
                      className="generation-history__card"
                      aria-label={`历史任务 ${record.title}`}
                    >
                      <label>
                        <input
                          type="checkbox"
                          aria-label={`选择历史任务 ${record.title}`}
                          checked={selectedIds.has(record.job.id)}
                          disabled={
                            record.job.status === 'queued' ||
                            record.job.status === 'running'
                          }
                          onChange={() =>
                            setSelectedIds((current) => {
                              const next = new Set(current)
                              if (next.has(record.job.id)) next.delete(record.job.id)
                              else next.add(record.job.id)
                              return next
                            })
                          }
                        />
                        <span className="generation-history__media">
                          <HistoryMedia record={record} />
                        </span>
                      </label>
                      <div className="generation-history__meta">
                        <span>{statusCopy[record.job.status]}</span>
                        <strong>{record.title}</strong>
                        <p>{record.job.prompt}</p>
                        <small>
                          {record.job.providerName
                            ? `${record.job.providerName} · `
                            : ''}
                          {record.job.modelName ??
                            record.config.providerId ??
                            '本地演示模型'}
                          {record.job.status === 'running' &&
                          record.job.progress !== undefined
                            ? ` · ${record.job.progress}%`
                            : ''}
                          {record.job.creditsSpent !== undefined
                            ? ` · 消耗 ${record.job.creditsSpent} 积分`
                            : record.job.estimatedCost !== undefined
                              ? ` · 预计 ${record.job.estimatedCost} 积分`
                              : ''}
                        </small>
                      </div>
                      <div className="generation-history__actions">
                        <button
                          ref={previewRecord?.job.id === record.job.id ? dialogTriggerRef : undefined}
                          type="button"
                          disabled={!record.asset}
                          aria-label={`查看 ${record.title}`}
                          onClick={(event) => {
                            dialogTriggerRef.current = event.currentTarget
                            setPreviewRecord(record)
                          }}
                        >
                          <Eye aria-hidden="true" />查看
                        </button>
                        <button
                          type="button"
                          disabled={!canUse}
                          title={canUse ? undefined : '只有带素材的已完成任务可以使用'}
                          aria-label={`使用 ${record.title}`}
                          onClick={() => onUse(record.job.id)}
                        >
                          使用
                        </button>
                        <button
                          type="button"
                          disabled={!record.asset}
                          aria-label={`下载 ${record.title}`}
                          onClick={() =>
                            record.asset && downloadAsset(record.asset, record.title)
                          }
                        >
                          <Download aria-hidden="true" />下载
                        </button>
                        <button
                          type="button"
                          aria-label={`重发画布 ${record.title}`}
                          onClick={(event) => {
                            dialogTriggerRef.current = event.currentTarget
                            setResendRecord(record)
                          }}
                        >
                          <RefreshCw aria-hidden="true" />重发画布
                        </button>
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="generation-history__empty">
          <span>{kindCopy[kind].slice(0, 1)}</span>
          <strong>暂无{kindCopy[kind]}生成历史</strong>
          <p>完成一次{kindCopy[kind]}生成后，任务和配置会显示在这里。</p>
        </div>
      )}

      {previewRecord ? (
        <div
          className="generation-history-dialog generation-history-dialog--preview"
          role="dialog"
          aria-modal="true"
          aria-label={`预览 ${previewRecord.title}`}
        >
          <button type="button" aria-label="关闭预览" onClick={closeDialog}>
            <X aria-hidden="true" />
          </button>
          <div className="generation-history-dialog__media">
            {previewRecord.asset?.kind === 'image' ? (
              <img src={previewRecord.asset.url} alt={previewRecord.title} />
            ) : previewRecord.asset?.kind === 'video' ? (
              <video src={previewRecord.asset.url} controls autoPlay={false} />
            ) : previewRecord.asset?.kind === 'audio' ? (
              <audio src={previewRecord.asset.url} controls />
            ) : null}
          </div>
          <strong>{previewRecord.title}</strong>
          <p>{previewRecord.job.prompt}</p>
        </div>
      ) : null}

      {resendRecord ? (
        <div
          className="generation-history-dialog generation-history-dialog--resend"
          role="dialog"
          aria-modal="true"
          aria-label="重发画布配置"
        >
          <div className="generation-history-dialog__heading">
            <div>
              <span>RESEND TO CANVAS</span>
              <h3>确认完整配置</h3>
            </div>
            <button type="button" aria-label="取消重发" onClick={closeDialog}>
              <X aria-hidden="true" />
            </button>
          </div>
          <dl>
            <div><dt>提示词</dt><dd>{resendRecord.job.prompt}</dd></div>
            <div><dt>模型</dt><dd>{resendRecord.job.modelName ?? resendRecord.config.providerId ?? '本地演示模型'}</dd></div>
            {Object.entries(resendRecord.config.parameters ?? {}).map(([name, value]) => (
              <div key={name}><dt>参数</dt><dd>{name}：{String(value)}</dd></div>
            ))}
            <div>
              <dt>参考</dt>
              <dd>引用 {resendRecord.config.referenceAssets.length} 项</dd>
            </div>
          </dl>
          <p>确认后会在画布创建预填节点，并通过本地模型队列重新生成。</p>
          <div className="generation-history-dialog__footer">
            <button type="button" onClick={closeDialog}>取消</button>
            <button
              type="button"
              onClick={() => {
                onResend(resendRecord.job.id)
                closeDialog()
              }}
            >
              确认重新生成
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
