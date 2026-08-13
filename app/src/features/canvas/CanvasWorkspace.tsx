import {
  Bot,
  Check,
  Crosshair,
  Grid3X3,
  Lightbulb,
  Map,
  Rotate3D,
  ScanLine,
  Sparkles,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'

import type { CanvasNode, JobStatus, Project } from '../project/model'

export type WorkspaceMode = 'workflow' | 'storyboard'
export type WorkspacePanel =
  | 'nodes'
  | 'assets'
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
  assets: '资产',
  history: '历史',
  shortcuts: '快捷键',
  help: '帮助',
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
  onClose(): void
  onSelectNode(nodeId: string): void
}

export function WorkspaceSidePanel({
  panel,
  project,
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

const imageTools = [
  { label: '人像质感', icon: Sparkles, description: '强化人物质感、情绪和面部细节。' },
  { label: '720°全景', icon: Rotate3D, description: '设置 2:1 全景构图与空间环绕参考。' },
  { label: '多角度', icon: Rotate3D, description: '调整镜头方向、俯仰和景别。' },
  { label: '智能打光', icon: Lightbulb, description: '设置亮度、颜色与主光方向。' },
  { label: '九宫格', icon: Grid3X3, description: '创建多机位与连贯分镜配置。' },
  { label: '高清', icon: ScanLine, description: '创建 2× 高清增强配置。' },
  { label: '宫格拆分', icon: Grid3X3, description: '按 2×2、3×3 或自定义网格拆分素材。' },
] as const

interface SelectionContextBarProps {
  node?: CanvasNode
  onCreateToolNode(tool: string): void
}

export function SelectionContextBar({ node, onCreateToolNode }: SelectionContextBarProps) {
  const [activeTool, setActiveTool] = useState<(typeof imageTools)[number]>()
  useEffect(() => setActiveTool(undefined), [node?.id])
  useEffect(() => {
    if (!activeTool) return
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActiveTool(undefined)
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [activeTool])

  if (node?.kind !== 'image' && node?.kind !== 'character' && node?.kind !== 'scene') {
    return null
  }

  return (
    <>
      <div className="selection-context-bar floating-panel" role="toolbar" aria-label="图片创作工具">
        {imageTools.map((tool) => {
          const Icon = tool.icon
          return (
            <button key={tool.label} type="button" onClick={() => setActiveTool(tool)}>
              <Icon aria-hidden="true" />
              {tool.label}
            </button>
          )
        })}
      </div>
      {activeTool ? (
        <section className="canvas-tool-config" role="dialog" aria-modal="false" aria-label={`${activeTool.label}配置`}>
          <div className="canvas-tool-config__heading">
            <h2>{activeTool.label}配置</h2>
            <button type="button" aria-label="关闭工具配置" onClick={() => setActiveTool(undefined)}><X aria-hidden="true" /></button>
          </div>
          <p>{activeTool.description}</p>
          <label>
            创作描述
            <textarea defaultValue={`基于“${node.title}”保持主体一致性`} rows={3} />
          </label>
          <p className="canvas-tool-config__disclosure">本地配置预览 · 确认前不会修改画布或触发生成</p>
          <button
            type="button"
            className="canvas-tool-config__primary"
            onClick={() => {
              onCreateToolNode(activeTool.label)
              setActiveTool(undefined)
            }}
          >
            创建配置节点
          </button>
        </section>
      ) : null}
    </>
  )
}
