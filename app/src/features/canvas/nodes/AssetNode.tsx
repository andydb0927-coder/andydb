import {
  Handle,
  Position,
  type NodeProps,
} from '@xyflow/react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  AlignLeft,
  Ban,
  Bold,
  BookOpenText,
  Camera,
  Clapperboard,
  Contact,
  Copy,
  FileImage,
  FileText,
  FileVideo2,
  Film,
  Globe2,
  Image,
  Italic,
  List,
  ListOrdered,
  Maximize2,
  Minimize2,
  Minus,
  MonitorPlay,
  Music2,
  Pause,
  Pencil,
  Pilcrow,
  Play,
  RefreshCw,
  Type,
  Upload,
  UserRound,
  X,
} from 'lucide-react'
import type { ReactNode } from 'react'

import { withAppBase } from '../../../app/public-url'
import { StatusText } from '../../../ui/StatusText'
import type {
  TextEditorBlockStyle,
  TextEditorListStyle,
  TextNodeDetails,
  VideoDerivedTool,
} from '../../project/model'
import { primaryActionsForNode } from '../node-action-policy'
import type { CreativeFlowNode, CreativeNodeData } from '../node-types'
import { imageMirrorTransform } from '../../media/browser-media-processing'
import { ImageAnnotationOverlay } from '../ImageAnnotationEditor'
import {
  ImageGenerationPanel,
  ImageResults,
  ImageToolDetails,
} from './ImageNodeDetails'
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

function formatPlaybackTime(seconds: number) {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0
  const minutes = Math.floor(safeSeconds / 60)
  return `${minutes}:${String(safeSeconds % 60).padStart(2, '0')}`
}

function NodeActions({ data }: { data: CreativeNodeData }) {
  const actionIcons = {
    'edit-card': Pencil,
    'add-to-timeline': Clapperboard,
    'cancel-generation': X,
    'retry-generation': RefreshCw,
  } as const

  const actions = data.node.effectTool || data.node.imageTool
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

function stripListPrefix(line: string) {
  return line.replace(/^\s*(?:[\u2022*-]|\d+[.)])\s+/, '')
}

function applyListStyle(content: string, style: TextEditorListStyle) {
  if (style === 'none') {
    return content.split('\n').map(stripListPrefix).join('\n')
  }
  return content
    .split('\n')
    .map((line, index) => {
      const cleanLine = stripListPrefix(line)
      if (!cleanLine) return ''
      return style === 'bullet' ? `• ${cleanLine}` : `${index + 1}. ${cleanLine}`
    })
    .join('\n')
}

