import {
  Handle,
  Position,
  type NodeProps,
} from '@xyflow/react'
import { useEffect, useRef } from 'react'
import {
  BookOpenText,
  Clapperboard,
  Contact,
  Film,
  Globe2,
  Image,
  MonitorPlay,
  Pencil,
  RefreshCw,
  ScanLine,
  Trash2,
  Type,
  UserRound,
  X,
} from 'lucide-react'
import type { ReactNode } from 'react'

import { StatusText } from '../../../ui/StatusText'
import { primaryActionsForNode } from '../node-action-policy'
import type { CreativeFlowNode, CreativeNodeData } from '../node-types'
import { ImageGenerationPanel, ImageResults } from './ImageNodeDetails'

const kindCopy = {
  character: '角色',
  'character-card': '角色卡',
  scene: '场景',
  script: '剧本卡',
  text: '文本',
  image: '图片',
  storyboard: '分镜',
  video: '视频',
  preview: '预览',
  worldview: '世界观卡',
} as const

const statusCopy = {
  queued: '排队中',
  running: '生成中',
  succeeded: '已完成',
  failed: '生成失败',
  cancelled: '已取消',
} as const

const kindIcons = {
  character: UserRound,
  'character-card': Contact,
  scene: Image,
  script: BookOpenText,
  text: Type,
  image: Image,
  storyboard: Clapperboard,
  video: Film,
  preview: MonitorPlay,
  worldview: Globe2,
}

function NodeActions({ data }: { data: CreativeNodeData }) {
  const actionIcons = {
    'edit-card': Pencil,
    regenerate: RefreshCw,
    'extend-shot': ScanLine,
    'generate-video': Film,
    'add-to-timeline': Clapperboard,
    'cancel-generation': X,
    'retry-generation': RefreshCw,
  } as const

  return (
    <div
      className="creative-node-actions nodrag"
      aria-label={`${data.node.title}操作`}
      data-placement={data.actionsPlacement}
    >
      {primaryActionsForNode(data.node.kind, data.asset !== undefined).map(
        ({ action, label }) => {
          const ActionIcon = actionIcons[action]

          return (
            <button
              key={action}
              type="button"
              className={
                action === 'add-to-timeline'
                  ? 'creative-node-actions__primary'
                  : undefined
              }
              data-action={action}
              onClick={(event) => data.onAction(action, event.currentTarget)}
            >
              <ActionIcon aria-hidden="true" />
              {label}
            </button>
          )
        },
      )}
      {data.job?.status === 'queued' || data.job?.status === 'running' ? (
        <button
          type="button"
          onClick={(event) =>
            data.onAction('cancel-generation', event.currentTarget)
          }
        >
          <X aria-hidden="true" />
          取消生成
        </button>
      ) : null}
      {data.job?.status === 'failed' || data.job?.status === 'cancelled' ? (
        <button
          type="button"
          onClick={(event) => data.onAction('retry-generation', event.currentTarget)}
        >
          <RefreshCw aria-hidden="true" />
          重试生成
        </button>
      ) : null}
      <button
        type="button"
        className="creative-node-actions__danger"
        aria-label="删除节点"
        onClick={(event) => data.onDelete(event.currentTarget)}
      >
        <Trash2 aria-hidden="true" />
        删除
      </button>
    </div>
  )
}

export function CreativeNodeShell({
  data,
  preview,
  hidePrompt = false,
}: {
  data: CreativeNodeData
  preview?: ReactNode
  hidePrompt?: boolean
}) {
  const {
    node,
    asset,
    job,
    selected,
    contextual,
    focusOnMount,
    onFocusComplete,
  } = data
  const selectRef = useRef<HTMLButtonElement>(null)
  const KindIcon = kindIcons[node.kind]
  const activeVersion = node.versions.find(
    (version) => version.id === node.activeVersionId,
  )
  const imageMedia =
    asset?.kind === 'image' &&
    (node.kind === 'image' || node.kind === 'character' || node.kind === 'scene')

  useEffect(() => {
    if (!focusOnMount) return
    let animationFrame: number

    const focusWhenVisible = () => {
      const select = selectRef.current
      const flowNode = select?.closest<HTMLElement>('.react-flow__node')
      const canReceiveFocus = Boolean(
        select?.isConnected &&
          flowNode &&
          getComputedStyle(flowNode).visibility !== 'hidden' &&
          getComputedStyle(flowNode).display !== 'none' &&
          !select.closest('[inert]'),
      )
      if (!select || !canReceiveFocus) {
        animationFrame = requestAnimationFrame(focusWhenVisible)
        return
      }

      select.focus({ preventScroll: true })
      if (document.activeElement === select) {
        onFocusComplete()
        return
      }
      animationFrame = requestAnimationFrame(focusWhenVisible)
    }

    animationFrame = requestAnimationFrame(focusWhenVisible)
    return () => cancelAnimationFrame(animationFrame)
  }, [focusOnMount, onFocusComplete])

  return (
    <div className="creative-node-layout">
      <article
        className={`creative-node creative-node--${node.kind}${
          selected ? ' creative-node--selected' : ''
        }${node.sourceChanged ? ' creative-node--changed' : ''}${
          data.connectionMode ? ' creative-node--connection-mode' : ''
        }${data.connectionSource ? ' creative-node--connection-source' : ''}${
          imageMedia ? ' creative-node--image-media' : ''
        }${imageMedia && contextual ? ' creative-node--expanded' : ''}`}
      >
        <Handle
          id="dependency-target"
          type="target"
          position={Position.Left}
          role="button"
          tabIndex={0}
          aria-label={`连接到${node.title}`}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            event.stopPropagation()
            data.onHandleActivate('target', event.currentTarget)
          }}
        />
        <button
          ref={selectRef}
          type="button"
          className="creative-node__select"
          aria-label={node.title}
          data-canvas-node-id={node.id}
          onClick={data.onSelect}
        >
          <span className="creative-node__heading">
            <span className="creative-node__kind">
              <KindIcon aria-hidden="true" />
              {kindCopy[node.kind]}
            </span>
            <strong>{node.title}</strong>
          </span>
          {preview ??
            (asset ? (
              <img
                src={asset.url}
                alt=""
                className="creative-node__media"
                style={{ transform: `rotate(${(node.rotationQuarterTurns ?? 0) * 90}deg)` }}
              />
            ) : null)}
          {imageMedia && asset.width && asset.height ? (
            <span className="creative-node__dimensions">{asset.width} × {asset.height}</span>
          ) : null}
          {!hidePrompt && !imageMedia ? (
            <span className="creative-node__prompt">
              {activeVersion?.prompt ?? '尚未生成内容'}
            </span>
          ) : null}
          {node.sourceChanged ? (
            <StatusText status="offline">上游来源已变更</StatusText>
          ) : job ? (
            <StatusText status={job.status === 'cancelled' ? 'idle' : job.status}>
              {statusCopy[job.status]}
            </StatusText>
          ) : (
            <StatusText status="idle">就绪</StatusText>
          )}
        </button>
        {imageMedia ? <ImageResults data={data} /> : null}
        {imageMedia && contextual ? <ImageGenerationPanel data={data} /> : null}
        <Handle
          id="dependency-source"
          type="source"
          position={Position.Right}
          role="button"
          tabIndex={0}
          aria-label={`从${node.title}建立连接`}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            event.stopPropagation()
            data.onHandleActivate('source', event.currentTarget)
          }}
        />
      </article>
      {contextual ? <NodeActions data={data} /> : null}
    </div>
  )
}

export function AssetNode({ data }: NodeProps<CreativeFlowNode>) {
  return <CreativeNodeShell data={data} />
}
