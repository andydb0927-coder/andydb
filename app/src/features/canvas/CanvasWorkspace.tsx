import {
  Bot,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Download,
  GripVertical,
  Grid3X3,
  Lightbulb,
  Map,
  Maximize2,
  Pencil,
  RotateCw,
  Rotate3D,
  ScanLine,
  Sparkles,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import type { GenerationProviderPreferenceStore } from '../generation/generation-provider-preference'
import type { AssetLibraryRepository } from '../assets/asset-library-repository'
import type {
  CanvasNode,
  ImageAnnotation,
  Project,
  VideoDerivedTool,
} from '../project/model'
import type { ImageGridSize } from '../media/browser-media-processing'
import type { VideoSegmentOptions } from '../media/browser-media-processing'
import { CanvasGenerationSettings } from './CanvasGenerationSettings'
import {
  AssetLibraryPanel,
  CharacterLibraryPanel,
  EffectToolboxPanel,
  MaterialLibraryPanel,
  type CharacterProfile,
  type EffectTemplate,
  type MaterialLibraryEntry,
  type WorkspaceAsset,
} from './CanvasResourcePanels'
import { GenerationHistoryPanel } from './GenerationHistoryPanel'
import { VideoMediaContextBar } from './VideoContextTools'
import { ImageAnnotationEditor } from './ImageAnnotationEditor'
import { TutorialQuickGuide } from '../tutorials/TutorialQuickGuide'

export type WorkspaceMode = 'workflow' | 'storyboard'
export type WorkspacePanel =
  | 'nodes'
  | 'models'
  | 'toolbox'
  | 'assets'
  | 'library'
  | 'characters'
  | 'history'
  | 'shortcuts'
  | 'help'

const kindCopy: Record<CanvasNode['kind'], string> = {
  character: '角色',
  'character-card': '角色卡',
  scene: '场景',
  script: '剧本',
  text: '文本',
  image: '图片',
  storyboard: '分镜',
  video: '视频',
  preview: '预览',
  worldview: '世界观',
}

const panelCopy: Record<WorkspacePanel, string> = {
  nodes: '节点',
  models: '模型设置',
  toolbox: '工具箱',
  assets: '资产管理',
  library: '素材库',
  characters: '角色库',
  history: '历史',
  shortcuts: '快捷键',
  help: '教程',
}

interface CanvasStoryboardViewProps {
  project: Project
  onOpenNode(nodeId: string): void
  onReorderNodes(sourceNodeId: string, targetNodeId: string): void
  onUpdateDialogue(nodeId: string, dialogue: string): void
}

type StoryboardSectionId = 'text' | 'image' | 'video'
type StoryboardSectionState = Record<StoryboardSectionId, boolean>

const defaultStoryboardSections: StoryboardSectionState = {
  text: true,
  image: true,
  video: true,
}

function readStoryboardSections(projectId: string): StoryboardSectionState {
  try {
    const value = JSON.parse(
      localStorage.getItem(`wireless-canvas:storyboard-sections:${projectId}`) ?? '{}',
    ) as Partial<StoryboardSectionState>
    return {
      text: value.text !== false,
      image: value.image !== false,
      video: value.video !== false,
    }
  } catch {
    return defaultStoryboardSections
  }
}

function formatStoryboardDuration(totalSeconds: number) {
  const rounded = Math.max(0, Math.round(totalSeconds))
  const minutes = Math.floor(rounded / 60)
  const seconds = rounded % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function CanvasStoryboardView({
  project,
  onOpenNode,
  onReorderNodes,
  onUpdateDialogue,
}: CanvasStoryboardViewProps) {
  const storageKey = `wireless-canvas:storyboard-sections:${project.id}`
  const [expanded, setExpanded] = useState<StoryboardSectionState>(() =>
    readStoryboardSections(project.id),
  )
  const [dialogueDrafts, setDialogueDrafts] = useState<Record<string, string>>(
    () => Object.fromEntries(
      project.nodes.map((node) => [node.id, node.storyboardDialogue ?? '']),
    ),
  )
  const persistedDialoguesRef = useRef<Record<string, string>>(
    Object.fromEntries(
      project.nodes.map((node) => [node.id, node.storyboardDialogue ?? '']),
    ),
  )
  const [draggedNodeId, setDraggedNodeId] = useState<string>()

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(expanded))
    } catch {
      // Device-local preferences may be unavailable in private storage modes.
    }
  }, [expanded, storageKey])

  const groups = useMemo(
    () => [
      {
        id: 'text' as const,
        title: '文本',
        nodes: project.nodes.filter((node) =>
          ['text', 'script', 'worldview', 'character-card'].includes(node.kind),
        ),
      },
      {
        id: 'image' as const,
        title: '图片',
        nodes: project.nodes.filter((node) =>
          ['character', 'scene', 'image', 'storyboard'].includes(node.kind),
        ),
      },
      {
        id: 'video' as const,
        title: '视频',
        nodes: project.nodes.filter((node) =>
          ['video', 'preview'].includes(node.kind),
        ),
      },
    ],
    [project.nodes],
  )

  useEffect(() => {
    const nextPersisted = Object.fromEntries(
      project.nodes.map((node) => [node.id, node.storyboardDialogue ?? '']),
    )
    setDialogueDrafts((current) => Object.fromEntries(
      project.nodes.map((node) => {
        const persisted = nextPersisted[node.id]
        const previousPersisted = persistedDialoguesRef.current[node.id]
        const draft = current[node.id]
        return [
          node.id,
          draft === undefined || draft === previousPersisted ? persisted : draft,
        ]
      }),
    ))
    persistedDialoguesRef.current = nextPersisted
  }, [project.nodes])
  const shotCount = groups
    .filter(({ id }) => id !== 'text')
    .reduce((total, group) => total + group.nodes.length, 0)
  const totalDuration = groups
    .find(({ id }) => id === 'video')!
    .nodes.reduce((total, node) => {
      const version = node.versions.find(({ id }) => id === node.activeVersionId)
      const asset = project.assets.find(({ id }) => id === version?.assetId)
      const timelineDuration = project.timeline.find(({ nodeId }) => nodeId === node.id)
        ?.durationSeconds
      return total + (
        asset?.kind === 'video'
          ? asset.durationSeconds ?? timelineDuration ?? 0
          : timelineDuration ?? 0
      )
    }, 0)

  const toggleSection = (sectionId: StoryboardSectionId) => {
    setExpanded((current) => ({ ...current, [sectionId]: !current[sectionId] }))
  }

  return (
    <section className="canvas-storyboard" aria-label="项目故事板">
      <div className="canvas-storyboard__intro">
        <span>PROJECT STORYBOARD</span>
        <h2>故事板总览</h2>
        <p>按媒介汇总当前画布内容。选择卡片可回到工作流定位来源节点。</p>
      </div>
      <div className="canvas-storyboard__sections">
        {groups.map((group) => (
          <section key={group.id} className="canvas-storyboard__section" aria-label={`${group.title}区`}>
            <div className="canvas-storyboard__section-heading">
              <h3>
                <button
                  type="button"
                  aria-expanded={expanded[group.id]}
                  aria-label={`${expanded[group.id] ? '收起' : '展开'}${group.title}区`}
                  onClick={() => toggleSection(group.id)}
                >
                  <ChevronRight aria-hidden="true" />
                  <span>{group.title}</span>
                  <small>{group.nodes.length}</small>
                </button>
              </h3>
            </div>
            {expanded[group.id] && group.nodes.length ? (
              <div className="canvas-storyboard__grid" id={`storyboard-${project.id}-${group.id}`}>
                {group.nodes.map((node) => {
                  const version = node.versions.find(
                    (candidate) => candidate.id === node.activeVersionId,
                  )
                  const asset = project.assets.find(
                    (candidate) => candidate.id === version?.assetId,
                  )
                  return (
                    <article
                      key={node.id}
                      className="canvas-storyboard__card"
                      aria-label={`${group.title}故事板卡 ${node.title}`}
                      draggable
                      data-dragging={draggedNodeId === node.id || undefined}
                      onDragStart={(event) => {
                        setDraggedNodeId(node.id)
                        event.dataTransfer.effectAllowed = 'move'
                        event.dataTransfer.setData('text/storyboard-node', node.id)
                      }}
                      onDragEnd={() => setDraggedNodeId(undefined)}
                      onDragOver={(event) => {
                        const sourceIsInSection = group.nodes.some(
                          ({ id }) => id === draggedNodeId,
                        )
                        if (!draggedNodeId || draggedNodeId === node.id || !sourceIsInSection) return
                        event.preventDefault()
                        event.dataTransfer.dropEffect = 'move'
                      }}
                      onDrop={(event) => {
                        event.preventDefault()
                        const sourceNodeId =
                          event.dataTransfer.getData('text/storyboard-node') ||
                          draggedNodeId
                        setDraggedNodeId(undefined)
                        const sourceIsInSection = group.nodes.some(
                          ({ id }) => id === sourceNodeId,
                        )
                        if (sourceNodeId && sourceNodeId !== node.id && sourceIsInSection) {
                          onReorderNodes(sourceNodeId, node.id)
                        }
                      }}
                    >
                      <button
                        type="button"
                        className="canvas-storyboard__locate"
                        aria-label={`定位 ${node.title}`}
                        onClick={() => onOpenNode(node.id)}
                      >
                        <span className="canvas-storyboard__preview">
                          {asset?.kind === 'image' ? (
                            <img src={asset.url} alt="" />
                          ) : asset?.kind === 'video' ? (
                            <video src={asset.url} muted preload="metadata" />
                          ) : (
                            <Sparkles aria-hidden="true" />
                          )}
                        </span>
                        <span className="canvas-storyboard__card-copy">
                          <GripVertical aria-hidden="true" />
                          <strong>{node.title}</strong>
                          {group.id === 'image' ? (
                            <small>{asset?.width && asset.height ? `${asset.width} × ${asset.height}` : '尺寸待识别'}</small>
                          ) : (
                            <small>{version?.prompt || kindCopy[node.kind]}</small>
                          )}
                        </span>
                      </button>
                      {group.id === 'image' ? (
                        <div className="canvas-storyboard__dialogue">
                          <label>
                            <span>对白</span>
                            <textarea
                              aria-label={`${node.title}对白`}
                              maxLength={2000}
                              placeholder="输入这一镜的对白…"
                              value={dialogueDrafts[node.id] ?? node.storyboardDialogue ?? ''}
                              onChange={(event) => setDialogueDrafts((current) => ({
                                ...current,
                                [node.id]: event.target.value,
                              }))}
                            />
                          </label>
                          <button
                            type="button"
                            disabled={(dialogueDrafts[node.id] ?? '') === (node.storyboardDialogue ?? '')}
                            aria-label={`保存${node.title}对白`}
                            onClick={() => onUpdateDialogue(node.id, dialogueDrafts[node.id] ?? '')}
                          >保存对白</button>
                        </div>
                      ) : null}
                    </article>
                  )
                })}
              </div>
            ) : expanded[group.id] ? (
              <p className="canvas-storyboard__empty">暂无{group.title}内容</p>
            ) : null}
          </section>
        ))}
      </div>
      <footer className="canvas-storyboard__stats" role="status" aria-live="polite" aria-label="故事板统计">
        <span>总镜头数 <strong>{shotCount}</strong></span>
        <span>总时长 <strong>{formatStoryboardDuration(totalDuration)}</strong></span>
      </footer>
    </section>
  )
}

