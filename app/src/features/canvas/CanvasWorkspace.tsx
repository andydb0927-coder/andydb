import {
  Brush,
  Bot,
  Check,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Download,
  Grid3X3,
  Lightbulb,
  Map,
  Maximize2,
  Pencil,
  Redo2,
  RotateCw,
  Rotate3D,
  ScanLine,
  Sparkles,
  Square,
  Type,
  Undo2,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'

import type { GenerationProviderPreferenceStore } from '../generation/generation-provider-preference'
import type { CanvasNode, JobStatus, Project } from '../project/model'
import { CanvasGenerationSettings } from './CanvasGenerationSettings'

export type WorkspaceMode = 'workflow' | 'storyboard'
export type WorkspacePanel =
  | 'nodes'
  | 'models'
  | 'toolbox'
  | 'assets'
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

const jobCopy: Record<JobStatus, string> = {
  queued: '排队中',
  running: '生成中',
  succeeded: '已完成',
  failed: '失败',
  cancelled: '已取消',
}

const panelCopy: Record<WorkspacePanel, string> = {
  nodes: '节点',
  models: '模型设置',
  toolbox: '工具箱',
  assets: '资产',
  characters: '角色库',
  history: '历史',
  shortcuts: '快捷键',
  help: '教程',
}

interface CanvasStoryboardViewProps {
  project: Project
  onOpenNode(nodeId: string): void
}

export function CanvasStoryboardView({
  project,
  onOpenNode,
}: CanvasStoryboardViewProps) {
  const groups = useMemo(
    () => [
      {
        id: 'text',
        title: '文本',
        nodes: project.nodes.filter((node) =>
          ['text', 'script', 'worldview', 'character-card'].includes(node.kind),
        ),
      },
      {
        id: 'image',
        title: '图片',
        nodes: project.nodes.filter((node) =>
          ['character', 'scene', 'image', 'storyboard'].includes(node.kind),
        ),
      },
      {
        id: 'video',
        title: '视频',
        nodes: project.nodes.filter((node) =>
          ['video', 'preview'].includes(node.kind),
        ),
      },
    ],
    [project.nodes],
  )

  return (
    <section className="canvas-storyboard" aria-label="项目故事板">
      <div className="canvas-storyboard__intro">
        <span>PROJECT STORYBOARD</span>
        <h2>故事板总览</h2>
        <p>按媒介汇总当前画布内容。选择卡片可回到工作流定位来源节点。</p>
      </div>
      <div className="canvas-storyboard__sections">
        {groups.map((group) => (
          <section key={group.id} className="canvas-storyboard__section">
            <div className="canvas-storyboard__section-heading">
              <h3>{group.title}</h3>
              <span>{group.nodes.length}</span>
            </div>
            {group.nodes.length ? (
              <div className="canvas-storyboard__grid">
                {group.nodes.map((node) => {
                  const version = node.versions.find(
                    (candidate) => candidate.id === node.activeVersionId,
                  )
                  const asset = project.assets.find(
                    (candidate) => candidate.id === version?.assetId,
                  )
                  return (
                    <button
                      key={node.id}
                      type="button"
                      className="canvas-storyboard__card"
                      aria-label={`在工作流中打开 ${node.title}`}
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
                      <strong>{node.title}</strong>
                      <small>{version?.prompt || kindCopy[node.kind]}</small>
                    </button>
                  )
                })}
              </div>
            ) : (
              <p className="canvas-storyboard__empty">暂无{group.title}内容</p>
            )}
          </section>
        ))}
      </div>
    </section>
  )
}

interface WorkspaceSidePanelProps {
  panel: WorkspacePanel
  project: Project
  generationPreferenceStore?: GenerationProviderPreferenceStore
  onClose(): void
  onSelectNode(nodeId: string): void
}

export function WorkspaceSidePanel({
  panel,
  project,
  generationPreferenceStore,
  onClose,
  onSelectNode,
}: WorkspaceSidePanelProps) {
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [onClose])

  const assetRows = project.assets.map((asset) => {
    const node = project.nodes.find((candidate) =>
      candidate.versions.some((version) => version.assetId === asset.id),
    )
    return { asset, node }
  })

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

      {panel === 'models' || panel === 'toolbox' ? (
        <CanvasGenerationSettings preferenceStore={generationPreferenceStore} />
      ) : null}

      {panel === 'toolbox' ? (
        <div className="workspace-side-panel__help">
          <p>工具箱集中管理生成模型；节点分组、连线显隐和画布吸附仍保留为画布级操作。</p>
          <p>所有生成设置只保存在本机，不会消耗 Liblib 积分。</p>
        </div>
      ) : null}

      {panel === 'assets' ? (
        <div className="workspace-side-panel__asset-grid">
          {assetRows.map(({ asset, node }) => (
            <button
              key={asset.id}
              type="button"
              disabled={!node}
              onClick={() => node && onSelectNode(node.id)}
            >
              {asset.kind === 'image' ? <img src={asset.url} alt="" /> : <FilmPlaceholder />}
              <strong>{node?.title ?? '未绑定素材'}</strong>
              <span>{asset.kind.toUpperCase()}</span>
            </button>
          ))}
          {!assetRows.length ? <p>当前项目还没有素材。</p> : null}
        </div>
      ) : null}

      {panel === 'characters' ? (
        <ul className="workspace-side-panel__list">
          {project.nodes
            .filter((node) => node.kind === 'character' || node.kind === 'character-card')
            .map((node) => (
              <li key={node.id}>
                <button type="button" onClick={() => onSelectNode(node.id)}>
                  <strong>{node.title}</strong>
                  <span>{kindCopy[node.kind]}</span>
                </button>
              </li>
            ))}
          {!project.nodes.some(
            (node) => node.kind === 'character' || node.kind === 'character-card',
          ) ? <p>当前项目还没有角色节点。</p> : null}
        </ul>
      ) : null}

      {panel === 'history' ? (
        <ol className="workspace-side-panel__history">
          {project.jobs.map((job) => {
            const node = project.nodes.find((candidate) => candidate.id === job.nodeId)
            return (
              <li key={job.id}>
                <button type="button" disabled={!node} onClick={() => node && onSelectNode(node.id)}>
                  <span>{jobCopy[job.status]}</span>
                  <strong>{node?.title ?? '已移除节点'}</strong>
                  <small>{job.prompt}</small>
                </button>
              </li>
            )
          })}
          {!project.jobs.length ? <p>生成历史将在完成任务后显示。</p> : null}
        </ol>
      ) : null}

      {panel === 'shortcuts' ? (
        <dl className="workspace-shortcuts">
          <div><dt>连接节点</dt><dd>L</dd></div>
          <div><dt>隐藏/显示连线</dt><dd>H</dd></div>
          <div><dt>画布快捷菜单</dt><dd>右键</dd></div>
          <div><dt>自由生成节点</dt><dd>双击空白处</dd></div>
          <div><dt>撤销</dt><dd>⌘ Z</dd></div>
          <div><dt>重做</dt><dd>⌘ ⇧ Z</dd></div>
          <div><dt>平移画布</dt><dd>Space</dd></div>
          <div><dt>删除选择</dt><dd>Delete</dd></div>
        </dl>
      ) : null}

      {panel === 'help' ? (
        <div className="workspace-side-panel__help">
          <p>双击空白画布自由生成，或右键选择“添加节点”创建指定内容。</p>
          <p>选择节点后可使用节点动作或右侧 Agent 继续创作。</p>
          <p>当前为本地演示工作台，不会调用 Liblib、发布内容或消耗积分。</p>
        </div>
      ) : null}
    </aside>
  )
}

