import {
  Handle,
  Position,
  type NodeProps,
} from '@xyflow/react'
import { useEffect, useRef, useState } from 'react'
import {
  BookOpenText,
  Clapperboard,
  Contact,
  Film,
  Globe2,
  Image,
  Images,
  Maximize2,
  MonitorPlay,
  Pencil,
  RefreshCw,
  Type,
  UserRound,
  X,
} from 'lucide-react'
import type { ReactNode } from 'react'

import { StatusText } from '../../../ui/StatusText'
import { primaryActionsForNode } from '../node-action-policy'
import type { CreativeFlowNode, CreativeNodeData } from '../node-types'
import { ImageGenerationPanel, ImageResults } from './ImageNodeDetails'
import { VideoGenerationPanel, VideoToolDetails } from './VideoNodeDetails'
import { SpecializedNodeDetailsPanel } from './SpecializedNodeDetails'
import { specializedNodeTypeCopy } from './specialized-node-copy'

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
    'add-to-timeline': Clapperboard,
    'cancel-generation': X,
    'retry-generation': RefreshCw,
  } as const

  const actions = data.node.effectTool
    ? []
    : primaryActionsForNode(data.node.kind, data.asset !== undefined).filter(
        ({ action }) => !(data.node.details && action === 'edit-card'),
      )
  const canCancel = data.job?.status === 'queued' || data.job?.status === 'running'
  const canRetry = data.job?.status === 'failed' || data.job?.status === 'cancelled'
  if (!actions.length && !canCancel && !canRetry) return null

  return (
    <div
      className="creative-node-actions nodrag"
      aria-label={`${data.node.title}操作`}
      data-placement={data.actionsPlacement}
    >
      {actions.map(
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
      {canCancel ? (
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
      {canRetry ? (
        <button
          type="button"
          onClick={(event) => data.onAction('retry-generation', event.currentTarget)}
        >
          <RefreshCw aria-hidden="true" />
          重试生成
        </button>
      ) : null}
    </div>
  )
}

function EffectToolDetails({ data }: { data: CreativeNodeData }) {
  const config = data.node.effectTool
  if (!config) return null
  return (
    <section className="effect-node-parameters nodrag" aria-label={`${data.node.title} 特效参数`}>
      <div className="effect-node-parameters__heading">
        <span>EFFECT</span>
        <strong>{config.effect}</strong>
      </div>
      <label>强度
        <input
          type="number"
          min="0"
          max="100"
          aria-label="强度"
          value={config.intensity}
          onChange={(event) => data.onUpdateEffectTool?.({
            intensity: Math.min(100, Math.max(0, Number(event.target.value) || 0)),
          })}
        />
      </label>
      <label>颜色
        <input type="color" aria-label="颜色" value={config.color} onChange={(event) => data.onUpdateEffectTool?.({ color: event.target.value })} />
      </label>
      <label>方向
        <select aria-label="方向" value={config.direction} onChange={(event) => data.onUpdateEffectTool?.({ direction: event.target.value as typeof config.direction })}>
          {['无', '左到右', '右到左', '上升', '下降', '径向'].map((value) => <option key={value}>{value}</option>)}
        </select>
      </label>
      <label>混合模式
        <select aria-label="混合模式" value={config.blendMode} onChange={(event) => data.onUpdateEffectTool?.({ blendMode: event.target.value as typeof config.blendMode })}>
          {['正常', '滤色', '叠加', '柔光'].map((value) => <option key={value}>{value}</option>)}
        </select>
      </label>
    </section>
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
  const upscaleTriggerRef = useRef<HTMLButtonElement>(null)
  const [imageToImage, setImageToImage] = useState(false)
  const [upscalePending, setUpscalePending] = useState(false)
  const KindIcon = kindIcons[node.kind]
  const specializedDetails = node.details
  const activeVersion = node.versions.find(
    (version) => version.id === node.activeVersionId,
  )
  const imageMedia =
    asset?.kind === 'image' &&
    (node.kind === 'image' || node.kind === 'character' || node.kind === 'scene')
  const imageGenerationNode =
    (node.kind === 'image' || node.kind === 'character' || node.kind === 'scene') &&
    node.videoTool === undefined
  const videoGenerationNode =
    node.kind === 'video' &&
    node.videoTool === undefined &&
    specializedDetails === undefined
  const videoMedia = asset?.kind === 'video' && node.kind === 'video'
  const liblibMediaNode = imageGenerationNode || videoGenerationNode
  const expandableMedia = liblibMediaNode || node.videoTool !== undefined || node.effectTool !== undefined || specializedDetails !== undefined

  useEffect(() => {
    setImageToImage(false)
    setUpscalePending(false)
  }, [node.id])

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
        }${videoMedia ? ' creative-node--video-media' : ''}${
          specializedDetails ? ' creative-node--specialized' : ''
        }${liblibMediaNode ? ' creative-node--liblib-media' : ''}${
          expandableMedia && contextual ? ' creative-node--expanded' : ''
        }`}
      >
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
              {specializedDetails
                ? specializedNodeTypeCopy[specializedDetails.type]
                : kindCopy[node.kind]}
            </span>
            <strong>{node.title}</strong>
          </span>
          {specializedDetails ? null : preview ??
            (asset?.kind === 'video' ? (
              <video
                src={asset.url}
                className="creative-node__media"
                poster="/demo/shot-river.png"
                muted
                loop
                playsInline
                preload="metadata"
              />
            ) : asset ? (
              <img
                src={asset.url}
                alt=""
                className="creative-node__media"
                style={{ transform: `rotate(${(node.rotationQuarterTurns ?? 0) * 90}deg)` }}
              />
            ) : liblibMediaNode ? (
              <span className="creative-node__media-placeholder">
                <KindIcon aria-hidden="true" />
                <span>尚未添加{imageGenerationNode ? '图片' : '视频'}</span>
              </span>
            ) : null)}
          {imageMedia && asset.width && asset.height ? (
            <span className="creative-node__dimensions">{asset.width} × {asset.height}</span>
          ) : null}
          {videoMedia ? (
            <>
              <span className="creative-node__dimensions">
                {asset.width ?? 1280} × {asset.height ?? 720}
              </span>
              <span className="creative-node__result-count-label">1 个结果</span>
            </>
          ) : null}
          {!specializedDetails && !hidePrompt && !imageMedia && !videoMedia && !liblibMediaNode ? (
            <span className="creative-node__prompt">
              {activeVersion?.prompt ?? '尚未生成内容'}
            </span>
          ) : null}
          {specializedDetails ? null : node.sourceChanged ? (
            <StatusText status="offline">上游来源已变更</StatusText>
          ) : job ? (
            <StatusText status={job.status === 'cancelled' ? 'idle' : job.status}>
              {statusCopy[job.status]}
            </StatusText>
          ) : liblibMediaNode ? null : (
            <StatusText status="idle">就绪</StatusText>
          )}
        </button>
        {imageGenerationNode && contextual ? (
          <div
            className="creative-node__quick-attempts nodrag"
            role="toolbar"
            aria-label="图片快捷尝试"
          >
            <span>尝试：</span>
            <button
              type="button"
              aria-pressed={imageToImage}
              onClick={() => setImageToImage((enabled) => !enabled)}
            >
              <Images aria-hidden="true" />图生图
            </button>
            <button
              ref={upscaleTriggerRef}
              type="button"
              onClick={() => setUpscalePending(true)}
            >
              <Maximize2 aria-hidden="true" />图片高清
            </button>
          </div>
        ) : null}
        {imageGenerationNode ? <ImageResults data={data} /> : null}
        {node.videoTool && contextual && !specializedDetails ? <VideoToolDetails data={data} /> : null}
        {node.effectTool && contextual ? <EffectToolDetails data={data} /> : null}
        {specializedDetails && contextual ? <SpecializedNodeDetailsPanel data={data} /> : null}
        <Handle
          id="dependency-target"
          type="target"
          position={Position.Left}
          style={expandableMedia && contextual ? { top: 112 } : undefined}
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
        <Handle
          id="dependency-source"
          className="creative-node__source-handle"
          type="source"
          position={Position.Right}
          style={expandableMedia && contextual ? { top: 112 } : undefined}
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
      {imageGenerationNode && contextual ? (
        <div className="creative-node-composer">
          <ImageGenerationPanel
            data={data}
            imageToImage={imageToImage}
            upscalePending={upscalePending}
            onUpscalePendingChange={setUpscalePending}
            upscaleTriggerRef={upscaleTriggerRef}
          />
        </div>
      ) : null}
      {videoGenerationNode && contextual ? (
        <div className="creative-node-composer creative-node-composer--video">
          <VideoGenerationPanel data={data} />
        </div>
      ) : null}
      {contextual ? <NodeActions data={data} /> : null}
    </div>
  )
}

export function AssetNode({ data }: NodeProps<CreativeFlowNode>) {
  return <CreativeNodeShell data={data} />
}
