import { ArrowLeft, TriangleAlert } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { ExportPanel } from '../export/ExportPanel'
import { ProjectRepository } from '../project/project-repository'
import { useProjectStore } from '../project/project-store'
import { PreviewPlayer } from './PreviewPlayer'
import { TimelineTrack } from './TimelineTrack'
import { resolveTimeline } from './timeline-model'
import '../../styles/global.css'

type PreviewRepository = Pick<ProjectRepository, 'load'>

const defaultRepository = new ProjectRepository()

export interface PreviewPageProps {
  repository?: PreviewRepository
}

export function PreviewPage({ repository = defaultRepository }: PreviewPageProps) {
  const { projectId } = useParams<{ projectId: string }>()
  const activeProject = useProjectStore((state) => state.activeProject)
  const project = activeProject?.id === projectId ? activeProject : undefined
  const reorderProjectTimeline = useProjectStore((state) => state.reorderTimeline)
  const [activeIndex, setActiveIndex] = useState(0)
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'missing' | 'error'>(
    project ? 'ready' : 'loading',
  )
  const items = useMemo(() => (project ? resolveTimeline(project) : []), [project])
  const active = items[activeIndex] ?? items[0]

  useEffect(() => {
    if (!projectId || project) return
    const controller = new AbortController()
    void useProjectStore
      .getState()
      .hydrate(projectId, repository, controller.signal)
      .then((found) => setLoadState(found ? 'ready' : 'missing'))
      .catch(() => setLoadState('error'))
    return () => controller.abort()
  }, [project, projectId, repository])

  useEffect(() => {
    if (activeIndex >= items.length) setActiveIndex(Math.max(0, items.length - 1))
  }, [activeIndex, items.length])

  const aspectMismatch = Boolean(
    active?.aspectRatio && active.aspectRatio !== '16:9',
  )

  return (
    <main className="preview-page">
      <header className="preview-page__header">
        <div>
          <p>时间线预览</p>
          <h1>成片预览</h1>
        </div>
        {project && active ? (
          <Link to={`/project/${project.id}?focus=${active.item.nodeId}`}>
            <ArrowLeft aria-hidden="true" />
            返回画布
          </Link>
        ) : null}
      </header>
      {project ? (
        <>
          <div className="preview-page__workspace">
            <PreviewPlayer
              items={items}
              activeIndex={activeIndex}
              onActiveIndexChange={setActiveIndex}
            />
            <aside className="preview-inspector" aria-label="当前片段检查器">
              <p>当前片段</p>
              <h2>{active?.node?.title ?? '缺少片段'}</h2>
              {active ? (
                <dl>
                  <div><dt>时长</dt><dd>{active.item.durationSeconds.toFixed(2)} 秒</dd></div>
                  <div><dt>画幅比</dt><dd>{active.aspectRatio ?? '未知'}</dd></div>
                  <div><dt>来源节点</dt><dd>{active.node?.title ?? active.item.nodeId}</dd></div>
                </dl>
              ) : null}
              {active?.node?.sourceChanged ? (
                <p className="preview-inspector__warning">
                  <TriangleAlert aria-hidden="true" />
                  连续性警告：上游内容已变更
                </p>
              ) : null}
              {aspectMismatch ? (
                <div className="preview-inspector__aspect-actions">
                  <p>该片段与 16:9 成片画幅不一致。</p>
                  <button type="button">统一裁切</button>
                  <button type="button">逐镜确认</button>
                </div>
              ) : null}
            </aside>
          </div>
          <TimelineTrack
            project={project}
            items={items}
            activeIndex={activeIndex}
            onActiveIndexChange={setActiveIndex}
            onReorder={reorderProjectTimeline}
          />
          <ExportPanel projectId={project.id} />
        </>
      ) : (
        <div className="preview-page__state" role={loadState === 'loading' ? 'status' : 'alert'}>
          {loadState === 'loading'
            ? '正在加载预览'
            : loadState === 'missing'
              ? '未找到项目'
              : '无法加载预览'}
        </div>
      )}
    </main>
  )
}
