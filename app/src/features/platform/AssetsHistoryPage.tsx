import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { AssetLibraryRepository } from '../assets/asset-library-repository'
import { AssetDeleteDialog } from '../assets/AssetDeleteDialog'
import { attachLibraryAssetToProject } from '../assets/attach-library-asset'
import type { LibraryAssetRecord } from '../assets/library-model'
import type { Project } from '../project/model'
import {
  ProjectRepository,
  WirelessCanvasDatabase,
} from '../project/project-repository'
import { useProjectStore } from '../project/project-store'

export interface AssetsHistoryPageProps {
  repository?: Pick<ProjectRepository, 'listRecent' | 'load' | 'save'>
  libraryRepository?: Pick<
    AssetLibraryRepository,
    'list' | 'importFile' | 'deleteUnreferenced'
  >
}

type LoadState =
  | { status: 'loading' }
  | { status: 'loaded'; projects: Project[] }
  | { status: 'error' }

type LibraryLoadState =
  | { status: 'loading' }
  | { status: 'loaded'; records: LibraryAssetRecord[]; warning?: string }
  | { status: 'error' }

type ImportState =
  | { status: 'idle' }
  | { status: 'busy' }
  | { status: 'success'; message: string }
  | { status: 'error'; message: string }

type AssetKindFilter = 'all' | LibraryAssetRecord['kind']

interface PendingCanvasOpen {
  recordId: string
  recordName: string
  projectId: string
  nodeId: string
}

interface PendingAssetDelete {
  record: LibraryAssetRecord
  trigger: HTMLButtonElement
}

type DeleteFeedback =
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string }

const defaultDatabase = new WirelessCanvasDatabase()
const defaultRepository = new ProjectRepository(defaultDatabase)
const defaultLibraryRepository = new AssetLibraryRepository(defaultDatabase)

const assetKinds: Array<{ value: AssetKindFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'image', label: '图片' },
  { value: 'video', label: '视频' },
  { value: 'audio', label: '音频' },
]

function readableJobStatus(status: Project['jobs'][number]['status']) {
  return {
    queued: '等待处理',
    running: '处理中',
    succeeded: '已完成',
    failed: '失败',
    cancelled: '已取消',
  }[status]
}

function readableAssetKind(kind: LibraryAssetRecord['kind']) {
  return {
    image: '图片',
    video: '视频',
    audio: '音频',
  }[kind]
}

function readableAssetSource(source: LibraryAssetRecord['source']) {
  return {
    upload: '本地上传',
    generated: '生成结果',
    project: '项目补录',
    'built-in': '内置素材',
  }[source]
}

function readableCreatedAt(createdAt: string) {
  const utcMatch = createdAt.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})[^Z]*Z$/)
  return utcMatch ? `${utcMatch[1]} ${utcMatch[2]} UTC` : createdAt
}

