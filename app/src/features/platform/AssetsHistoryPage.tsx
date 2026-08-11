import { type ChangeEvent, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { AssetLibraryRepository } from '../assets/asset-library-repository'
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
  libraryRepository?: Pick<AssetLibraryRepository, 'list' | 'importFile'>
}

type LoadState =
  | { status: 'loading' }
  | { status: 'loaded'; projects: Project[] }
  | { status: 'error' }

type LibraryLoadState =
  | { status: 'loading' }
  | { status: 'loaded'; records: LibraryAssetRecord[] }
  | { status: 'error' }

type ImportState =
  | { status: 'idle' }
  | { status: 'busy' }
  | { status: 'success'; message: string }
  | { status: 'error'; message: string }

type AssetKindFilter = 'all' | LibraryAssetRecord['kind']

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
        if (active) setLibraryLoadState({ status: 'loaded', records })
      })
      .catch(() => {
        if (active) setLibraryLoadState({ status: 'error' })
      })
    return () => {
      active = false
    }
  }, [libraryRepository])

  const projects = loadState.status === 'loaded' ? loadState.projects : []

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
  const libraryRecords =
    libraryLoadState.status === 'loaded' ? libraryLoadState.records : []
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

  const attachAsset = async (record: LibraryAssetRecord) => {
    if (!selectedProjectId) return

    setAttachError(undefined)
    setAttachingAssetId(record.id)
    try {
      const latestProject = await repository.load(selectedProjectId)
      if (!latestProject) throw new Error('Project not found')
      const attached = attachLibraryAssetToProject(record, latestProject)
      await repository.save(attached.project)
      const hydrated = await useProjectStore
        .getState()
        .hydrate(latestProject.id, repository)
      if (!hydrated) throw new Error('Project hydration failed')
      navigate(`/project/${latestProject.id}?focus=${attached.node.id}`)
    } catch {
      setAttachError('无法添加素材到项目')
      setAttachingAssetId(undefined)
    }
  }

  return (
    <main className="platform-page">
      <header className="platform-page__header">
        <p className="platform-page__eyebrow">LOCAL CREATIVE RECORD</p>
        <h1>素材与历史</h1>
        <p>从已保存项目读取素材、当前版本与任务记录。</p>
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
                  </div>
                  {record.kind === 'audio' ? (
                    <p>将在专业剪辑阶段使用</p>
                  ) : project ? (
                    <button
                      type="button"
                      aria-busy={attachingAssetId === record.id}
                      disabled={attachingAssetId !== undefined}
                      onClick={() => void attachAsset(record)}
                    >
                      添加 {record.name} 到项目并打开画布
                    </button>
                  ) : (
                    <p>创建项目后可添加到画布</p>
                  )}
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
            <Link to="/">返回项目空间</Link>
          </section>
        ) : null}

        {loadState.status === 'loaded' && projects.length === 0 ? (
          <section className="platform-page__empty">
            <h2>尚无可查看的素材</h2>
            <p>创建项目后，这里会显示画布引用的素材与版本历史。</p>
            <Link to="/">创建项目</Link>
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
                  {project.assets.map((asset) => (
                    <li key={asset.id}>
                      <div>
                        <strong>{asset.id}</strong>
                        <span>{asset.kind} · {asset.mimeType}</span>
                      </div>
                      <span>
                        {asset.width && asset.height
                          ? `${asset.width} × ${asset.height}`
                          : asset.durationSeconds
                            ? `${asset.durationSeconds} 秒`
                            : '未记录尺寸'}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="platform-section__empty">此项目尚未引用素材。</p>
              )}
            </section>

            <section className="platform-section" aria-labelledby="version-list-title">
              <div className="platform-section__heading">
                <div>
                  <p>当前版本</p>
                  <h2 id="version-list-title">节点来源</h2>
                </div>
                <span>{project.nodes.length} 个节点</span>
              </div>
              <ul className="platform-record-list">
                {project.nodes.map((node) => {
                  const version = node.versions.find(
                    (candidate) => candidate.id === node.activeVersionId,
                  )
                  return (
                    <li key={node.id}>
                      <div>
                        <strong>{node.title}</strong>
                        <span>{version?.prompt ?? '尚无版本提示词'}</span>
                      </div>
                      <Link to={`/project/${project.id}?focus=${node.id}`}>
                        在画布中查看 {node.title}
                      </Link>
                    </li>
                  )
                })}
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
    </main>
  )
}
