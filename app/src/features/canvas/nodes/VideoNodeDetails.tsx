import {
  ArrowUp,
  AtSign,
  SlidersHorizontal,
  Sparkles,
  X,
  Zap,
} from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import {
  defaultVideoGenerationMode,
  defaultProviderRegistry,
  groupProvidersForMenu,
  isVideoGenerationMode,
  isProviderEnabled,
  providerSupportsVideoGenerationMode,
  providerDefaultParameters,
  providerOptionLabel,
  resolveVideoGenerationMode,
  videoGenerationModeDefinitions,
} from '../../generation/model-provider-registry'
import type {
  ModelParameterName,
  ModelProvider,
  VideoGenerationMode,
} from '../../generation/model-provider-registry'
import type { CreativeNodeData } from '../node-types'
import { FrameAnalysisControls } from './FrameAnalysisControls'
import { PromptAssist } from '../PromptAssist'

type VideoSurface =
  | 'reference'
  | 'mark'
  | 'effects'
  | 'subjects'
  | 'characters'
  | 'camera-motion'
  | 'references'

const cameraMotions = [
  '固定镜头',
  '跟随拍摄',
  '盘旋抬升',
  '盘旋下降',
  '镜头上摇',
  '镜头下摇',
  '镜头左摇',
  '镜头右摇',
  '镜头上升',
  '镜头下降',
  '镜头左移',
  '镜头右移',
  '镜头前推',
  '镜头后移',
  '变焦推进',
  '变焦拉远',
  '柯克变焦',
  '环绕拍摄',
  '滚筒旋转',
  '第一视角',
  '无人机',
  '高空航拍',
  '手持拍摄',
] as const

const effectSamples = [
  '小蜜蜂运镜',
  '穿云而入',
  '飞跃地平线',
  '逆转引力',
  '地球缩放',
  '产品扫光',
] as const

const subjectSamples = ['星月吊坠', 'Isabella 现代装', 'Sophia', 'Noah'] as const
const characterSamples = [
  '清新少女',
  '精英大佬',
  '温柔熟男',
  '古风男主',
  '古风女主',
] as const


function enumOptions(
  provider: ModelProvider,
  name: ModelParameterName,
  fallback: readonly string[],
) {
  const definition = provider.parameterSchema[name]
  return definition?.type === 'enum' ? definition.options : fallback
}

function parameterString(
  parameters: Record<string, string | number | boolean>,
  name: ModelParameterName,
  fallback: string,
) {
  const value = parameters[name]
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : fallback
}

function parameterBoolean(
  parameters: Record<string, string | number | boolean>,
  name: ModelParameterName,
  fallback: boolean,
) {
  const value = parameters[name]
  return typeof value === 'boolean' ? value : fallback
}

function ReferenceSurface({
  surface,
  data,
  onClose,
}: {
  surface: VideoSurface
  data: CreativeNodeData
  onClose(): void
}) {
  if (surface === 'reference' || surface === 'mark') {
    const reference = surface === 'reference'
    return (
      <section
        className="video-selection-mode"
        role="region"
        aria-label={reference ? '从画布选择参考' : '元素选择模式'}
      >
        <strong>{reference ? '从画布选择参考' : '元素选择模式'}</strong>
        <p>{reference ? '在当前画布中添加参考' : '点击图片选择局部元素'}</p>
        <div>
          <button type="button" onClick={onClose}>返回节点</button>
          <button type="button" onClick={onClose}>退出</button>
        </div>
      </section>
    )
  }

  if (surface === 'references') {
    return (
      <section className="video-reference-popover" role="region" aria-label={`${data.videoReferences?.length ?? 0} 个引用`}>
        <strong>{data.videoReferences?.length ?? 0} @</strong>
        {data.videoReferences?.map((reference) => (
          <figure key={reference.id}>
            <img src={reference.asset.url} alt="" />
            <figcaption>{reference.title}</figcaption>
          </figure>
        ))}
      </section>
    )
  }

  const config =
    surface === 'effects'
      ? {
          title: '特效面板',
          search: '搜索特效名称、作者',
          tabs: ['特效广场', '我的收藏', '最近使用'],
          items: effectSamples,
        }
      : surface === 'subjects'
        ? {
            title: '我的主体',
            search: '搜索主体',
            tabs: ['我的主体'],
            items: subjectSamples,
          }
        : surface === 'characters'
          ? {
              title: '角色库',
              search: '搜索角色',
              tabs: ['公共角色'],
              items: characterSamples,
            }
          : {
              title: '运镜面板',
              search: '搜索运镜名称',
              tabs: ['运镜广场', '我的收藏', '我的运镜'],
              items: cameraMotions,
            }

  return (
    <section className="video-library-dialog nodrag" role="dialog" aria-modal="false" aria-label={config.title}>
      <div className="video-library-dialog__heading">
        <h3>{config.title}</h3>
        <button type="button" aria-label={`关闭${config.title}`} onClick={onClose}><X aria-hidden="true" /></button>
      </div>
      <div className="video-library-dialog__tabs" role="tablist">
        {config.tabs.map((tab, index) => <button key={tab} type="button" role="tab" aria-selected={index === 0}>{tab}</button>)}
      </div>
      <label>搜索<input type="search" placeholder={config.search} /></label>
      <p id="video-library-disabled-reason" className="video-inline-disabled-reason">本地演示仅展示已核对列表，不执行应用或收藏。</p>
      {surface === 'subjects' ? <button type="button" disabled aria-describedby="video-library-disabled-reason">创建主体</button> : null}
      {surface === 'characters' ? <p>第 1 页 · 每页 10 项</p> : null}
      <div className="video-library-dialog__grid">
        {config.items.map((item) => (
          <article key={item}>
            <span aria-hidden="true"><Sparkles /></span>
            <strong>{item}</strong>
            <button type="button" disabled aria-describedby="video-library-disabled-reason">{surface === 'subjects' ? '查看 / 使用' : '预览'}</button>
          </article>
        ))}
      </div>
    </section>
  )
}

