import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import type { Project } from '../project/model'
import { ProjectRepository } from '../project/project-repository'
import { useProjectStore } from '../project/project-store'

export interface AssetsHistoryPageProps {
  repository?: Pick<ProjectRepository, 'listRecent'>
}

type LoadState =
  | { status: 'loading' }
  | { status: 'loaded'; projects: Project[] }
  | { status: 'error' }

const defaultRepository = new ProjectRepository()

function readableJobStatus(status: Project['jobs'][number]['status']) {
  return {
    queued: '等待处理',
    running: '处理中',
    succeeded: '已完成',
    failed: '失败',
    cancelled: '已取消',
  }[status]
}

export function AssetsHistoryPage({
  repository = defaultRepository,
}: AssetsHistoryPageProps) {
  const activeProjectId = useProjectStore((state) => state.activeProjectId)
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' })
  const [selectedProjectId, setSelectedProjectId] = useState<string>()

  useEffect(() => {
    let active = true
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

  return (
    <main className="platform-page">
      <header className="platform-page__header">
        <p className="platform-page__eyebrow">LOCAL CREATIVE RECORD</p>
        <h1>素材与历史</h1>
        <p>从已保存项目读取素材、当前版本与任务记录。</p>
      </header>

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
        <div className="platform-page__body">
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
        </div>
      ) : null}
    </main>
  )
}