function readableByteSize(byteSize: number | undefined) {
  if (byteSize === undefined) return '未记录'
  if (byteSize < 1024) return `${byteSize} B`
  const units = ['KiB', 'MiB', 'GiB']
  let value = byteSize / 1024
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${Number.isInteger(value) ? value : value.toFixed(1)} ${units[unitIndex]}`
}

function recordDimensions(record: LibraryAssetRecord) {
  if (record.width && record.height) return `${record.width} × ${record.height}`
  if (record.durationSeconds) return `${record.durationSeconds} 秒`
  return '未记录'
}

function mergeLibraryRecords(
  current: LibraryAssetRecord[],
  incoming: LibraryAssetRecord[],
) {
  const currentIds = new Set(current.map((record) => record.id))
  return [
    ...current,
    ...incoming.filter((record) => !currentIds.has(record.id)),
  ]
}

function LibraryPreview({ record }: { record: LibraryAssetRecord }) {
  if (record.kind === 'image') {
    return <img src={record.url} alt="" />
  }
  if (record.kind === 'video') {
    return <video src={record.url} muted playsInline preload="metadata" />
  }
  return <span aria-hidden="true">音频</span>
}

export function AssetsHistoryPage({
  repository = defaultRepository,
  libraryRepository = defaultLibraryRepository,
}: AssetsHistoryPageProps) {
  const navigate = useNavigate()
  const activeProjectId = useProjectStore((state) => state.activeProjectId)
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' })
  const [libraryLoadState, setLibraryLoadState] = useState<LibraryLoadState>({
    status: 'loading',
  })
  const [selectedProjectId, setSelectedProjectId] = useState<string>()
  const [query, setQuery] = useState('')
  const [kindFilter, setKindFilter] = useState<AssetKindFilter>('all')
  const [importState, setImportState] = useState<ImportState>({ status: 'idle' })
  const [attachingAssetId, setAttachingAssetId] = useState<string>()
  const [attachError, setAttachError] = useState<string>()
  const [pendingCanvasOpen, setPendingCanvasOpen] = useState<PendingCanvasOpen>()
  const [pendingAssetDelete, setPendingAssetDelete] =
    useState<PendingAssetDelete>()
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteFeedback, setDeleteFeedback] = useState<DeleteFeedback>()
  const deletedAssetIdsRef = useRef(new Set<string>())

  useEffect(() => {
    let active = true
    setLoadState({ status: 'loading' })
    void repository
      .listRecent(12)
      .then((projects) => {
        if (active) setLoadState({ status: 'loaded', projects })
      })
      .catch(() => {
        if (active) setLoadState({ status: 'error' })
      })
    return () => {
      active = false
    }
  }, [repository])

  useEffect(() => {
    let active = true
    setLibraryLoadState({ status: 'loading' })
    void libraryRepository
      .list()
      .then((records) => {
        if (!active) return
        const availableRecords = records.filter(
          (record) => !deletedAssetIdsRef.current.has(record.id),
        )
        setLibraryLoadState((current) => ({
          status: 'loaded',
          records:
            current.status === 'loaded'
              ? mergeLibraryRecords(current.records, availableRecords)
              : availableRecords,
        }))
      })
      .catch(() => {
        if (!active) return
        setLibraryLoadState((current) =>
          current.status === 'loading'
            ? { status: 'error' }
            : {
                ...current,
                warning: '目录可能未完整加载，已导入的素材仍然可用。',
              },
        )
      })
    return () => {
      active = false
    }
  }, [libraryRepository])

  const projects = useMemo(
    () => loadState.status === 'loaded' ? loadState.projects : [],
    [loadState],
  )

  useEffect(() => {
    if (projects.length === 0) return
    setSelectedProjectId((current) => {
      if (current && projects.some((project) => project.id === current)) {
        return current
      }
      if (activeProjectId && projects.some((project) => project.id === activeProjectId)) {
        return activeProjectId
      }
      return projects[0].id
    })
  }, [activeProjectId, projects])

  const project = useMemo(
    () => projects.find((candidate) => candidate.id === selectedProjectId),
    [projects, selectedProjectId],
  )
  const libraryRecords = useMemo(
    () =>
      libraryLoadState.status === 'loaded' ? libraryLoadState.records : [],
    [libraryLoadState],
  )
  const libraryRecordsById = useMemo(
    () => new Map(libraryRecords.map((record) => [record.id, record])),
    [libraryRecords],
  )
  const visibleLibraryRecords = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    return libraryRecords.filter((record) => {
      const matchesKind = kindFilter === 'all' || record.kind === kindFilter
      const matchesQuery =
        normalizedQuery.length === 0 ||
        record.name.toLocaleLowerCase().includes(normalizedQuery)
      return matchesKind && matchesQuery
    })
  }, [kindFilter, libraryRecords, query])

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setImportState({ status: 'busy' })
    try {
      const result = await libraryRepository.importFile(file)
      deletedAssetIdsRef.current.delete(result.record.id)
      setLibraryLoadState((current) => {
        if (current.status !== 'loaded') {
          return { status: 'loaded', records: [result.record] }
        }
        if (current.records.some((record) => record.id === result.record.id)) {
          return current
        }
        return { status: 'loaded', records: [result.record, ...current.records] }
      })
      setImportState({
        status: 'success',
        message:
          result.status === 'created'
            ? `已导入 ${result.record.name}`
            : '素材已存在',
      })
    } catch (error) {
      setImportState({
        status: 'error',
        message: error instanceof Error ? error.message : '无法导入素材',
      })
    } finally {
      event.target.value = ''
    }
  }

  const openSavedAsset = async (pending: PendingCanvasOpen) => {
    setAttachError(undefined)
    setAttachingAssetId(pending.recordId)
    try {
      const hydrated = await useProjectStore
        .getState()
        .hydrate(pending.projectId, repository)
      if (!hydrated) throw new Error('Project hydration failed')
      setPendingCanvasOpen(undefined)
      navigate(`/project/${pending.projectId}?focus=${pending.nodeId}`, {
        state: {
          assetAttachSuccessMessage: `已将 ${pending.recordName} 添加到项目并打开画布`,
        },
      })
    } catch {
      setAttachError('素材已添加，但暂时无法打开画布')
      setAttachingAssetId(undefined)
    }
  }

  const attachAsset = async (record: LibraryAssetRecord) => {
    const pending = pendingCanvasOpen?.recordId === record.id
      ? pendingCanvasOpen
      : undefined
    if (pending) {
      await openSavedAsset(pending)
      return
    }
    if (!selectedProjectId) return

    setAttachError(undefined)
    setAttachingAssetId(record.id)
    let saved: PendingCanvasOpen
    try {
      const latestProject = await repository.load(selectedProjectId)
      if (!latestProject) throw new Error('Project not found')
      const attached = attachLibraryAssetToProject(record, latestProject)
      await repository.save(attached.project)
      saved = {
        recordId: record.id,
        recordName: record.name,
        projectId: latestProject.id,
        nodeId: attached.node.id,
      }
      setPendingCanvasOpen(saved)
    } catch {
      setAttachError('无法添加素材到项目')
      setAttachingAssetId(undefined)
      return
    }

    await openSavedAsset(saved)
  }

  const deleteAsset = async () => {
    if (!pendingAssetDelete || deleteBusy) return
    const { record, trigger } = pendingAssetDelete
    setDeleteBusy(true)
    setDeleteFeedback(undefined)
    try {
      const result = await libraryRepository.deleteUnreferenced(record.id)
      if (result.status === 'referenced') {
        setPendingAssetDelete(undefined)
        setDeleteFeedback({
          kind: 'error',
          message: `有 ${result.projectIds.length} 个项目正在引用 ${record.name}，未删除`,
        })
        queueMicrotask(() => {
          if (trigger.isConnected) trigger.focus()
        })
        return
      }

      deletedAssetIdsRef.current.add(record.id)
      setLibraryLoadState((current) =>
        current.status === 'loaded'
          ? {
              ...current,
              records: current.records.filter(
                (candidate) => candidate.id !== record.id,
              ),
            }
          : current,
      )
      setPendingAssetDelete(undefined)
      setDeleteFeedback({
        kind: 'success',
        message:
          result.status === 'deleted'
            ? `已删除 ${record.name}`
            : `${record.name} 已不在素材库中`,
      })
    } catch {
      setDeleteFeedback({
        kind: 'error',
        message: `无法删除 ${record.name}，请重试`,
      })
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <main className="platform-page">
      <header className="platform-page__header">
        <p className="platform-page__eyebrow">LOCAL CREATIVE RECORD</p>
        <h1>素材与历史</h1>
        <p>从已保存项目读取素材、完整版本与任务记录。</p>
      </header>

      <div className="platform-page__body">
        <section className="platform-section platform-library" aria-labelledby="library-title">
          <div className="platform-section__heading">
            <div>
              <p>本地素材库</p>
              <h2 id="library-title">可复用素材</h2>
            </div>
            <label className="platform-library__upload">
              <span>上传本地素材</span>
              <input
                type="file"
                accept="image/*,video/*,audio/*"
                aria-label="上传本地素材"
                aria-busy={importState.status === 'busy'}
                disabled={importState.status === 'busy'}
                onChange={importFile}
              />
            </label>
          </div>

          <div className="platform-library__controls">
            <label>
              <span>搜索素材</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <fieldset>
              <legend>素材类型</legend>
              <div className="platform-library__filters">
                {assetKinds.map(({ value, label }) => (
                  <label key={value}>
                    <input
                      type="radio"
                      name="asset-kind"
                      value={value}
                      checked={kindFilter === value}
                      onChange={() => setKindFilter(value)}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label>
              <span>目标项目</span>
              <select
                value={selectedProjectId ?? ''}
                disabled={projects.length === 0}
                onChange={(event) => setSelectedProjectId(event.target.value)}
              >
                {projects.length === 0 ? <option value="">尚无项目</option> : null}
                {projects.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.title}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {importState.status === 'success' ? (
            <p className="platform-library__feedback" role="status">
              {importState.message}
            </p>
          ) : null}
          {importState.status === 'error' ? (
            <p className="platform-library__feedback platform-library__feedback--error" role="alert">
              {importState.message}
            </p>
          ) : null}
          {attachError ? (
            <p className="platform-library__feedback platform-library__feedback--error" role="alert">
              {attachError}
            </p>
          ) : null}
          {deleteFeedback ? (
            <p
              className={`platform-library__feedback${
                deleteFeedback.kind === 'error'
                  ? ' platform-library__feedback--error'
                  : ''
              }`}
              role={deleteFeedback.kind === 'error' ? 'alert' : 'status'}
            >
              {deleteFeedback.message}
            </p>
          ) : null}
          {libraryLoadState.status === 'loaded' && libraryLoadState.warning ? (
            <p className="platform-library__feedback platform-library__feedback--warning" role="status">
              {libraryLoadState.warning}
            </p>
          ) : null}
          {libraryLoadState.status === 'loading' ? (
            <p className="platform-section__empty" aria-live="polite">正在读取本地素材库</p>
          ) : null}
          {libraryLoadState.status === 'error' ? (
            <p className="platform-library__feedback platform-library__feedback--error" role="alert">
              无法读取本地素材库
            </p>
          ) : null}
          {libraryLoadState.status === 'loaded' && visibleLibraryRecords.length === 0 ? (
            <p className="platform-section__empty">
              {libraryRecords.length === 0 ? '尚无本地素材。' : '没有匹配的素材。'}
            </p>
          ) : null}
          {visibleLibraryRecords.length > 0 ? (
            <div className="platform-library__grid">
              {visibleLibraryRecords.map((record) => (
                <article key={record.id} aria-label={record.name} className="platform-library__card">
                  <div className={`platform-library__preview platform-library__preview--${record.kind}`}>
                    <LibraryPreview record={record} />
                  </div>
                  <div className="platform-library__card-copy">
                    <strong>{record.name}</strong>
                    <span>{readableAssetKind(record.kind)} · {record.mimeType}</span>
                    <span>来源：{readableAssetSource(record.source)}</span>
                    <span>创建时间：{readableCreatedAt(record.createdAt)}</span>
                    <span>文件大小：{readableByteSize(record.byteSize)}</span>
                    {record.width && record.height ? (
                      <span>尺寸：{recordDimensions(record)}</span>
                    ) : null}
                  </div>
                  <div className="platform-library__card-actions">
                    {record.kind === 'audio' ? (
                      <p>将在专业剪辑阶段使用</p>
                    ) : project ? (
                      <button
                        type="button"
                        aria-busy={attachingAssetId === record.id}
                        disabled={
                          attachingAssetId !== undefined ||
                          pendingAssetDelete !== undefined ||
                          (pendingCanvasOpen !== undefined &&
                            pendingCanvasOpen.recordId !== record.id)
                        }
                        onClick={() => void attachAsset(record)}
                      >
                        {pendingCanvasOpen?.recordId === record.id
                          ? `重试打开 ${pendingCanvasOpen.recordName} 的画布`
                          : `添加 ${record.name} 到项目并打开画布`}
                      </button>
                    ) : (
                      <p>创建项目后可添加到画布</p>
                    )}
                    <button
                      type="button"
                      aria-label={`删除素材：${record.name}`}
                      className="platform-library__delete"
                      disabled={
                        attachingAssetId !== undefined ||
                        pendingAssetDelete !== undefined
                      }
                      onClick={(event) => {
                        setDeleteFeedback(undefined)
                        setPendingAssetDelete({
                          record,
                          trigger: event.currentTarget,
                        })
                      }}
                    >
                      删除素材
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </section>

        {loadState.status === 'loading' ? (
          <p className="platform-page__state" role="status">正在读取本地项目</p>
        ) : null}

        {loadState.status === 'error' ? (
          <section className="platform-page__empty" role="alert">
            <h2>无法读取本地项目</h2>
            <p>请返回项目空间继续创作，或稍后重试。</p>
            <Link to="/projects">返回项目空间</Link>
          </section>
        ) : null}

        {loadState.status === 'loaded' && projects.length === 0 ? (
          <section className="platform-page__empty">
            <h2>尚无可查看的素材</h2>
            <p>创建项目后，这里会显示画布引用的素材与版本历史。</p>
            <Link to="/projects/new">创建项目</Link>
          </section>
        ) : null}

        {project ? (
          <>
            <label className="platform-page__project-picker">
              <span>选择项目</span>
              <select
                value={project.id}
                onChange={(event) => setSelectedProjectId(event.target.value)}
              >
                {projects.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.title}
                  </option>
                ))}
              </select>
            </label>

            <section className="platform-section" aria-labelledby="asset-list-title">
              <div className="platform-section__heading">
                <div>
                  <p>项目素材</p>
                  <h2 id="asset-list-title">{project.title}</h2>
                </div>
                <span>{project.assets.length} 项</span>
              </div>
              {project.assets.length ? (
                <ul className="platform-record-list">
                  {project.assets.map((asset) => {
                    const record = libraryRecordsById.get(asset.id)
                    return (
                      <li key={asset.id}>
                        <div>
                          <strong>{record?.name ?? asset.id}</strong>
                          <span>
                            {record
                              ? `${readableAssetKind(record.kind)} · ${record.mimeType}`
                              : `项目快照 · ${asset.mimeType}`}
                          </span>
                          {record ? (
                            <>
                              <span>来源：{readableAssetSource(record.source)}</span>
                              <span>创建时间：{readableCreatedAt(record.createdAt)}</span>
                              <span>文件大小：{readableByteSize(record.byteSize)}</span>
                            </>
                          ) : (
                            <span>目录记录不可用，已保留项目快照</span>
                          )}
                        </div>
                        <span>
                          {record
                            ? record.width && record.height
                              ? `尺寸：${recordDimensions(record)}`
                              : recordDimensions(record)
                            : asset.width && asset.height
                              ? `${asset.width} × ${asset.height}`
                              : asset.durationSeconds
                                ? `${asset.durationSeconds} 秒`
                                : '未记录尺寸'}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="platform-section__empty">此项目尚未引用素材。</p>
              )}
            </section>

            <section className="platform-section" aria-labelledby="version-list-title">
              <div className="platform-section__heading">
                <div>
                  <p>版本历史</p>
                  <h2 id="version-list-title">节点版本来源</h2>
                </div>
                <span>
                  {project.nodes.reduce((count, node) => count + node.versions.length, 0)} 个版本
                </span>
              </div>
              <ul className="platform-record-list platform-version-history">
                {project.nodes.map((node) => (
                  <li className="platform-version-history__node" key={node.id}>
                    <div className="platform-version-history__node-heading">
                      <strong>{node.title}</strong>
                      <Link to={`/project/${project.id}?focus=${node.id}`}>
                        在画布中查看 {node.title}
                      </Link>
                    </div>
                    {node.versions.length > 0 ? (
                      <ol className="platform-version-history__versions">
                        {node.versions
                          .map((version, index) => ({ version, index }))
                          .sort((left, right) =>
                            right.version.createdAt.localeCompare(left.version.createdAt) ||
                            left.index - right.index,
                          )
                          .map(({ version }) => {
                            const record = version.assetId
                              ? libraryRecordsById.get(version.assetId)
                              : undefined
                            return (
                              <li key={version.id}>
                                <div className="platform-version-history__version-heading">
                                  <strong>{version.id}</strong>
                                  <span>
                                    {version.id === node.activeVersionId ? '当前' : '历史'}
                                  </span>
                                </div>
                                <p>{version.prompt || '尚无版本提示词'}</p>
                                <span>创建时间：{readableCreatedAt(version.createdAt)}</span>
                                {version.assetId ? (
                                  <span>素材：{record?.name ?? version.assetId}</span>
                                ) : (
                                  <span>未关联素材</span>
                                )}
                                {version.generationJobId ? (
                                  <span>生成任务：{version.generationJobId}</span>
                                ) : null}
                              </li>
                            )
                          })}
                      </ol>
                    ) : (
                      <p>此节点尚无版本。</p>
                    )}
                  </li>
                ))}
              </ul>
            </section>

            <section className="platform-section" aria-labelledby="job-list-title">
              <div className="platform-section__heading">
                <div>
                  <p>任务记录</p>
                  <h2 id="job-list-title">生成与导出</h2>
                </div>
                <span>{project.jobs.length + project.exportJobs.length} 项</span>
              </div>
              {project.jobs.length || project.exportJobs.length ? (
                <ul className="platform-record-list">
                  {project.jobs.map((job) => (
                    <li key={job.id}>
                      <div>
                        <strong>生成 · {job.nodeId}</strong>
                        <span>{job.prompt}</span>
                      </div>
                      <span>{readableJobStatus(job.status)}</span>
                    </li>
                  ))}
                  {project.exportJobs.map((job) => (
                    <li key={job.id}>
                      <div>
                        <strong>导出 · {job.id}</strong>
                        <span>{job.error ?? '导出任务已保存在本地记录中'}</span>
                      </div>
                      <span>{readableJobStatus(job.status)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="platform-section__empty">此项目尚无生成或导出任务。</p>
              )}
            </section>
          </>
        ) : null}
      </div>
      {pendingAssetDelete ? (
        <AssetDeleteDialog
          assetName={pendingAssetDelete.record.name}
          busy={deleteBusy}
          returnFocusTo={pendingAssetDelete.trigger}
          onCancel={() => setPendingAssetDelete(undefined)}
          onConfirm={() => void deleteAsset()}
        />
      ) : null}
    </main>
  )
}