export function VideoGenerationPanel({ data }: { data: CreativeNodeData }) {
  const generationReasonId = useId()
  const [advanced, setAdvanced] = useState(false)
  const [workflowOpen, setWorkflowOpen] = useState(false)
  const [surface, setSurface] = useState<VideoSurface>()
  const [modeNotice, setModeNotice] = useState<string>()
  const activeVersion = data.node.versions.find(({ id }) => id === data.node.activeVersionId)
  const [prompt, setPrompt] = useState(activeVersion?.prompt ?? '')
  const promptDraftRef = useRef(activeVersion?.prompt ?? '')
  const referenceCount =
    data.incomingReferenceCount ?? data.videoReferences?.length ?? 0
  const providerRegistry = data.providerRegistry ?? defaultProviderRegistry
  const providers = providerRegistry.menuProvidersFor([
    'text-to-video',
    'image-to-video',
  ])
  const selectedProvider = providerRegistry.defaultFor(
    ['text-to-video', 'image-to-video'],
    data.node.generationConfig?.providerId ?? data.node.modelProviderId,
  ) ?? defaultProviderRegistry.require('seedance-api')
  const providerDefaults = providerDefaultParameters(selectedProvider)
  const savedParameters =
    data.node.generationConfig?.providerId === selectedProvider.id
      ? data.node.generationConfig.parameters
      : undefined
  const parameters = { ...providerDefaults, ...savedParameters }
  const configuredMode = isVideoGenerationMode(parameters.generationMode)
    ? parameters.generationMode
    : defaultVideoGenerationMode
  const generationMode =
    resolveVideoGenerationMode(selectedProvider, configuredMode) ??
    defaultVideoGenerationMode
  const unsupportedModes = videoGenerationModeDefinitions.filter(
    ({ mode }) => !providerSupportsVideoGenerationMode(selectedProvider, mode),
  )
  const aspectRatio = parameterString(parameters, 'aspectRatio', '16:9')
  const duration = parameterString(parameters, 'duration', '5')
  const quality = parameterString(parameters, 'quality', '720P')
  const count = parameterString(parameters, 'count', '1')
  const parameterSummary = [
    aspectRatio,
    duration ? `${duration}s` : undefined,
    count ? `${count}个` : undefined,
    quality || undefined,
  ].filter(Boolean).join(' · ')
  const sound = parameterBoolean(parameters, 'sound', true)
  const soundSupported = selectedProvider.parameterSchema.sound?.type === 'boolean'
  const cost = selectedProvider.pricing.amount
  const selectedProviderEnabled = isProviderEnabled(selectedProvider)
  const generationUnavailableReason = !selectedProviderEnabled
    ? selectedProvider.disabledReason ?? '当前模型暂不可用。'
    : !prompt.trim() && !data.asset && referenceCount === 0
      ? '请输入提示词或添加参考媒体后再生成。'
      : undefined
  const liveConfigurationReason = providers.find(
    ({ id }) => id === 'seedance-api',
  )?.disabledReason
  const advancedParameters = [
    ['onlineSearch', '联网搜索'],
    ['materialValidation', '自动校验素材'],
    ['multiShot', '多镜头生成'],
    ['autoLink', '智能引用 AutoLink'],
  ] as const
  const supportedAdvancedParameters = advancedParameters.filter(
    ([name]) => selectedProvider.parameterSchema[name]?.type === 'boolean',
  )

  const updateParameter = (
    name: ModelParameterName,
    value: string | boolean,
  ) => data.onUpdateVideoGenerationParameters?.({ [name]: value })

  const applyPrompt = (nextPrompt: string) => {
    promptDraftRef.current = nextPrompt
    setPrompt(nextPrompt)
    data.onUpdateVideoPrompt?.(nextPrompt)
  }

  const modeAdjustmentMessage = (
    from: VideoGenerationMode,
    to: VideoGenerationMode,
  ) => `当前模型不支持${from}，已自动切换为${to}。`

  useEffect(() => {
    setAdvanced(false)
    setWorkflowOpen(false)
    setSurface(undefined)
    setModeNotice(undefined)
  }, [data.node.id])

  useEffect(() => {
    const nextPrompt = activeVersion?.prompt ?? ''
    promptDraftRef.current = nextPrompt
    setPrompt(nextPrompt)
  }, [activeVersion?.prompt, data.node.id])

  useEffect(() => {
    if (configuredMode === generationMode) return
    setModeNotice(modeAdjustmentMessage(configuredMode, generationMode))
    data.onUpdateVideoGenerationParameters?.({ generationMode })
  }, [configuredMode, data, generationMode])

  useEffect(() => {
    if (!surface) return
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setSurface(undefined)
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [surface])

  return (
    <section className="video-generation-panel nodrag" role="region" aria-label={`${data.node.title} 生成参数`}>
      <div className="video-generation-panel__primary-actions" role="toolbar" aria-label="视频主操作">
        <button type="button" onClick={() => setSurface('reference')}>参考</button>
        <button type="button" onClick={() => setSurface('mark')}>标记</button>
        <button type="button" onClick={() => setSurface('effects')}>特效</button>
        <button type="button" onClick={() => setSurface('subjects')}>主体</button>
        <button type="button" onClick={() => setSurface('characters')}>角色库</button>
        <button type="button" onClick={() => setSurface('camera-motion')}>运镜</button>
        {referenceCount ? (
          <button type="button" className="video-generation-panel__reference-count" aria-label={`${referenceCount} @ 引用`} onClick={() => setSurface('references')}>
            <AtSign aria-hidden="true" />{referenceCount}
          </button>
        ) : null}
        <button
          type="button"
          className="video-generation-panel__workflow-toggle"
          aria-label={workflowOpen ? '收起完整视频工具' : '展开完整视频工具'}
          aria-expanded={workflowOpen}
          onClick={() => setWorkflowOpen((open) => !open)}
        >
          <SlidersHorizontal aria-hidden="true" />
        </button>
      </div>
      {surface
        ? createPortal(
            <ReferenceSurface
              surface={surface}
              data={data}
              onClose={() => setSurface(undefined)}
            />,
            document.body,
          )
        : null}
      <label className="video-generation-panel__prompt">
        <span className="visually-hidden">提示词</span>
        {data.videoReferences?.length ? (
          <ul className="video-generation-panel__references" aria-label="已引用素材">
            {data.videoReferences.map((reference) => (
              <li key={reference.id}>
                <img src={reference.asset.url} alt={reference.title} />
                <span>{reference.title}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <textarea
          aria-label="提示词"
          maxLength={2000}
          rows={4}
          value={prompt}
          onInput={(event) => {
            promptDraftRef.current = event.currentTarget.value
            setPrompt(event.currentTarget.value)
          }}
          onBlur={(event) => {
            const nextTarget = event.relatedTarget
            if (
              nextTarget instanceof HTMLElement &&
              nextTarget.closest('.video-generation-panel__generate')
            ) {
              return
            }
            data.onUpdateVideoPrompt?.(promptDraftRef.current)
          }}
          placeholder="描述你想要生成的画面内容，@引用素材"
        />
      </label>
      <PromptAssist
        context="video"
        prompt={prompt}
        providerRegistry={providerRegistry}
        autoLinkEnabled={parameterBoolean(parameters, 'autoLink', true)}
        candidates={data.autoLinkCandidates ?? []}
        linkedNodeIds={data.linkedAutoLinkNodeIds ?? []}
        onPromptChange={applyPrompt}
        onVideoParameters={(changes) =>
          data.onUpdateVideoGenerationParameters?.(changes)
        }
        onCreateNode={data.onCreatePromptNode}
        onApplyAutoLink={data.onApplyAutoLink}
      />
      <div className="video-generation-panel__compact-controls">
        <label><span className="visually-hidden">模型</span><select
          aria-label="模型"
          value={selectedProvider.id}
          onChange={(event) => {
            const nextProvider = providers.find(
              ({ id }) => id === event.target.value,
            )
            const nextMode = nextProvider
              ? resolveVideoGenerationMode(nextProvider, generationMode)
              : undefined
            setModeNotice(
              nextMode && nextMode !== generationMode
                ? modeAdjustmentMessage(generationMode, nextMode)
                : undefined,
            )
            data.onSelectModelProvider?.(event.target.value)
          }}
        >
          {groupProvidersForMenu(providers).map((group) => (
            <optgroup key={group.id} label={group.label}>
              {group.providers.map((provider) => (
                <option
                  key={provider.id}
                  value={provider.id}
                  disabled={!isProviderEnabled(provider)}
                >
                  {providerOptionLabel(provider)}
                </option>
              ))}
            </optgroup>
          ))}
        </select></label>
        <span className="model-provider-badge">
          {selectedProvider.kind === 'live' ? '开发直连' : '演示'}
        </span>
        <label><span className="visually-hidden">生成模式</span><select
          aria-label="生成模式"
          aria-describedby="video-mode-reasons"
          value={generationMode}
          onChange={(event) => {
            setModeNotice(undefined)
            updateParameter(
              'generationMode',
              event.target.value as VideoGenerationMode,
            )
          }}
        >
          {videoGenerationModeDefinitions.map(({ mode }) => (
            <option
              key={mode}
              value={mode}
              disabled={!providerSupportsVideoGenerationMode(selectedProvider, mode)}
            >
              {mode}
            </option>
          ))}
        </select></label>
        <span className="video-generation-panel__parameter-row">{parameterSummary}</span>
        {soundSupported ? <label className="video-generation-panel__sound"><span className="visually-hidden">声音</span><select aria-label="声音" value={sound ? '开启' : '关闭'} onChange={(event) => updateParameter('sound', event.target.value === '开启')}><option>关闭</option><option>开启</option></select></label> : null}
        <button
          type="button"
          aria-label={advanced ? '收起高级设置' : '展开高级设置'}
          aria-expanded={advanced}
          onClick={() => setAdvanced((value) => !value)}
        >
          <SlidersHorizontal aria-hidden="true" />
        </button>
        <span className="video-generation-panel__cost" aria-label={`预计成本 ${cost}`}><Zap aria-hidden="true" /><span className="visually-hidden">预计成本 </span>{cost}</span>
        <button
          type="button"
          className="video-generation-panel__generate"
          aria-label={`生成视频，预计成本 ${cost}`}
          aria-describedby={generationUnavailableReason ? generationReasonId : undefined}
          title={
            selectedProvider.disabledReason ??
            (selectedProvider.kind === 'live'
              ? `${selectedProvider.modelName} 开发直连验证`
              : '本地演示，不连接真实生成')
          }
          disabled={Boolean(generationUnavailableReason)}
          onClick={() =>
            data.onLocalVideoGenerate?.(promptDraftRef.current)
          }
        >
          <ArrowUp aria-hidden="true" />
        </button>
      </div>
      {generationUnavailableReason ? (
        <p id={generationReasonId} className="video-generation-panel__reasons" role="status">
          {generationUnavailableReason}
        </p>
      ) : null}
      {modeNotice ? (
        <p className="video-generation-panel__reasons" role="status" aria-live="polite">
          {modeNotice}
        </p>
      ) : null}
      {selectedProvider.modelNotice ? (
        <p className="video-generation-panel__reasons" role="note" aria-label="当前模型说明">
          {selectedProvider.modelNotice}
        </p>
      ) : null}
      {liveConfigurationReason && liveConfigurationReason !== generationUnavailableReason ? (
        <p className="video-generation-panel__reasons" role="note">
          {liveConfigurationReason}
        </p>
      ) : null}
      {advanced ? (
        <div className="video-generation-panel__advanced-settings">
          {supportedAdvancedParameters.map(([name, label]) => (
            <label key={name} className="video-generation-panel__autolink">
              <input
                type="checkbox"
                aria-label={label}
                checked={parameterBoolean(parameters, name, true)}
                onChange={(event) => updateParameter(name, event.target.checked)}
              />
              {label}
            </label>
          ))}
        </div>
      ) : null}

      {workflowOpen ? (
        <section className="video-generation-panel__workflow" aria-label="完整视频工具">
          <div className="video-layer-heading"><span>引用与控制</span></div>
          <div className="video-reference-tools" role="toolbar" aria-label="引用与控制">
            <button type="button" onClick={() => setSurface('reference')}>参考</button>
            <button type="button" onClick={() => setSurface('mark')}>标记</button>
            <button type="button" onClick={() => setSurface('effects')}>特效</button>
            <button type="button" onClick={() => setSurface('subjects')}>主体</button>
            <button type="button" onClick={() => setSurface('characters')}>角色库</button>
            <button type="button" onClick={() => setSurface('camera-motion')}>运镜</button>
            <button type="button" onClick={() => setSurface('references')}><AtSign aria-hidden="true" />{referenceCount} @</button>
          </div>
          <div className="video-generation-panel__selectors">
            <label>比例<select aria-label="比例" value={aspectRatio} onChange={(event) => updateParameter('aspectRatio', event.target.value)}>{enumOptions(selectedProvider, 'aspectRatio', ['16:9']).map((option) => <option key={option}>{option}</option>)}</select></label>
            <label>时长<select aria-label="时长" value={duration} onChange={(event) => updateParameter('duration', event.target.value)}>{enumOptions(selectedProvider, 'duration', ['5']).map((seconds) => <option key={seconds} value={seconds}>{seconds} 秒</option>)}</select></label>
            <label>生成数量<select aria-label="生成数量" value={count} onChange={(event) => updateParameter('count', event.target.value)}>{enumOptions(selectedProvider, 'count', ['1']).map((option) => <option key={option} value={option}>{option} 个</option>)}</select></label>
            <label>清晰度<select aria-label="清晰度" value={quality} onChange={(event) => updateParameter('quality', event.target.value)}>{enumOptions(selectedProvider, 'quality', ['720P']).map((option) => <option key={option}>{option}</option>)}</select></label>
            <label className="video-generation-panel__toggle"><input type="checkbox" aria-label="智能分镜" />智能分镜</label>
          </div>
          <div id="video-mode-reasons" className="video-generation-panel__reasons" role="note" aria-label="生成模式禁用原因">
            {unsupportedModes.map(({ mode, capability }) => (
              <span key={mode}>
                {mode}：当前模型不支持{capability === 'text-to-video' ? '文生视频' : '参考素材生视频'}。
              </span>
            ))}
            <span>智能续写：当前节点没有可续写的视频结果。</span>
          </div>
        </section>
      ) : (
        <span id="video-mode-reasons" className="visually-hidden">
          {unsupportedModes.map(({ mode }) => `${mode}不可用。`).join(' ')}
        </span>
      )}

    </section>
  )
}

export function VideoToolDetails({ data }: { data: CreativeNodeData }) {
  const config = data.node.videoTool
  if (!config) return null

  if (config.kind === 'upscale') {
    return (
      <section className="video-tool-node-panel nodrag" role="region" aria-label="视频高清参数">
        <label>模型<select defaultValue={config.model}><option>Topazlabs</option><option>HuoShan-画质增强</option></select></label>
        <label>分辨率<select defaultValue={config.resolution}><option>1080P</option><option>2K</option><option>4K</option></select></label>
        <label>补帧<select defaultValue={config.interpolation}><option>不补帧</option><option>高质量补帧</option></select></label>
        <label>慢放倍数<select defaultValue={config.slowMotion}><option>1x</option><option>2x</option><option>3x</option><option>5x</option></select></label>
        <div><span>预计成本 {config.cost}</span><button type="button" title="本地演示，不连接真实生成">提交高清</button></div>
      </section>
    )
  }

  if (config.kind === 'frame-analysis') {
    return (
      <section className="video-tool-node-panel nodrag" role="region" aria-label="逐帧拉片参数">
        <FrameAnalysisControls data={data} />
      </section>
    )
  }

  return (
    <section className="video-tool-node-panel nodrag" role="region" aria-label="截图参数">
      <strong>{config.frame}截图</strong>
      <p>来自上游视频的本地演示帧。</p>
    </section>
  )
}
