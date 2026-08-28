import { ArrowLeft, TriangleAlert } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Link, useParams } from 'react-router-dom'

import { downloadBlob } from '../../shared/browser-download'
import { AssetLibraryRepository } from '../assets/asset-library-repository'
import { CollaborationCommentsPanel } from '../collaboration/CollaborationCommentsPanel'
import { CollaborationRepository } from '../collaboration/collaboration-repository'
import type { MembershipPlanId } from '../membership/membership-model'
import { MembershipRepository } from '../membership/membership-repository'
import type { LibraryAssetRecord } from '../assets/library-model'
import {
  ProjectRepository,
  WirelessCanvasDatabase,
} from '../project/project-repository'
import { useProjectStore } from '../project/project-store'
import { PreviewPlayer } from './PreviewPlayer'
import { TimelineEditor } from './TimelineEditor'
import { TimelineExportPanel } from './TimelineExportPanel'
import { compositionSupported } from './timeline-browser-composition'
import { exportTimelineVideo } from './timeline-render-export'
import { activeAt, allClips, candidateSources } from './timeline-selectors'
import {
  browserPreviewRecorderFactory,
  createPreviewRecording,
  supportsPreviewRecording,
  type PreviewRecorderFactory,
} from './timeline-export'
import {
  createTimelineProject,
  mergeLegacyTimeline,
  resolveTimelineClips,
  type TimelineProject,
} from './timeline-project'
import {
  TimelineRepository,
  type TimelineProjectRepository,
} from './timeline-repository'
import '../../styles/global.css'

type PreviewRepository = Pick<ProjectRepository, 'load' | 'save'>
type PreviewLibraryRepository = Pick<AssetLibraryRepository, 'list'>

const defaultDatabase = new WirelessCanvasDatabase()
const defaultRepository = new ProjectRepository(defaultDatabase)
const defaultTimelineRepository = new TimelineRepository(defaultDatabase)
const defaultLibraryRepository = new AssetLibraryRepository(defaultDatabase)
const defaultCollaborationRepository = new CollaborationRepository(defaultDatabase)
const defaultMembershipRepository = new MembershipRepository(defaultDatabase)

class TransientTimelineRepository implements TimelineProjectRepository {
  private readonly projects = new Map<string, TimelineProject>()

  async load(projectId: string) {
    return this.projects.get(projectId)
  }

  async save(timeline: TimelineProject) {
    this.projects.set(timeline.projectId, timeline)
  }
}
const emptyLibraryRepository: PreviewLibraryRepository = {
  list: async () => [],
}

export interface PreviewPageProps {
  repository?: PreviewRepository
  timelineRepository?: TimelineProjectRepository
  libraryRepository?: PreviewLibraryRepository
  recorderFactory?: PreviewRecorderFactory
  collaborationRepository?: Pick<CollaborationRepository, 'listComments' | 'addComment' | 'resolveComment'>
  membershipStore?: Pick<MembershipRepository, 'get'>
}