interface WorkspaceSidePanelProps {
  panel: WorkspacePanel
  project: Project
  generationPreferenceStore?: GenerationProviderPreferenceStore
  assetRepository: Pick<AssetLibraryRepository, 'list' | 'rename' | 'move' | 'deleteAsset'>
  historyInsertionMode?: boolean
  onClose(): void
  onApplyCharacters?(characters: CharacterProfile[]): void
  onDeleteHistoryJobs?(jobIds: string[]): void
  onInsertAsset?(asset: WorkspaceAsset): void
  onRemoveProjectAsset?(assetId: string): void
  onInsertEffect?(template: EffectTemplate): void
  onInsertMaterial?(entry: MaterialLibraryEntry): void
  onInsertHistoryResult?(jobId: string): void
  onResendHistoryJob?(jobId: string): void
  onSelectNode(nodeId: string): void
}

export function WorkspaceSidePanel({
  panel,
  project,
  generationPreferenceStore,
  assetRepository,
  historyInsertionMode = false,
  onClose,
  onApplyCharacters,
  onDeleteHistoryJobs,
  onInsertAsset,
  onRemoveProjectAsset,
  onInsertEffect,
  onInsertMaterial,
  onInsertHistoryResult,
  onResendHistoryJob,
  onSelectNode,
}: WorkspaceSidePanelProps) {
  const [toolboxTab, setToolboxTab] = useState<'effects' | 'models'>('effects')

  useEffect(() => {
    if (panel !== 'toolbox') setToolboxTab('effects')
  }, [panel])

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (document.querySelector('.generation-history-dialog, .canvas-resource-dialog__overlay, .asset-library__context')) return
      onClose()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [onClose])

  return (
    <aside className="workspace-side-panel" aria-label={panelCopy[panel]}>
      <div className="workspace-side-panel__heading">
        <div>
          <span>WORKSPACE</span>
          <h2>{panelCopy[panel]}</h2>
        </div>
        <button type="button" aria-label={`关闭${panelCopy[panel]}面板`} onClick={onClose}>
          <X aria-hidden="true" />
        </button>
      </div>

      {panel === 'nodes' ? (
        <ul className="workspace-side-panel__list">
          {project.nodes.map((node) => (
            <li key={node.id}>
              <button type="button" onClick={() => onSelectNode(node.id)}>
                <strong>{node.title}</strong>
                <span>{kindCopy[node.kind]}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {panel === 'models' ? (
        <CanvasGenerationSettings preferenceStore={generationPreferenceStore} />
      ) : null}

      {panel === 'toolbox' ? (
        <>
          <div className="effect-toolbox__tabs" role="tablist" aria-label="工具箱分类">
            <button type="button" role="tab" aria-selected={toolboxTab === 'effects'} onClick={() => setToolboxTab('effects')}>动效模板</button>
            <button type="button" role="tab" aria-selected={toolboxTab === 'models'} onClick={() => setToolboxTab('models')}>生成连接</button>
          </div>
          {toolboxTab === 'effects' ? (
            <EffectToolboxPanel onInsert={(template) => onInsertEffect?.(template)} />
          ) : (
            <div className="effect-toolbox__provider" aria-label="工具箱生成连接">
              <CanvasGenerationSettings preferenceStore={generationPreferenceStore} />
            </div>
          )}
        </>
      ) : null}

      {panel === 'assets' ? (
        <AssetLibraryPanel
          project={project}
          repository={assetRepository}
          onInsert={(asset) => onInsertAsset?.(asset)}
          onRemoveProjectAsset={(assetId) => onRemoveProjectAsset?.(assetId)}
        />
      ) : null}

      {panel === 'library' ? (
        <MaterialLibraryPanel onInsert={(entry) => onInsertMaterial?.(entry)} />
      ) : null}

      {panel === 'characters' ? (
        <CharacterLibraryPanel onApply={(characters) => onApplyCharacters?.(characters)} />
      ) : null}

      {panel === 'history' ? (
        <GenerationHistoryPanel
          project={project}
          insertionMode={historyInsertionMode}
          onDeleteJobs={(jobIds) => onDeleteHistoryJobs?.(jobIds)}
          onResend={(jobId) => onResendHistoryJob?.(jobId)}
          onUse={(jobId) => onInsertHistoryResult?.(jobId)}
        />
      ) : null}

      {panel === 'shortcuts' ? (
        <div className="workspace-shortcuts">
          <ShortcutGroup
            title="创作"
            items={[
              ['成组', 'G'],
              ['合并分镜组', '⌥ G'],
              ['解组', '⇧ G'],
              ['连线', 'L'],
              ['复制节点和连线', 'D'],
              ['生成', 'Enter'],
              ['新建节点', 'Tab'],
              ['节点复制', '⌥ 拖动节点'],
              ['创建副本', '⌥ 拖动'],
            ]}
          />
          <ShortcutGroup
            title="缩放"
            items={[
              ['放大', '+'],
              ['缩小', '−'],
              ['适应画布', '0'],
            ]}
          >
            <p>触控板：双指移动与缩放</p>
            <p>鼠标：滚轮缩放，抓手模式拖动平移</p>
          </ShortcutGroup>
          <ShortcutGroup
            title="移动画布"
            items={[
              ['键盘', 'Space'],
              ['移动工具', 'V'],
              ['抓手工具', 'H'],
              ['整理画布', '⌥ ⇧ F'],
            ]}
          >
            <p>键盘：按住 Space 临时平移</p>
          </ShortcutGroup>
          <ShortcutGroup
            title="其他"
            items={[
              ['撤销', '⌘ Z'],
              ['重做', '⌘ ⇧ Z'],
              ['删除', 'Delete'],
            ]}
          />
        </div>
      ) : null}

      {panel === 'help' ? (
        <TutorialQuickGuide />
      ) : null}
    </aside>
  )
}

function ShortcutGroup({
  title,
  items,
  children,
}: {
  title: string
  items: Array<[string, string]>
  children?: ReactNode
}) {
  return (
    <section className="workspace-shortcuts__group">
      <h3>{title}</h3>
      <dl>
        {items.map(([action, shortcut]) => (
          <div key={action}>
            <dt>{action}</dt>
            <dd>{shortcut}</dd>
          </div>
        ))}
      </dl>
      {children ? <div className="workspace-shortcuts__notes">{children}</div> : null}
    </section>
  )
}

interface CanvasViewControlsProps {
  minimapVisible: boolean
  snapToGrid: boolean
  zoomPercent: number
  onToggleMinimap(): void
  onToggleSnap(): void
  onFitView(): void
}

export function CanvasViewControls({
  minimapVisible,
  snapToGrid,
  zoomPercent,
  onToggleMinimap,
  onToggleSnap,
  onFitView,
}: CanvasViewControlsProps) {
  return (
    <div className="canvas-view-controls floating-panel" role="toolbar" aria-label="画布视图">
      <button
        type="button"
        aria-label={minimapVisible ? '隐藏小地图' : '显示小地图'}
        aria-pressed={minimapVisible}
        onClick={onToggleMinimap}
      >
        <Map aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label={snapToGrid ? '关闭网格吸附' : '开启网格吸附'}
        aria-pressed={snapToGrid}
        onClick={onToggleSnap}
      >
        <Grid3X3 aria-hidden="true" />
      </button>
      <button type="button" aria-label="适配画布" onClick={onFitView}>
        <Crosshair aria-hidden="true" />
      </button>
      <span aria-label="画布缩放比例">{Math.round(zoomPercent)}%</span>
    </div>
  )
}

interface CanvasAgentPanelProps {
  children: ReactNode
  onClose(): void
}

export function CanvasAgentPanel({ children, onClose }: CanvasAgentPanelProps) {
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [onClose])

  return (
    <aside className="canvas-agent-panel" aria-label="Agent 工作区">
      <div className="canvas-agent-panel__heading">
        <div>
          <span>CANVAS AGENT</span>
          <h2><Bot aria-hidden="true" />创作助手</h2>
        </div>
        <button type="button" aria-label="关闭 Agent" onClick={onClose}>
          <X aria-hidden="true" />
        </button>
      </div>
      <div className="canvas-agent-panel__notice">
        <Check aria-hidden="true" /> 已连接当前画布上下文
      </div>
      <div className="canvas-agent-panel__content">{children}</div>
    </aside>
  )
}

const nineGridTemplates = [
  '多机位九宫格',
  '剧情推演四宫格',
  '角色脸部三视图',
  '角色设定图',
  '场景设定图',
  '产品设定图',
  '25 宫格连贯分镜',
  '电影级光影校正',
  '角色三视图',
  '画面推演 - 3 秒后',
  '画面推演 - 5 秒前',
] as const

const anglePresets = [
  '自定义',
  '鱼眼视角',
  '倾斜视角',
  '正面俯拍',
  '正面仰拍',
  '全景俯拍',
  '背面视角',
] as const

type ImageToolSurface =
  | 'portrait'
  | 'multi-angle'
  | 'lighting'
  | 'nine-grid'
  | 'split'
  | 'annotation'
  | 'transform'
  | 'preview'

function activeImageAsset(project: Project, node: CanvasNode) {
  const version = node.versions.find(({ id }) => id === node.activeVersionId)
  return project.assets.find(({ id }) => id === version?.assetId)
}

function ImageToolDialog({
  title,
  onClose,
  children,
}: {
  title: string
  onClose(): void
  children: ReactNode
}) {
  return (
    <section className="canvas-tool-config" role="dialog" aria-modal="false" aria-label={title}>
      <div className="canvas-tool-config__heading">
        <h2>{title}</h2>
        <button type="button" aria-label={`关闭${title}`} onClick={onClose}>
          <X aria-hidden="true" />
        </button>
      </div>
      {children}
    </section>
  )
}

interface SelectionContextBarProps {
  project: Project
  node?: CanvasNode
  onCreateToolNode(tool: string): void
  onCreateVideoToolNode?(tool: VideoDerivedTool): void
  onSubmitVideoDraft?(tool: string): void
  onProcessVideo?(nodeId: string, options: VideoSegmentOptions): Promise<void> | void
  onExtractVideoAudio?(nodeId: string): Promise<void> | void
  onRotateImage(nodeId: string): void
  onMirrorImage?(nodeId: string, axis: 'horizontal' | 'vertical'): void
  onSplitImage?(nodeId: string, grid: ImageGridSize, group: boolean): Promise<void> | void
  onSaveImageAnnotations?(nodeId: string, annotations: ImageAnnotation[]): void
}

export function SelectionContextBar({
  project,
  node,
  onCreateToolNode,
  onCreateVideoToolNode,
  onSubmitVideoDraft,
  onProcessVideo,
  onExtractVideoAudio,
  onRotateImage,
  onMirrorImage,
  onSplitImage,
  onSaveImageAnnotations,
}: SelectionContextBarProps) {
  const [surface, setSurface] = useState<ImageToolSurface>()
  const [pendingTool, setPendingTool] = useState<string>()
  const [previewIndex, setPreviewIndex] = useState(0)
  const [lightingDirty, setLightingDirty] = useState(false)
  const [splitGroup, setSplitGroup] = useState(true)
  const [splitBusy, setSplitBusy] = useState(false)
  useEffect(() => {
    setSurface(undefined)
    setPendingTool(undefined)
    setLightingDirty(false)
  }, [node?.id])
  useEffect(() => {
    if (!surface && !pendingTool) return
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setSurface(undefined)
      setPendingTool(undefined)
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [pendingTool, surface])

  const asset = node ? activeImageAsset(project, node) : undefined
  if (node?.kind === 'video' && asset?.kind === 'video') {
    return (
      <VideoMediaContextBar
        node={node}
        asset={asset}
        onCreateToolNode={onCreateVideoToolNode}
        onSubmitDraft={onSubmitVideoDraft}
        onProcessVideo={(options) => onProcessVideo?.(node.id, options)}
        onExtractAudio={() => onExtractVideoAudio?.(node.id)}
      />
    )
  }
  if (
    !node ||
    !['image', 'character', 'scene'].includes(node.kind) ||
    asset?.kind !== 'image'
  ) {
    return null
  }

  const previewItems = project.nodes.flatMap((candidate) => {
    const candidateAsset = activeImageAsset(project, candidate)
    return candidateAsset?.kind === 'image'
      ? [{ node: candidate, asset: candidateAsset }]
      : []
  })
  const openPreview = () => {
    const index = previewItems.findIndex(({ node: candidate }) => candidate.id === node.id)
    setPreviewIndex(Math.max(0, index))
    setSurface('preview')
  }
  const requestToolNode = (tool: string) => {
    setSurface(undefined)
    setPendingTool(tool)
  }
  const downloadCurrent = () => {
    const anchor = document.createElement('a')
    anchor.href = asset.url
    anchor.download = `${node.title}.png`
    anchor.click()
  }

  return (
    <>
      <div className="selection-context-bar floating-panel" role="toolbar" aria-label="图片创作工具">
        <button
          type="button"
          aria-label="人像质感调节"
          aria-haspopup="menu"
          aria-expanded={surface === 'portrait'}
          data-compact="false"
          onClick={() => setSurface('portrait')}
        >
          <Sparkles aria-hidden="true" />
          <span>人像质感调节</span>
          <span className="image-context-action__new-badge">NEW</span>
          <ChevronDown aria-hidden="true" />
        </button>
        <button
          type="button"
          title="基于当前场景创建720°全景图"
          data-compact="false"
          onClick={() => requestToolNode('全景')}
        >
          <span className="image-context-action__panorama-icon" aria-hidden="true">720</span>
          全景
        </button>
        <button type="button" data-compact="false" onClick={() => setSurface('multi-angle')}><Rotate3D aria-hidden="true" />多角度</button>
        <button type="button" data-compact="false" onClick={() => setSurface('lighting')}><Lightbulb aria-hidden="true" />打光</button>
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded="false"
          aria-describedby="nine-grid-disabled-reason"
          data-compact="false"
          disabled
        >
          <Grid3X3 aria-hidden="true" />九宫格<ChevronDown aria-hidden="true" />
        </button>
        <button type="button" data-compact="false" onClick={() => requestToolNode('高清')}><ScanLine aria-hidden="true" />高清</button>
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={surface === 'split'}
          data-compact="false"
          onClick={() => setSurface('split')}
        >
          <Grid3X3 aria-hidden="true" />宫格切分<ChevronDown aria-hidden="true" />
        </button>
        <button type="button" data-compact="true" aria-label="标注" title="标注" onClick={() => setSurface('annotation')}><Pencil aria-hidden="true" /><span className="visually-hidden">标注</span></button>
        <button type="button" data-compact="true" aria-label="旋转与镜像" title="旋转与镜像" aria-haspopup="menu" aria-expanded={surface === 'transform'} onClick={() => setSurface('transform')}><RotateCw aria-hidden="true" /><span className="visually-hidden">旋转与镜像</span></button>
        <button type="button" data-compact="true" aria-label="下载" title="下载" onClick={downloadCurrent}><Download aria-hidden="true" /><span className="visually-hidden">下载</span></button>
        <button type="button" data-compact="true" aria-label="预览" title="预览" onClick={openPreview}><Maximize2 aria-hidden="true" /><span className="visually-hidden">预览</span></button>
        <span id="nine-grid-disabled-reason" className="visually-hidden">九宫格暂未开放：尚未接入可保存的模板处理结果。</span>
      </div>

      {surface === 'portrait' ? (
        <div className="image-tool-menu" role="menu" aria-label="人像质感调节">
          <button type="button" role="menuitem" onClick={() => requestToolNode('人像调节')}>人像调节</button>
          <button type="button" role="menuitem" disabled aria-describedby="image-emotion-disabled-reason">情绪调节</button>
          <p id="image-emotion-disabled-reason" className="image-tool-disabled-reason">情绪调节：尚未完成副作用实机核对，本地演示不可用。</p>
        </div>
      ) : null}

      {surface === 'nine-grid' ? (
        <div className="image-tool-menu image-tool-menu--long" role="menu" aria-label="九宫格模板">
          {nineGridTemplates.map((template) => <button key={template} type="button" role="menuitem" disabled aria-describedby="nine-grid-disabled-reason">{template}</button>)}
          <p id="nine-grid-disabled-reason" className="image-tool-disabled-reason">规格仅核对至菜单层，本地演示不执行模板。</p>
        </div>
      ) : null}

      {surface === 'split' ? (
        <div className="image-tool-menu" role="menu" aria-label="宫格切分规格">
          {([2, 3] as const).map((grid) => (
            <button
              key={grid}
              type="button"
              role="menuitem"
              disabled={splitBusy}
              onClick={async () => {
                setSplitBusy(true)
                try {
                  await onSplitImage?.(node.id, grid, splitGroup)
                  setSurface(undefined)
                } finally {
                  setSplitBusy(false)
                }
              }}
            >
              {grid === 2 ? '4 宫格（2×2）' : '9 宫格（3×3）'}
            </button>
          ))}
          <label><input type="checkbox" checked={splitGroup} onChange={(event) => setSplitGroup(event.currentTarget.checked)} />切分后自动编组</label>
          <p>将读取当前图片像素并创建 {splitGroup ? '独立资产、图片节点与分组' : '独立资产和图片节点'}。</p>
        </div>
      ) : null}

      {surface === 'transform' ? (
        <div className="image-tool-menu" role="menu" aria-label="图片旋转与镜像">
          <button type="button" role="menuitem" onClick={() => { onRotateImage(node.id); setSurface(undefined) }}>顺时针旋转</button>
          <button type="button" role="menuitem" onClick={() => { onMirrorImage?.(node.id, 'horizontal'); setSurface(undefined) }}>水平镜像</button>
          <button type="button" role="menuitem" onClick={() => { onMirrorImage?.(node.id, 'vertical'); setSurface(undefined) }}>垂直镜像</button>
        </div>
      ) : null}

      {pendingTool ? (
        <div className="image-tool-confirm" role="alertdialog" aria-modal="true" aria-label={`添加${pendingTool}工具节点`}>
          <h2>将添加工具节点</h2>
          <p>“{pendingTool}”会创建本地工具节点并连接“{node.title}”，不会触发真实生成。</p>
          <div>
            <button type="button" onClick={() => setPendingTool(undefined)}>取消</button>
            <button type="button" onClick={() => {
              onCreateToolNode(pendingTool)
              setPendingTool(undefined)
            }}>确认添加</button>
          </div>
        </div>
      ) : null}

      {surface === 'multi-angle' ? (
        <ImageToolDialog title="多角度编辑器" onClose={() => setSurface(undefined)}>
          <form onSubmit={(event) => { event.preventDefault(); onCreateToolNode('多角度'); setSurface(undefined) }}>
            <div className="image-angle-presets">{anglePresets.map((preset) => <button key={preset} type="button" aria-pressed={preset === '自定义'}>{preset}</button>)}</div>
            <div className="image-direction-pad" aria-label="方向盘"><button type="button">↑</button><button type="button">←</button><span>B · R · L · T</span><button type="button">→</button><button type="button">↓</button></div>
            <label>水平环绕<input aria-label="水平环绕" type="range" min="0" max="345" step="15" defaultValue="0" /></label>
            <label>垂直俯仰<input aria-label="垂直俯仰" type="range" min="-90" max="90" step="15" defaultValue="0" /></label>
            <label>景别缩放<input aria-label="景别缩放" type="range" min="0" max="10" step="5" defaultValue="5" /></label>
            <label><input type="checkbox" />提示词</label>
            <div className="canvas-tool-config__footer"><button type="reset">重置参数</button><span>预计成本 1</span><button type="submit">生成</button></div>
          </form>
        </ImageToolDialog>
      ) : null}

      {surface === 'lighting' ? (
        <ImageToolDialog title="打光编辑器" onClose={() => setSurface(undefined)}>
          <form onReset={() => setLightingDirty(false)} onSubmit={(event) => { event.preventDefault(); onCreateToolNode('打光'); setSurface(undefined) }}>
            <label>智能模式<input aria-label="智能模式" type="checkbox" onChange={() => setLightingDirty(true)} /></label>
            <label>亮度级别<input aria-label="亮度级别" type="range" min="0" max="4" step="1" defaultValue="2" onChange={() => setLightingDirty(true)} /></label>
            <label>亮度百分比<input aria-label="亮度百分比" type="number" min="10" max="100" defaultValue="50" onChange={() => setLightingDirty(true)} /></label>
            <label>颜色<input aria-label="颜色" type="color" defaultValue="#ffffff" onChange={() => setLightingDirty(true)} /></label>
            <label>主光源<select aria-label="主光源" defaultValue="前方" onChange={() => setLightingDirty(true)}>{['左侧', '顶部', '右侧', '前方', '底部', '后方'].map((option) => <option key={option}>{option}</option>)}</select></label>
            <label>轮廓光<input aria-label="轮廓光" type="checkbox" onChange={() => setLightingDirty(true)} /></label>
            {!lightingDirty ? <p id="image-lighting-disabled-reason" className="image-tool-disabled-reason">调整任一参数后才可生成。</p> : null}
            <div className="canvas-tool-config__footer"><button type="reset">重置参数</button><button type="submit" disabled={!lightingDirty} aria-describedby={!lightingDirty ? 'image-lighting-disabled-reason' : undefined}>生成</button></div>
          </form>
        </ImageToolDialog>
      ) : null}

      {surface === 'annotation' ? (
        <ImageToolDialog title="标注编辑器" onClose={() => setSurface(undefined)}>
          <ImageAnnotationEditor
            sourceUrl={asset.url}
            width={asset.width}
            height={asset.height}
            annotations={node.imageAnnotations ?? []}
            onSave={(annotations) => {
              onSaveImageAnnotations?.(node.id, annotations)
              setSurface(undefined)
            }}
          />
        </ImageToolDialog>
      ) : null}

      {surface === 'preview' && previewItems[previewIndex] ? (
        <div className="image-preview-dialog" role="dialog" aria-modal="true" aria-label="画布图片预览">
          <button type="button" aria-label="关闭图片预览" onClick={() => setSurface(undefined)}><X aria-hidden="true" /></button>
          <figure>
            <img src={previewItems[previewIndex].asset.url} alt={previewItems[previewIndex].node.title} />
            <figcaption>{previewItems[previewIndex].node.title}</figcaption>
          </figure>
          {previewIndex > 0 ? <button type="button" aria-label="上一张图片" onClick={() => setPreviewIndex((index) => index - 1)}><ChevronLeft aria-hidden="true" /></button> : null}
          {previewIndex < previewItems.length - 1 ? <button type="button" aria-label="下一张图片" onClick={() => setPreviewIndex((index) => index + 1)}><ChevronRight aria-hidden="true" /></button> : null}
        </div>
      ) : null}
    </>
  )
}