function FilmPlaceholder() {
  return <span className="workspace-side-panel__media-placeholder"><Sparkles aria-hidden="true" /></span>
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

const splitOptions = [
  '4 宫格（2×2）',
  '9 宫格（3×3）',
  '16 宫格（4×4）',
  '25 宫格（5×5）',
  '自定义',
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
  onRotateImage(nodeId: string): void
}

export function SelectionContextBar({
  project,
  node,
  onCreateToolNode,
  onRotateImage,
}: SelectionContextBarProps) {
  const [surface, setSurface] = useState<ImageToolSurface>()
  const [pendingTool, setPendingTool] = useState<string>()
  const [previewIndex, setPreviewIndex] = useState(0)
  const [lightingDirty, setLightingDirty] = useState(false)
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
        <button type="button" onClick={() => setSurface('portrait')}><Sparkles aria-hidden="true" />人像质感调节</button>
        <button type="button" onClick={() => requestToolNode('全景')}><Rotate3D aria-hidden="true" />全景</button>
        <button type="button" onClick={() => setSurface('multi-angle')}><Rotate3D aria-hidden="true" />多角度</button>
        <button type="button" onClick={() => setSurface('lighting')}><Lightbulb aria-hidden="true" />打光</button>
        <button type="button" onClick={() => setSurface('nine-grid')}><Grid3X3 aria-hidden="true" />九宫格</button>
        <button type="button" onClick={() => requestToolNode('高清')}><ScanLine aria-hidden="true" />高清</button>
        <button type="button" onClick={() => setSurface('split')}><Grid3X3 aria-hidden="true" />宫格切分</button>
        <button type="button" onClick={() => setSurface('annotation')}><Pencil aria-hidden="true" />标注</button>
        <button type="button" title="旋转" onClick={() => onRotateImage(node.id)}><RotateCw aria-hidden="true" />旋转</button>
        <button type="button" title="下载" onClick={downloadCurrent}><Download aria-hidden="true" />下载</button>
        <button type="button" title="预览" onClick={openPreview}><Maximize2 aria-hidden="true" />预览</button>
      </div>

      {surface === 'portrait' ? (
        <div className="image-tool-menu" role="menu" aria-label="人像质感调节">
          <button type="button" role="menuitem" onClick={() => requestToolNode('人像调节')}>人像调节</button>
          <button type="button" role="menuitem" disabled title="该副作用尚未完成实机核对">情绪调节</button>
        </div>
      ) : null}

      {surface === 'nine-grid' ? (
        <div className="image-tool-menu image-tool-menu--long" role="menu" aria-label="九宫格模板">
          {nineGridTemplates.map((template) => <button key={template} type="button" role="menuitem" disabled>{template}</button>)}
        </div>
      ) : null}

      {surface === 'split' ? (
        <div className="image-tool-menu" role="menu" aria-label="宫格切分规格">
          {splitOptions.map((option) => <button key={option} type="button" role="menuitem" disabled>{option}</button>)}
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
            <div className="canvas-tool-config__footer"><button type="reset">重置参数</button><button type="submit" disabled={!lightingDirty}>生成</button></div>
          </form>
        </ImageToolDialog>
      ) : null}

      {surface === 'annotation' ? (
        <ImageToolDialog title="标注编辑器" onClose={() => setSurface(undefined)}>
          <div className="annotation-tools" role="toolbar" aria-label="标注工具">
            <button type="button" aria-label="画笔" aria-pressed="true"><Brush aria-hidden="true" /></button>
            <button type="button" aria-label="框注"><Square aria-hidden="true" /></button>
            <button type="button" aria-label="文字"><Type aria-hidden="true" /></button>
            <label aria-label="颜色"><input type="color" defaultValue="#ff0000" /></label>
            <label aria-label="线宽"><input type="range" min="1" max="40" step="1" defaultValue="4" /></label>
            <button type="button" aria-label="撤销" disabled><Undo2 aria-hidden="true" /></button>
            <button type="button" aria-label="重做" disabled><Redo2 aria-hidden="true" /></button>
          </div>
          <div className="annotation-preview"><img src={asset.url} alt="标注预览" /></div>
          <button type="button" disabled>保存标注</button>
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