export function PreviewPage({
  repository = defaultRepository,
  timelineRepository,
  libraryRepository,
  recorderFactory,
  collaborationRepository = defaultCollaborationRepository,
  membershipStore = defaultMembershipRepository,
}: PreviewPageProps) {
  const { projectId } = useParams<{ projectId: string }>()
  const activeProject = useProjectStore((state) => state.activeProject)
  const project = activeProject?.id === projectId ? activeProject : undefined
  const reorderProjectTimeline = useProjectStore((state) => state.reorderTimeline)
  const [timeline, setTimeline] = useState<TimelineProject | undefined>(() =>
    project ? createTimelineProject(project) : undefined,
  )
  const [library, setLibrary] = useState<LibraryAssetRecord[]>([])
  const [currentTime, setCurrentTime] = useState(0)
  const [selectedClipId, setSelectedClipId] = useState<string>()
  const [saveError, setSaveError] = useState<string>()
  const [recordingSupported, setRecordingSupported] = useState(false)
  const [membershipPlan, setMembershipPlan] = useState<MembershipPlanId>('free')
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'missing' | 'error'>(
    project ? 'ready' : 'loading',
  )
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const saveChainRef = useRef<Promise<void>>(Promise.resolve())
  const revisionRef = useRef(0)
  const pendingSaveRef = useRef<TimelineProject | undefined>(undefined)
  const currentProjectIdRef = useRef(projectId)
  currentProjectIdRef.current = projectId

  const effectiveTimelineRepository = useMemo(
    () =>
      timelineRepository ??
      (import.meta.env.MODE === 'test'
        ? new TransientTimelineRepository()
        : defaultTimelineRepository),
    [timelineRepository],
  )
  const effectiveLibraryRepository =
    libraryRepository ??
    (import.meta.env.MODE === 'test'
      ? emptyLibraryRepository
      : defaultLibraryRepository)
  const effectiveRecorderFactory = useMemo(
    () => recorderFactory ?? browserPreviewRecorderFactory(),
    [recorderFactory],
  )

  const persistTimeline = useCallback((next: TimelineProject) => {
    pendingSaveRef.current = next
    saveChainRef.current = saveChainRef.current
      .then(() => effectiveTimelineRepository.save(next))
      .then(() => { if (currentProjectIdRef.current === next.projectId && pendingSaveRef.current === next) setSaveError(undefined) })
      .catch(() => {
        if (currentProjectIdRef.current === next.projectId) setSaveError('时间线保存失败，当前编辑仍保留在页面中。请重试保存后再离开。')
      })
  }, [effectiveTimelineRepository])

  useEffect(() => { setSaveError(undefined); pendingSaveRef.current = undefined }, [projectId])

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
    if (!project) return
    setLoadState('ready')
    setTimeline((current) => {
      if (!current || current.projectId !== project.id) {
        return createTimelineProject(project)
      }
      return mergeLegacyTimeline(current, project)
    })
  }, [project])

  useEffect(() => {
    if (!project) return
    let active = true
    const startingRevision = revisionRef.current
    void Promise.all([
      effectiveTimelineRepository.load(project.id),
      effectiveLibraryRepository.list(),
    ])
      .then(([stored, records]) => {
        if (!active) return
        setLibrary(records)
        setTimeline((current) => {
          const base = stored ?? current ?? createTimelineProject(project)
          const merged = mergeLegacyTimeline(base, project)
          if (revisionRef.current !== startingRevision && current) return current
          if (!stored || merged !== stored) {
            persistTimeline(merged)
          }
          return merged
        })
      })
      .catch(() => {
        if (active) setLibrary([])
      })
    return () => {
      active = false
    }
  }, [effectiveLibraryRepository, effectiveTimelineRepository, persistTimeline, project?.id])

  const resolved = useMemo(
    () => (timeline && project ? resolveTimelineClips(timeline, project) : undefined),
    [project, timeline],
  )
  const active = resolved
    ? activeAt(resolved.visual, selectedClipId, currentTime)
    : undefined

  useEffect(() => {
    if (!selectedClipId && resolved?.visual[0]) {
      setSelectedClipId(resolved.visual[0].clip.id)
    }
  }, [resolved, selectedClipId])

  useEffect(() => {
    setRecordingSupported(
      supportsPreviewRecording(canvasRef.current ?? undefined, effectiveRecorderFactory),
    )
  }, [effectiveRecorderFactory, timeline])

  useEffect(() => {
    let mounted = true
    void membershipStore.get().then(
      (subscription) => { if (mounted) setMembershipPlan(subscription.plan) },
      () => { if (mounted) setMembershipPlan('free') },
    )
    return () => { mounted = false }
  }, [membershipStore])

  const syncLegacyOrder = useCallback(
    (current: TimelineProject, next: TimelineProject) => {
      if (!project) return
      for (const nextTrack of next.tracks) {
        const currentTrack = current.tracks.find(({ id }) => id === nextTrack.id)
        if (!currentTrack) continue
        const before = currentTrack.clips.flatMap((clip) =>
          clip.legacyTimelineItemId ? [clip.legacyTimelineItemId] : [],
        )
        const after = nextTrack.clips.flatMap((clip) =>
          clip.legacyTimelineItemId ? [clip.legacyTimelineItemId] : [],
        )
        if (
          before.length !== after.length ||
          before.every((id, index) => id === after[index])
        ) {
          continue
        }
        const ids = new Set(after)
        let index = 0
        const ordered = [...project.timeline]
          .sort((left, right) => left.order - right.order)
          .map((item) => (ids.has(item.id) ? after[index++] : item.id))
        reorderProjectTimeline(ordered)
        void useProjectStore.getState().persistActive(repository).catch(() => undefined)
        break
      }
    },
    [project, reorderProjectTimeline, repository],
  )

  const changeTimeline = useCallback(
    (next: TimelineProject) => {
      if (!timeline || next === timeline) return
      revisionRef.current += 1
      syncLegacyOrder(timeline, next)
      setTimeline(next)
      persistTimeline(next)
    },
    [persistTimeline, syncLegacyOrder, timeline],
  )

  const candidates = useMemo(
    () => (project ? candidateSources(project, library) : []),
    [library, project],
  )
  const aspectMismatch = Boolean(
    active?.aspectRatio && active.aspectRatio !== '16:9',
  )

  return (
    <main className="preview-page">
      <header className="preview-page__header">
        <div>
          <p>本地交付工作区</p>
          <h1>成片预览</h1>
          {project ? <strong>{project.title}</strong> : null}
          <span>时间线更改自动保存在当前浏览器</span>
        </div>
        {project && active?.clip.source.nodeId ? (
          <Link to={`/project/${project.id}?focus=${active.clip.source.nodeId}`}>
            <ArrowLeft aria-hidden="true" />
            返回画布
          </Link>
        ) : null}
      </header>
      {saveError && <div role="alert"><p>{saveError}</p><button type="button" onClick={() => { const next = pendingSaveRef.current; if (next && next.projectId === projectId) persistTimeline(next) }}>重试保存时间线</button></div>}
      {project && timeline && resolved ? (
        <>
          <div className="preview-page__workspace">
            <PreviewPlayer
              timeline={timeline}
              resolved={resolved}
              currentTime={currentTime}
              selectedClipId={selectedClipId}
              canvasRef={canvasRef}
              onCurrentTimeChange={setCurrentTime}
              onSelectedClipChange={setSelectedClipId}
            />
            <aside className="preview-inspector" aria-label="当前片段检查器">
              <p>当前片段</p>
              <h2>{active?.node?.title ?? active?.clip.name ?? '缺少片段'}</h2>
              {active ? (
                <dl>
                  <div><dt>时长</dt><dd>{(active.endSeconds - active.startSeconds).toFixed(2)} 秒</dd></div>
                  <div><dt>画幅比</dt><dd>{active.aspectRatio ?? '未知'}</dd></div>
                  <div><dt>来源节点</dt><dd>{active.node?.title ?? active.clip.source.nodeId ?? '素材库'}</dd></div>
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
          <TimelineEditor
            projectId={project.id}
            timeline={timeline}
            candidates={candidates}
            currentTime={currentTime}
            selectedClipId={selectedClipId}
            onTimelineChange={changeTimeline}
            onCurrentTimeChange={setCurrentTime}
            onSelectedClipChange={setSelectedClipId}
          />
          {selectedClipId ? (
            <CollaborationCommentsPanel
              projectId={project.id}
              targetType="clip"
              targetId={selectedClipId}
              targetLabel={allClips(timeline).find(({ id }) => id === selectedClipId)?.name ?? '当前片段'}
              repository={collaborationRepository}
            />
          ) : null}
          <TimelineExportPanel
            key={project.id}
            timeline={timeline}
            recordingSupported={recordingSupported}
            membershipPlan={membershipPlan}
            onCompose={compositionSupported() ? (signal, onProgress) => exportTimelineVideo(timeline, resolved, { signal, onProgress }) : undefined}
            onStartRecording={
              recordingSupported && effectiveRecorderFactory
                ? () =>
                    createPreviewRecording(
                      canvasRef.current!,
                      effectiveRecorderFactory,
                      (blob) => downloadBlob(blob, `${timeline.title}-预览.webm`),
                      timeline.frameRate,
                    )
                : undefined
            }
          />
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