function ManualTextEditor({
  data,
  details,
  expanded,
  onExpandedChange,
}: {
  data: CreativeNodeData
  details: TextNodeDetails
  expanded: boolean
  onExpandedChange(expanded: boolean): void
}) {
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const [contentDraft, setContentDraft] = useState(details.content)
  const [copyStatus, setCopyStatus] = useState('')
  const blockStyle = details.editorBlockStyle ?? 'paragraph'
  const listStyle = details.editorListStyle ?? 'none'

  useEffect(() => {
    setContentDraft(details.content)
  }, [details.content])

  const update = (changes: Partial<TextNodeDetails>) => {
    data.onUpdateNodeDetails?.({
      ...details,
      editorMode: 'manual',
      editorBlockStyle: blockStyle,
      editorBold: details.editorBold ?? false,
      editorItalic: details.editorItalic ?? false,
      editorListStyle: listStyle,
      ...changes,
    })
  }

  const setBlockStyle = (nextStyle: TextEditorBlockStyle) => {
    update({ editorBlockStyle: nextStyle })
  }

  const toggleListStyle = (nextStyle: Exclude<TextEditorListStyle, 'none'>) => {
    const resolvedStyle = listStyle === nextStyle ? 'none' : nextStyle
    const nextContent = applyListStyle(contentDraft, resolvedStyle)
    setContentDraft(nextContent)
    update({
      editorListStyle: resolvedStyle,
      content: nextContent,
    })
  }

  const insertDivider = () => {
    const editor = editorRef.current
    const start = editor?.selectionStart ?? contentDraft.length
    const end = editor?.selectionEnd ?? start
    const prefix = start > 0 && contentDraft[start - 1] !== '\n' ? '\n' : ''
    const suffix = end < contentDraft.length && contentDraft[end] !== '\n' ? '\n' : ''
    const insertion = `${prefix}---${suffix}`
    const nextContent = `${contentDraft.slice(0, start)}${insertion}${contentDraft.slice(end)}`
    setContentDraft(nextContent)
    update({ content: nextContent })
  }

  const copyText = async () => {
    if (!contentDraft.trim()) {
      setCopyStatus('暂无可复制内容')
      return
    }
    try {
      await navigator.clipboard.writeText(contentDraft)
      setCopyStatus('已复制文本')
    } catch {
      setCopyStatus('复制失败，请允许剪贴板权限')
    }
  }

  return (
    <div className="creative-node__manual-editor nodrag nowheel">
      {data.contextual ? <div className="creative-node__manual-toolbar" role="toolbar" aria-label="文本格式工具">
        <button
          type="button"
          aria-label="清除文本格式"
          title="清除格式"
          onClick={() => {
            const nextContent = applyListStyle(contentDraft, 'none')
            setContentDraft(nextContent)
            update({
              editorBlockStyle: 'paragraph',
              editorBold: false,
              editorItalic: false,
              editorListStyle: 'none',
              content: nextContent,
            })
          }}
        >
          <Ban aria-hidden="true" />
        </button>
        {(['h1', 'h2', 'h3'] as const).map((style, index) => (
          <button
            key={style}
            type="button"
            aria-label={`${['一', '二', '三'][index]}级标题`}
            aria-pressed={blockStyle === style}
            onClick={() => setBlockStyle(style)}
          >
            H{index + 1}
          </button>
        ))}
        <button
          type="button"
          aria-label="正文"
          aria-pressed={blockStyle === 'paragraph'}
          onClick={() => setBlockStyle('paragraph')}
        >
          <Pilcrow aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="加粗"
          aria-pressed={Boolean(details.editorBold)}
          onClick={() => update({ editorBold: !details.editorBold })}
        >
          <Bold aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="斜体"
          aria-pressed={Boolean(details.editorItalic)}
          onClick={() => update({ editorItalic: !details.editorItalic })}
        >
          <Italic aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="无序列表"
          aria-pressed={listStyle === 'bullet'}
          onClick={() => toggleListStyle('bullet')}
        >
          <List aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="有序列表"
          aria-pressed={listStyle === 'ordered'}
          onClick={() => toggleListStyle('ordered')}
        >
          <ListOrdered aria-hidden="true" />
        </button>
        <button type="button" aria-label="插入分隔线" onClick={insertDivider}>
          <Minus aria-hidden="true" />
        </button>
        <button type="button" aria-label="复制文本" onClick={() => void copyText()}>
          <Copy aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={expanded ? '收起文本节点' : '展开文本节点'}
          aria-pressed={expanded}
          onClick={() => onExpandedChange(!expanded)}
        >
          {expanded ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
        </button>
      </div> : null}
      <textarea
        ref={editorRef}
        aria-label="自己编写内容"
        placeholder="输入内容..."
        maxLength={5000}
        value={contentDraft}
        data-block-style={blockStyle}
        data-bold={Boolean(details.editorBold)}
        data-italic={Boolean(details.editorItalic)}
        onFocus={data.onSelect}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => {
          const nextContent = event.currentTarget.value
          setContentDraft(nextContent)
          update({ content: nextContent })
        }}
      />
      {data.contextual && copyStatus ? <span className="creative-node__manual-copy-status" role="status">{copyStatus}</span> : null}
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
  const videoRef = useRef<HTMLVideoElement>(null)
  const upscaleTriggerRef = useRef<HTMLButtonElement>(null)
  const imageToImageInputRef = useRef<HTMLInputElement>(null)
  const renameCancelledRef = useRef(false)
  const [imageToImage, setImageToImage] = useState(false)
  const [upscalePending, setUpscalePending] = useState(false)
  const [titleDraft, setTitleDraft] = useState(node.title)
  const [videoPlaying, setVideoPlaying] = useState(false)
  const [videoCurrentTime, setVideoCurrentTime] = useState(0)
  const [videoDuration, setVideoDuration] = useState(
    asset?.kind === 'video' ? asset.durationSeconds ?? 0 : 0,
  )
  const [manualTextExpanded, setManualTextExpanded] = useState(false)
  const [pendingVideoFrame, setPendingVideoFrame] =
    useState<VideoDerivedTool>()
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
    node.videoTool === undefined &&
    node.imageTool === undefined
  const imageToolNode = node.kind === 'image' && node.imageTool !== undefined
  const videoGenerationNode =
    node.kind === 'video' &&
    node.videoTool === undefined &&
    specializedDetails === undefined
  const videoMedia = asset?.kind === 'video' && node.kind === 'video'
  const audioMedia = asset?.kind === 'audio' && specializedDetails?.type === 'audio'
  const liblibMediaNode = imageGenerationNode || videoGenerationNode || imageToolNode
  const textGenerationNode = specializedDetails?.type === 'text'
  const manualTextNode = textGenerationNode && specializedDetails.editorMode === 'manual'
  const textComposerNode = textGenerationNode && !manualTextNode
  const liblibCompactNode = liblibMediaNode || textGenerationNode
  const expandableMedia = liblibMediaNode || node.videoTool !== undefined || node.effectTool !== undefined || specializedDetails !== undefined

  const selectTextQuickTry = (
    label: '自己编写内容' | '文生视频' | '图片反推提示词' | '文字生音乐',
  ) => {
    data.onSelect()
    if (!textGenerationNode) return
    if (label === '自己编写内容') {
      const placeholderContent =
        specializedDetails.content === '双击画布创建的自由文本节点' ||
        specializedDetails.content === '右键画布创建的文本节点'
      data.onUpdateNodeDetails?.({
        ...specializedDetails,
        editorMode: 'manual',
        editorBlockStyle: specializedDetails.editorBlockStyle ?? 'paragraph',
        editorBold: specializedDetails.editorBold ?? false,
        editorItalic: specializedDetails.editorItalic ?? false,
        editorListStyle: specializedDetails.editorListStyle ?? 'none',
        content: placeholderContent ? '' : specializedDetails.content,
      })
      return
    }
    if (label === '文生视频') {
      data.onCreateTextToVideoPreset?.()
      return
    }
    const promptTemplates = {
      '图片反推提示词': '请根据参考图片反推构图、人物、光线与风格提示词：',
      '文字生音乐': '请将以下文字整理为音乐氛围、乐器和节奏提示词：',
    } as const
    if (specializedDetails.prompt?.trim()) return
    data.onUpdateNodeDetails?.({
      ...specializedDetails,
      prompt: promptTemplates[label],
    })
  }

  useEffect(() => {
    setImageToImage(false)
    setUpscalePending(false)
    setVideoPlaying(false)
    setVideoCurrentTime(0)
    setVideoDuration(asset?.kind === 'video' ? asset.durationSeconds ?? 0 : 0)
    setPendingVideoFrame(undefined)
    setManualTextExpanded(false)
  }, [node.id])

  useEffect(() => {
    if (!pendingVideoFrame) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPendingVideoFrame(undefined)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [pendingVideoFrame])

  useEffect(() => {
    setTitleDraft(node.title)
  }, [node.id, node.title])

  const commitTitle = () => {
    if (renameCancelledRef.current) {
      renameCancelledRef.current = false
      setTitleDraft(node.title)
      return
    }
    const title = titleDraft.trim().slice(0, 80)
    if (!title) {
      setTitleDraft(node.title)
      return
    }
    setTitleDraft(title)
    if (title !== node.title) data.onRenameNode?.(title)
  }

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
      {liblibCompactNode ? (
        <div className="creative-node__floating-title nodrag nowheel">
          {textGenerationNode ? <FileText aria-hidden="true" /> : <KindIcon aria-hidden="true" />}
          <input
            type="text"
            aria-label="节点名称"
            value={titleDraft}
            maxLength={80}
            size={Math.min(24, Math.max(4, titleDraft.length))}
            onChange={(event) => setTitleDraft(event.target.value)}
            onBlur={commitTitle}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                event.currentTarget.blur()
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                renameCancelledRef.current = true
                setTitleDraft(node.title)
                event.currentTarget.blur()
              }
            }}
          />
        </div>
      ) : null}
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
          textGenerationNode ? ' creative-node--liblib-text' : ''
        }${manualTextNode ? ' creative-node--manual-text' : ''}${
          manualTextNode && manualTextExpanded ? ' creative-node--manual-text-expanded' : ''
        }${
          expandableMedia && contextual && !manualTextNode ? ' creative-node--expanded' : ''
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
          {!liblibCompactNode ? (
            <span className="creative-node__heading">
              <span className="creative-node__kind">
                <KindIcon aria-hidden="true" />
                {specializedDetails
                  ? specializedNodeTypeCopy[specializedDetails.type]
                  : kindCopy[node.kind]}
              </span>
              <strong>{node.title}</strong>
            </span>
          ) : null}
          {textComposerNode ? (
            <span className="creative-node__text-preview" aria-hidden="true">
              <AlignLeft />
            </span>
          ) : specializedDetails ? null : preview ??
            (asset?.kind === 'video' ? (
              <video
                ref={videoRef}
                src={asset.url}
                className="creative-node__media"
                poster={withAppBase('/demo/shot-river.png')}
                muted
                loop
                playsInline
                preload="metadata"
                onDurationChange={(event) => {
                  if (Number.isFinite(event.currentTarget.duration)) {
                    setVideoDuration(event.currentTarget.duration)
                  }
                }}
                onTimeUpdate={(event) =>
                  setVideoCurrentTime(event.currentTarget.currentTime)
                }
                onPlay={() => setVideoPlaying(true)}
                onPause={() => setVideoPlaying(false)}
                onEnded={() => setVideoPlaying(false)}
              />
            ) : asset ? (
              <img
                src={asset.url}
                alt=""
                className="creative-node__media"
                style={{
                  transform: imageMirrorTransform(
                    node.rotationQuarterTurns,
                    node.mirrorHorizontal,
                    node.mirrorVertical,
                  ),
                }}
              />
            ) : liblibMediaNode ? (
              <span className="creative-node__media-placeholder">
                <KindIcon aria-hidden="true" />
                <span className="visually-hidden">
                  尚未添加{imageGenerationNode ? '图片' : '视频'}
                </span>
              </span>
            ) : null)}
          {imageMedia ? (
            <ImageAnnotationOverlay annotations={node.imageAnnotations ?? []} />
          ) : null}
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
        {audioMedia ? (
          <audio
            className="creative-node__audio-player nodrag nowheel"
            aria-label={`播放${node.title}`}
            src={asset.url}
            controls
            preload="metadata"
          />
        ) : null}
        {videoMedia ? (
          <>
            <div
              className="creative-node__inline-player nodrag nowheel"
              role="group"
              aria-label={`${node.title} 播放器`}
            >
              <button
                type="button"
                aria-label={`${videoPlaying ? '暂停' : '播放'}${node.title}`}
                onClick={() => {
                  data.onSelect()
                  const video = videoRef.current
                  if (!video) return
                  if (video.paused) {
                    void video.play().catch(() => setVideoPlaying(false))
                  } else {
                    video.pause()
                  }
                }}
              >
                {videoPlaying ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
              </button>
              <input
                type="range"
                aria-label="视频进度"
                min="0"
                max={Math.max(videoDuration, 1)}
                step="0.01"
                value={Math.min(videoCurrentTime, Math.max(videoDuration, 1))}
                onChange={(event) => {
                  const nextTime = Number(event.target.value)
                  setVideoCurrentTime(nextTime)
                  if (videoRef.current) videoRef.current.currentTime = nextTime
                }}
              />
              <span>{formatPlaybackTime(videoCurrentTime)} / {formatPlaybackTime(videoDuration)}</span>
              <button
                type="button"
                aria-label={`截取${node.title}当前帧`}
                onClick={() => {
                  data.onSelect()
                  setPendingVideoFrame('截取当前帧')
                }}
              >
                <Camera aria-hidden="true" />
              </button>
            </div>
            {contextual ? (
              <div
                className="creative-node__video-frame-tools nodrag nowheel"
                role="toolbar"
                aria-label="帧操作"
              >
                {(['截取首帧', '截取尾帧', '截取当前帧'] as const).map((tool) => (
                  <button key={tool} type="button" onClick={() => setPendingVideoFrame(tool)}>
                    {tool}
                  </button>
                ))}
                <button
                  type="button"
                  aria-label="相机截取当前帧"
                  onClick={() => setPendingVideoFrame('截取当前帧')}
                >
                  <Camera aria-hidden="true" />
                </button>
              </div>
            ) : null}
          </>
        ) : null}
        {imageGenerationNode && !asset ? (
          <div
            className="creative-node__quick-attempts nodrag nowheel"
            role="toolbar"
            aria-label="图片快捷尝试"
          >
            <span>尝试：</span>
            <button
              type="button"
              aria-controls={`image-to-image-input-${node.id}`}
              onClick={() => {
                data.onSelect()
                setImageToImage(true)
                imageToImageInputRef.current?.click()
              }}
            >
              <Upload aria-hidden="true" />
              图生图
            </button>
            <button
              ref={upscaleTriggerRef}
              type="button"
              onClick={() => {
                data.onSelect()
                setUpscalePending(true)
              }}
            >
              <Maximize2 aria-hidden="true" />
              图片高清
            </button>
            <input
              ref={imageToImageInputRef}
              id={`image-to-image-input-${node.id}`}
              className="visually-hidden"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              aria-label={`为${node.title}上传图生图参考`}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0]
                if (file) data.onImportImageReference?.(file)
                event.currentTarget.value = ''
              }}
            />
          </div>
        ) : null}
        {textComposerNode ? (
          <div
            className="creative-node__text-attempts nodrag nowheel"
            role="toolbar"
            aria-label="文本快捷尝试"
          >
            <span>尝试：</span>
            <button type="button" onClick={() => selectTextQuickTry('自己编写内容')}>
              <FileText aria-hidden="true" />
              自己编写内容
            </button>
            <button type="button" onClick={() => selectTextQuickTry('文生视频')}>
              <FileVideo2 aria-hidden="true" />
              文生视频
            </button>
            <button type="button" onClick={() => selectTextQuickTry('图片反推提示词')}>
              <FileImage aria-hidden="true" />
              图片反推提示词
            </button>
            <button type="button" onClick={() => selectTextQuickTry('文字生音乐')}>
              <Music2 aria-hidden="true" />
              文字生音乐
            </button>
          </div>
        ) : null}
        {manualTextNode ? (
          <ManualTextEditor
            data={data}
            details={specializedDetails}
            expanded={manualTextExpanded}
            onExpandedChange={setManualTextExpanded}
          />
        ) : null}
        {imageGenerationNode ? <ImageResults data={data} /> : null}
        {node.videoTool && contextual && !specializedDetails ? <VideoToolDetails data={data} /> : null}
        {node.effectTool && contextual ? <EffectToolDetails data={data} /> : null}
        {specializedDetails && contextual && !textGenerationNode ? <SpecializedNodeDetailsPanel data={data} /> : null}
        <Handle
          id="dependency-target"
          type="target"
          position={Position.Left}
          style={
            !liblibCompactNode && expandableMedia && contextual
              ? { top: 112 }
              : undefined
          }
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
          style={
            !liblibCompactNode && expandableMedia && contextual
              ? { top: 112 }
              : undefined
          }
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
            onImageToImageChange={setImageToImage}
            upscalePending={upscalePending}
            onUpscalePendingChange={setUpscalePending}
            upscaleTriggerRef={upscaleTriggerRef}
          />
        </div>
      ) : null}
      {imageToolNode && contextual ? (
        <div className="creative-node-composer creative-node-composer--image-tool">
          <ImageToolDetails data={data} />
        </div>
      ) : null}
      {videoGenerationNode && contextual ? (
        <div className="creative-node-composer creative-node-composer--video">
          <VideoGenerationPanel data={data} />
        </div>
      ) : null}
      {textComposerNode && contextual ? (
        <div className="creative-node-composer creative-node-composer--text">
          <SpecializedNodeDetailsPanel data={data} />
        </div>
      ) : null}
      {contextual ? <NodeActions data={data} /> : null}
      {pendingVideoFrame ? createPortal(
        <div
          className="video-frame-confirm"
          role="alertdialog"
          aria-modal="true"
          aria-label={`添加${pendingVideoFrame}工具节点`}
        >
          <div>
            <h2>将添加工具节点</h2>
            <p>“{pendingVideoFrame}”会从“{node.title}”创建本地截图节点，不会触发真实生成。</p>
            <div>
              <button type="button" onClick={() => setPendingVideoFrame(undefined)}>取消</button>
              <button
                type="button"
                onClick={() => {
                  const video = videoRef.current
                  const seconds = pendingVideoFrame === '截取首帧'
                    ? 0
                    : pendingVideoFrame === '截取尾帧'
                      ? Math.max(0, videoDuration - 0.001)
                      : videoCurrentTime
                  if (video) {
                    void data.onCaptureVideoFrame?.(
                      pendingVideoFrame as Extract<VideoDerivedTool, '截取首帧' | '截取尾帧' | '截取当前帧'>,
                      video,
                      seconds,
                    )
                  }
                  setPendingVideoFrame(undefined)
                }}
              >
                确认添加
              </button>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  )
}

export function AssetNode({ data }: NodeProps<CreativeFlowNode>) {
  return <CreativeNodeShell data={data} />
}
