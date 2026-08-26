import {
  ArrowDown,
  ArrowUp,
  Expand,
  FileVideo2,
  Languages,
  Plus,
  Trash2,
  Zap,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import type {
  AudioNodeDetails,
  CanvasNodeDetails,
  DirectorNodeDetails,
  ScriptNodeDetails,
  SmartEditNodeDetails,
  TextFontStyle,
  TextNodeDetails,
} from '../../project/model'
import {
  defaultProviderRegistry,
  groupProvidersForMenu,
  isProviderEnabled,
  modelProviderVariant,
  modelProviderVariantCost,
  modelProviderVariants,
  type ModelCapability,
  type ModelProvider,
} from '../../generation/model-provider-registry'
import type { CreativeNodeData } from '../node-types'
import { extractAudioToWav } from '../../media/browser-media-processing'

const panelTypeCopy: Record<CanvasNodeDetails['type'], string> = {
  text: '文本',
  script: '脚本',
  audio: '音频',
  director: '导演台',
  'frame-analysis': '逐帧拉片',
  'smart-edit': '智能剪辑',
}

function countCharacters(value: string) {
  return Array.from(value).length
}

const textComposerPlaceholder =
  '写下你想讲的故事、场景或角色设定。例如：一个来自未来的机器人，在城市屋顶看星星。'

function isTextCreationPlaceholder(value: string) {
  return value === '双击画布创建的自由文本节点' || value === '右键画布创建的文本节点'
}

function formatDuration(seconds: number) {
  const safeSeconds = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(safeSeconds / 60)
  return `${String(minutes).padStart(2, '0')}:${String(safeSeconds % 60).padStart(2, '0')}`
}

function createId(prefix: string) {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}`
}

function nextDirectorShotTitle(shots: DirectorNodeDetails['shots']) {
  const nextNumber = shots.reduce((highest, shot) => {
    const match = /^\u5206\u955c\s*(\d+)$/.exec(shot.title)
    return Math.max(highest, match ? Number(match[1]) : 0)
  }, shots.length) + 1
  return `分镜 ${String(nextNumber).padStart(2, '0')}`
}

function DetailsHeading({ type }: { type: CanvasNodeDetails['type'] }) {
  return (
    <header className="specialized-node-details__heading">
      <span>NODE PARAMETERS</span>
      <strong>{panelTypeCopy[type]}参数</strong>
    </header>
  )
}

function providerForDetails(
  data: CreativeNodeData,
  preferredId: string | undefined,
  capability: ModelCapability,
) {
  const registry = data.providerRegistry ?? defaultProviderRegistry
  return (
    registry.list().find(({ id }) => id === preferredId) ??
    registry.matching([capability]).find(({ kind }) => kind === 'demo')
  )
}

function ModelVariantField({
  label,
  provider,
  value,
  onChange,
}: {
  label: string
  provider: ModelProvider
  value: string
  onChange(variantId: string): void
}) {
  return (
    <label className="specialized-node-details__field">
      <span>{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
        {modelProviderVariants(provider).map((variant) => (
          <option key={variant.id} value={variant.id}>
            {variant.name} · {variant.pricing.amount} 积分
          </option>
        ))}
      </select>
    </label>
  )
}

function TextModelField({
  data,
  label,
  provider,
  variantId,
  onChange,
}: {
  data: CreativeNodeData
  label: string
  provider: ModelProvider
  variantId: string
  onChange(provider: ModelProvider, variantId: string | undefined): void
}) {
  const registry = data.providerRegistry ?? defaultProviderRegistry
  const providers = registry.matching(['text'])
  const value = provider.variants?.length ? variantId : provider.id

  return (
    <label className="specialized-node-details__field text-node-composer__model">
      <span className="visually-hidden">{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => {
          const nextValue = event.currentTarget.value
          const directProvider = providers.find(({ id }) => id === nextValue)
          if (directProvider) {
            onChange(directProvider, directProvider.variants?.[0]?.id)
            return
          }
          const variantProvider = providers.find((candidate) =>
            candidate.variants?.some(({ id }) => id === nextValue),
          )
          if (variantProvider) onChange(variantProvider, nextValue)
        }}
      >
        {groupProvidersForMenu(providers).map((group) => (
          <optgroup key={group.id} label={group.label}>
            {group.providers.flatMap((candidate) =>
              candidate.variants?.length
                ? candidate.variants.map((variant) => (
                    <option
                      key={`${candidate.id}:${variant.id}`}
                      value={variant.id}
                      disabled={!isProviderEnabled(candidate)}
                    >
                      {variant.name} · {variant.pricing.amount} 积分
                    </option>
                  ))
                : [(
                    <option
                      key={candidate.id}
                      value={candidate.id}
                      disabled={!isProviderEnabled(candidate)}
                    >
                      {candidate.modelName} · {candidate.pricing.amount} 积分
                      {candidate.disabledReason ? ` · ${candidate.disabledReason}` : ''}
                    </option>
                  )],
            )}
          </optgroup>
        ))}
      </select>
    </label>
  )
}

function DemoModelMeta({
  provider,
  variantId,
}: {
  provider: ModelProvider
  variantId: string
}) {
  return (
    <div className="specialized-node-details__meta">
      <span>预计成本 {modelProviderVariantCost(provider, variantId)}</span>
      <span title="演示 Provider 不会连接真实 API">本地演示</span>
    </div>
  )
}

function TextDetails({
  data,
  details,
  onUpdate,
}: {
  data: CreativeNodeData
  details: TextNodeDetails
  onUpdate(details: TextNodeDetails): void
}) {
  const initialProvider = providerForDetails(
    data,
    details.modelProviderId ?? 'mock-text-llm',
    'text',
  )
  if (!initialProvider) return <p role="status">文本模型未配置</p>
  const [providerId, setProviderId] = useState(initialProvider.id)
  const provider = providerForDetails(data, providerId, 'text') ?? initialProvider
  const initialVariant = modelProviderVariant(initialProvider, details.modelVariant)
  const [variantId, setVariantId] = useState(initialVariant?.id ?? '')
  const [prompt, setPrompt] = useState(details.prompt ?? '')
  const [generatedModel, setGeneratedModel] = useState(details.generatedByModel ?? '')
  const [status, setStatus] = useState('')
  const [expanded, setExpanded] = useState(false)
  const selectedVariant = modelProviderVariant(provider, variantId)
  const cost = modelProviderVariantCost(provider, variantId)

  const selectModel = (
    nextProvider: ModelProvider,
    nextVariantId: string | undefined,
  ) => {
    const normalizedVariantId = nextVariantId ?? ''
    setProviderId(nextProvider.id)
    setVariantId(normalizedVariantId)
    const variant = modelProviderVariant(nextProvider, normalizedVariantId)
    const fontStyle = variant?.defaultParameters?.fontStyle
    onUpdate({
      ...details,
      modelProviderId: nextProvider.id,
      modelVariant: nextVariantId,
      prompt,
      fontStyle:
        typeof fontStyle === 'string'
          ? (fontStyle as TextFontStyle)
          : details.fontStyle,
    })
  }

  const generate = () => {
    const cleanPrompt = prompt.trim()
    if (!cleanPrompt) {
      setStatus('请输入提示词后再生成。')
      return
    }
    const variant = modelProviderVariant(provider, variantId)
    const modelName = variant?.name ?? provider.modelName
    const nextDetails: TextNodeDetails = {
      ...details,
      modelProviderId: provider.id,
      modelVariant: variant?.id,
      prompt: cleanPrompt,
      generatedByModel: modelName,
    }
    if (data.onGenerateText) {
      onUpdate(nextDetails)
      data.onGenerateText(nextDetails, cleanPrompt)
      setGeneratedModel(modelName)
      setStatus('文本生成任务已提交。')
      return
    }
    const lead =
      variantId === 'deep-script'
        ? '深度脚本文案'
        : variantId === 'idea-expansion'
          ? '灵感扩展方案'
          : variantId === 'qwen-3-vl-flash'
            ? '快速多模态文案'
            : '基础文案'
    onUpdate({
      ...details,
      modelProviderId: provider.id,
      modelVariant: variantId,
      prompt: cleanPrompt,
      content: `${lead}：${cleanPrompt}。本地演示结果已回填。`,
      generatedByModel: modelName,
    })
    setGeneratedModel(modelName)
    setStatus('本地演示生成完成，未连接真实 API。')
  }

  return (
    <div className={`text-node-composer${expanded ? ' text-node-composer--expanded' : ''}`}>
      <button
        type="button"
        className="text-node-composer__expand"
        aria-label={expanded ? '收起文本编辑器' : '展开文本编辑器'}
        aria-pressed={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <Expand aria-hidden="true" />
      </button>
      <label className="text-node-composer__prompt">
        <span className="visually-hidden">文本生成提示词</span>
        <textarea
          aria-label="文本生成提示词"
          placeholder={textComposerPlaceholder}
          rows={expanded ? 9 : 5}
          maxLength={2000}
          value={prompt}
          onChange={(event) => {
            const nextPrompt = event.currentTarget.value
            setPrompt(nextPrompt)
            onUpdate({
              ...details,
              prompt: nextPrompt,
              modelProviderId: provider.id,
              modelVariant: variantId,
            })
          }}
          onBlur={() => onUpdate({ ...details, prompt, modelProviderId: provider.id, modelVariant: variantId })}
        />
      </label>
      <footer className="text-node-composer__controls">
        <TextModelField
          data={data}
          label="文本模型"
          provider={provider}
          variantId={variantId}
          onChange={selectModel}
        />
        <span className="text-node-composer__latency">
          {String(selectedVariant?.defaultParameters?.latency ?? '')}{' '}
          {String(selectedVariant?.defaultParameters?.steps ?? '')}
        </span>
        <span
          className="text-node-composer__demo"
          title={provider.kind === 'live' ? provider.modelNotice : '演示 Provider 不会连接真实 API'}
        >
          {provider.kind === 'live' ? '官方 API 已接' : '本地演示'}
        </span>
        <span className="text-node-composer__spacer" />
        <button
          type="button"
          className="text-node-composer__icon-button"
          aria-label="翻译文本"
          title="翻译服务未接入，当前为本地演示"
          onClick={() => setStatus('翻译服务未接入，当前为本地演示。')}
        >
          <Languages aria-hidden="true" />
        </button>
        <span className="text-node-composer__cost" aria-label={`预计成本 ${cost}`}>
          <Zap aria-hidden="true" /> {cost}
        </span>
        <button
          type="button"
          className="text-node-composer__generate"
          aria-label={`生成文本，预计成本 ${cost}`}
          disabled={!prompt.trim()}
          title={prompt.trim() ? (provider.kind === 'live' ? '官方 API 开发直连' : '本地演示') : '请输入提示词后生成'}
          onClick={generate}
        >
          <ArrowUp aria-hidden="true" />
        </button>
      </footer>
      {!prompt.trim() ? <small className="text-node-composer__reason">请输入提示词后生成</small> : null}
      {generatedModel ? <p className="text-node-composer__source">来源模型：{generatedModel}</p> : null}
      {status ? <p className="text-node-composer__status" role="status">{status}</p> : null}
      {details.content.trim() && !isTextCreationPlaceholder(details.content) ? (
        <div className="text-node-composer__result">
          <label className="specialized-node-details__field">
            <span>文本内容</span>
            <textarea
              aria-label="文本内容"
              rows={6}
              maxLength={5000}
              value={details.content}
              onChange={(event) => onUpdate({ ...details, content: event.currentTarget.value })}
            />
          </label>
          <div className="specialized-node-details__meta">
            <span>{countCharacters(details.content)} / 5000</span>
            <label>
              <span>字体样式</span>
              <select aria-label="字体样式" value={details.fontStyle} onChange={(event) => onUpdate({ ...details, fontStyle: event.currentTarget.value as typeof details.fontStyle })}>
                {['正文', '标题', '引用', '等宽'].map((style) => <option key={style}>{style}</option>)}
              </select>
            </label>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function ScriptDetails({
  data,
  details,
  onUpdate,
}: {
  data: CreativeNodeData
  details: ScriptNodeDetails
  onUpdate(details: ScriptNodeDetails): void
}) {
  const initialProvider = providerForDetails(
    data,
    details.modelProviderId ?? 'mock-text-llm',
    'text',
  )
  if (!initialProvider) return <p role="status">脚本模型未配置</p>
  const [providerId, setProviderId] = useState(initialProvider.id)
  const provider = providerForDetails(data, providerId, 'text') ?? initialProvider
  const defaultVariant = modelProviderVariant(initialProvider, details.modelVariant ?? 'deep-script')
  const [variantId, setVariantId] = useState(defaultVariant?.id ?? '')
  const [outline, setOutline] = useState(details.outline ?? '')
  const [sceneCountDraft, setSceneCountDraft] = useState(
    String(details.sceneCount ?? 3),
  )
  const [generatedModel, setGeneratedModel] = useState(details.generatedByModel ?? '')
  const [status, setStatus] = useState('')
  const cost = modelProviderVariantCost(provider, variantId)

  const selectModel = (
    nextProvider: ModelProvider,
    nextVariantId: string | undefined,
  ) => {
    const normalizedVariantId = nextVariantId ?? ''
    setProviderId(nextProvider.id)
    setVariantId(normalizedVariantId)
    const defaultSceneCount = modelProviderVariant(
      nextProvider,
      normalizedVariantId,
    )?.defaultParameters?.sceneCount
    const nextSceneCount =
      typeof defaultSceneCount === 'number'
        ? defaultSceneCount
        : Math.min(20, Math.max(1, Number(sceneCountDraft) || 1))
    setSceneCountDraft(String(nextSceneCount))
    onUpdate({
      ...details,
      modelProviderId: nextProvider.id,
      modelVariant: nextVariantId,
      outline,
      sceneCount: nextSceneCount,
    })
  }

  const generate = () => {
    const cleanOutline = outline.trim()
    if (!cleanOutline) {
      setStatus('请输入剧情大纲后再生成。')
      return
    }
    const count = Math.min(
      20,
      Math.max(1, Math.round(Number(sceneCountDraft) || 1)),
    )
    const variant = modelProviderVariant(provider, variantId)
    const modelName = variant?.name ?? provider.modelName
    const nextDetails: ScriptNodeDetails = {
      ...details,
      modelProviderId: provider.id,
      modelVariant: variant?.id,
      outline: cleanOutline,
      sceneCount: count,
      generatedByModel: modelName,
    }
    if (data.onGenerateText) {
      onUpdate(nextDetails)
      data.onGenerateText(nextDetails, cleanOutline)
      setGeneratedModel(modelName)
      setStatus('脚本生成任务已提交。')
      return
    }
    onUpdate({
      ...details,
      modelProviderId: provider.id,
      modelVariant: variantId,
      outline: cleanOutline,
      sceneCount: count,
      generatedByModel: modelName,
      chapters: Array.from({ length: count }, (_, index) => ({
        id: createId(`script-scene-${index + 1}`),
        title: `场次 ${String(index + 1).padStart(2, '0')}`,
        summary: `${cleanOutline} · 第 ${index + 1} 场本地演示拆解`,
      })),
    })
    setGeneratedModel(modelName)
    setStatus('本地演示脚本生成完成，未连接真实 API。')
  }

  return (
    <>
      <TextModelField
        data={data}
        label="脚本模型"
        provider={provider}
        variantId={variantId}
        onChange={selectModel}
      />
      <label className="specialized-node-details__field">
        <span>剧情大纲</span>
        <textarea aria-label="剧情大纲" rows={4} maxLength={3000} value={outline} onChange={(event) => setOutline(event.currentTarget.value)} />
      </label>
      <label className="specialized-node-details__field">
        <span>场次数量</span>
        <input
          type="number"
          aria-label="场次数量"
          min="1"
          max="20"
          step="1"
          value={sceneCountDraft}
          onChange={(event) => setSceneCountDraft(event.currentTarget.value)}
          onBlur={() => {
            const count = Math.min(
              20,
              Math.max(1, Math.round(Number(sceneCountDraft) || 1)),
            )
            setSceneCountDraft(String(count))
            onUpdate({ ...details, outline, sceneCount: count })
          }}
        />
      </label>
      {provider.kind === 'live' ? (
        <div className="specialized-node-details__meta">
          <span>预计成本 {cost}</span>
          <span title={provider.modelNotice}>官方 API 已接</span>
        </div>
      ) : (
        <DemoModelMeta provider={provider} variantId={variantId} />
      )}
      <button
        type="button"
        className="specialized-node-details__primary"
        aria-label={`生成脚本，预计成本 ${cost}`}
        disabled={!outline.trim()}
        title={outline.trim() ? (provider.kind === 'live' ? '官方 API 开发直连' : '本地演示') : '请输入剧情大纲后生成'}
        onClick={generate}
      >生成脚本</button>
      {!outline.trim() ? <small>请输入剧情大纲后生成</small> : null}
      {generatedModel ? <p>来源模型：{generatedModel}</p> : null}
      {status ? <p role="status">{status}</p> : null}
      <ol className="specialized-node-details__chapters" aria-label="章节列表">
        {details.chapters.map((chapter, index) => (
          <li key={chapter.id}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <input aria-label={`${chapter.title}标题`} value={chapter.title} maxLength={60} onChange={(event) => onUpdate({ ...details, chapters: details.chapters.map((candidate) => candidate.id === chapter.id ? { ...candidate, title: event.currentTarget.value } : candidate) })} />
            <textarea aria-label={`${chapter.title}情节摘要`} value={chapter.summary} rows={3} maxLength={1000} onChange={(event) => onUpdate({ ...details, chapters: details.chapters.map((candidate) => candidate.id === chapter.id ? { ...candidate, summary: event.currentTarget.value } : candidate) })} />
          </li>
        ))}
      </ol>
      <strong className="specialized-node-details__count">共 {details.chapters.reduce((total, chapter) => total + countCharacters(chapter.title) + countCharacters(chapter.summary), 0)} 字</strong>
    </>
  )
}

function AudioDetails({
  data,
  details,
  onUpdate,
}: {
  data: CreativeNodeData
  details: AudioNodeDetails
  onUpdate(details: AudioNodeDetails): void
}) {
  const provider = providerForDetails(
    data,
    details.modelProviderId ?? 'mock-audio',
    'audio',
  )
  if (!provider) return <p role="status">本地音频模型未配置</p>
  const [variantId, setVariantId] = useState(
    modelProviderVariant(provider, details.modelVariant)?.id ?? '',
  )
  const audioRef = useRef<HTMLAudioElement>(null)
  const [waveform, setWaveform] = useState<number[]>([])
  const [processingStatus, setProcessingStatus] = useState('')
  const startSeconds = details.trimStartSeconds ?? 0
  const endSeconds = details.trimEndSeconds ?? details.durationSeconds
  const playbackRate = details.playbackRate ?? 1

  useEffect(() => {
    if (data.asset?.kind !== 'audio') return
    let active = true
    setProcessingStatus('正在读取真实音频波形…')
    extractAudioToWav(data.asset.url)
      .then((result) => {
        if (!active) return
        setWaveform(result.waveform ?? [])
        if (details.durationSeconds <= 0 && (result.durationSeconds ?? 0) > 0) {
          onUpdate({
            ...details,
            durationSeconds: result.durationSeconds!,
            trimStartSeconds: 0,
            trimEndSeconds: result.durationSeconds!,
            playbackRate: details.playbackRate ?? 1,
          })
        }
        setProcessingStatus('')
      })
      .catch((error) => {
        if (!active) return
        setProcessingStatus(error instanceof Error ? error.message : '无法读取音频波形。')
      })
    return () => { active = false }
  }, [data.asset?.id, data.asset?.kind, data.asset?.url])

  const selectVariant = (nextVariantId: string) => {
    setVariantId(nextVariantId)
    const defaults = modelProviderVariant(provider, nextVariantId)?.defaultParameters ?? {}
    onUpdate({
      ...details,
      modelProviderId: provider.id,
      modelVariant: nextVariantId,
      durationSeconds:
        typeof defaults.durationSeconds === 'number'
          ? defaults.durationSeconds
          : details.durationSeconds,
      voice:
        typeof defaults.voice === 'string'
          ? (defaults.voice as AudioNodeDetails['voice'])
          : details.voice,
      speed: typeof defaults.speed === 'number' ? defaults.speed : details.speed,
      volume: typeof defaults.volume === 'number' ? defaults.volume : details.volume,
    })
  }

  return (
    <>
      <ModelVariantField label="音频模型" provider={provider} value={variantId} onChange={selectVariant} />
      <DemoModelMeta provider={provider} variantId={variantId} />
      <div className="specialized-node-details__audio-summary">
        <span>当前时长</span>
        <strong>{formatDuration(details.durationSeconds)}</strong>
      </div>
      <label className="specialized-node-details__field">
        <span>音色</span>
        <select aria-label="音色" value={details.voice} onChange={(event) => onUpdate({ ...details, voice: event.currentTarget.value as typeof details.voice })}>
          {['温暖女声', '沉稳男声', '清亮少年', '纪录片旁白'].map((voice) => <option key={voice}>{voice}</option>)}
        </select>
      </label>
      <div className="specialized-node-details__split-fields">
        <label><span>语速</span><input type="number" aria-label="语速" min="0.5" max="2" step="0.1" value={details.speed} onChange={(event) => onUpdate({ ...details, speed: Math.min(2, Math.max(0.5, Number(event.currentTarget.value) || 0.5)) })} /></label>
        <label><span>音量</span><input type="number" aria-label="音量" min="0" max="100" step="1" value={details.volume} onChange={(event) => onUpdate({ ...details, volume: Math.min(100, Math.max(0, Number(event.currentTarget.value) || 0)) })} /></label>
      </div>
      {data.asset?.kind === 'audio' ? (
        <section className="audio-processing" aria-label="音频截取与变速">
          <div className="audio-processing__waveform" role="img" aria-label="真实音频波形">
            {(waveform.length ? waveform : Array.from({ length: 48 }, () => 0.08)).map((level, index) => (
              <span key={index} style={{ height: `${Math.max(8, level * 100)}%` }} />
            ))}
          </div>
          <label>入点<input aria-label="音频入点" type="range" min="0" max={Math.max(0, endSeconds - 0.05)} step="0.01" value={startSeconds} onChange={(event) => onUpdate({ ...details, trimStartSeconds: Number(event.currentTarget.value) })} /></label>
          <label>出点<input aria-label="音频出点" type="range" min={Math.min(details.durationSeconds, startSeconds + 0.05)} max={details.durationSeconds} step="0.01" value={endSeconds} onChange={(event) => onUpdate({ ...details, trimEndSeconds: Number(event.currentTarget.value) })} /></label>
          <label>变速<input aria-label="音频变速" type="range" min="0.5" max="2" step="0.1" value={playbackRate} onChange={(event) => onUpdate({ ...details, playbackRate: Number(event.currentTarget.value) })} /></label>
          <p>{startSeconds.toFixed(2)}–{endSeconds.toFixed(2)} 秒 · {playbackRate.toFixed(1)}x</p>
          <audio ref={audioRef} src={data.asset.url} preload="metadata" onTimeUpdate={(event) => { if (event.currentTarget.currentTime >= endSeconds) event.currentTarget.pause() }} />
          <div>
            <button type="button" onClick={() => { const player = audioRef.current; if (!player) return; player.currentTime = startSeconds; player.playbackRate = playbackRate; void player.play() }}>试听选区</button>
            <button type="button" onClick={() => void data.onProcessAudio?.({ startSeconds, endSeconds, playbackRate })}>截取并导出 WAV</button>
          </div>
          {processingStatus ? <p role="status">{processingStatus}</p> : null}
        </section>
      ) : null}
    </>
  )
}

function DirectorDetails({
  details,
  onUpdate,
}: {
  details: DirectorNodeDetails
  onUpdate(details: DirectorNodeDetails): void
}) {
  const updateShot = (
    shotId: string,
    changes: Partial<DirectorNodeDetails['shots'][number]>,
  ) => {
    onUpdate({
      ...details,
      shots: details.shots.map((shot) =>
        shot.id === shotId ? { ...shot, ...changes } : shot,
      ),
    })
  }
  const moveShot = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction
    if (nextIndex < 0 || nextIndex >= details.shots.length) return
    const shots = [...details.shots]
    const [shot] = shots.splice(index, 1)
    shots.splice(nextIndex, 0, shot)
    onUpdate({ ...details, shots })
  }

  return (
    <>
      <ol className="specialized-node-details__shot-list" aria-label="分镜编排列表">
        {details.shots.map((shot, index) => (
          <li key={shot.id}>
            <span className="specialized-node-details__index">{String(index + 1).padStart(2, '0')}</span>
            <label>
              <span>分镜名称</span>
              <input
                aria-label={`${shot.title}分镜名称`}
                value={shot.title}
                maxLength={40}
                onChange={(event) => updateShot(shot.id, { title: event.currentTarget.value })}
              />
            </label>
            <label>
              <span>机位提示</span>
              <input
                aria-label={`${shot.title}机位提示`}
                value={shot.cameraHint}
                maxLength={100}
                onChange={(event) => updateShot(shot.id, { cameraHint: event.currentTarget.value })}
              />
            </label>
            <div className="specialized-node-details__row-actions">
              <button type="button" aria-label={`上移${shot.title}`} disabled={index === 0} onClick={() => moveShot(index, -1)}>
                <ArrowUp aria-hidden="true" />
              </button>
              <button type="button" aria-label={`下移${shot.title}`} disabled={index === details.shots.length - 1} onClick={() => moveShot(index, 1)}>
                <ArrowDown aria-hidden="true" />
              </button>
              <button type="button" aria-label={`删除${shot.title}`} onClick={() => onUpdate({ ...details, shots: details.shots.filter(({ id }) => id !== shot.id) })}>
                <Trash2 aria-hidden="true" />
              </button>
            </div>
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="specialized-node-details__add"
        onClick={() => onUpdate({
          ...details,
          shots: [
            ...details.shots,
            {
              id: createId('director-shot'),
              title: nextDirectorShotTitle(details.shots),
              cameraHint: '等待补充机位和镜头运动',
            },
          ],
        })}
      >
        <Plus aria-hidden="true" />新增分镜
      </button>
    </>
  )
}

function SmartEditDetails({
  details,
  onUpdate,
}: {
  details: SmartEditNodeDetails
  onUpdate(details: SmartEditNodeDetails): void
}) {
  const updateClip = (
    clipId: string,
    changes: Partial<SmartEditNodeDetails['clips'][number]>,
  ) => {
    const clips = details.clips.map((clip) =>
      clip.id === clipId ? { ...clip, ...changes } : clip,
    )
    onUpdate({
      ...details,
      clips,
      exportDurationSeconds: clips.reduce(
        (total, clip) => total + Math.max(0, clip.durationSeconds),
        0,
      ),
    })
  }

  return (
    <>
      <ul className="specialized-node-details__tracks" aria-label="剪辑轨道">
        {details.tracks.map((track, index) => (
          <li key={track.id}>
            <span>V{index + 1}</span>
            <strong>{track.name}</strong>
            <i aria-hidden="true" />
          </li>
        ))}
      </ul>
      <ol className="specialized-node-details__clips" aria-label="片段列表">
        {details.clips.map((clip) => (
          <li key={clip.id}>
            <input
              aria-label={`${clip.name}名称`}
              value={clip.name}
              maxLength={40}
              onChange={(event) => updateClip(clip.id, { name: event.currentTarget.value })}
            />
            <label>
              <span>时长（秒）</span>
              <input
                type="number"
                aria-label={`${clip.name}时长`}
                min="0"
                max="600"
                step="0.5"
                value={clip.durationSeconds}
                onChange={(event) => updateClip(clip.id, {
                  durationSeconds: Math.min(600, Math.max(0, Number(event.currentTarget.value) || 0)),
                })}
              />
            </label>
          </li>
        ))}
      </ol>
      <strong className="specialized-node-details__duration">导出时长 {formatDuration(details.exportDurationSeconds)}</strong>
    </>
  )
}

export function SpecializedNodeDetailsPanel({ data }: { data: CreativeNodeData }) {
  const details = data.node.details
  const [demoStatus, setDemoStatus] = useState('')
  if (!details) return null
  const update = (next: CanvasNodeDetails) => data.onUpdateNodeDetails?.(next)

  return (
    <section
      className={`specialized-node-details nodrag nowheel${details.type === 'text' ? ' specialized-node-details--text' : ''}`}
      role="region"
      aria-label={`${data.node.title} ${panelTypeCopy[details.type]}参数`}
    >
      {details.type === 'text' ? null : <DetailsHeading type={details.type} />}

      {details.type === 'text' ? (
        <TextDetails data={data} details={details} onUpdate={update} />
      ) : null}

      {details.type === 'script' ? (
        <ScriptDetails data={data} details={details} onUpdate={update} />
      ) : null}

      {details.type === 'audio' ? (
        <AudioDetails data={data} details={details} onUpdate={update} />
      ) : null}

      {details.type === 'director' ? <DirectorDetails details={details} onUpdate={update} /> : null}

      {details.type === 'frame-analysis' ? (
        <>
          <div className="specialized-node-details__source">
            <FileVideo2 aria-hidden="true" />
            <span><strong>{details.sourceName}</strong><small>{details.sourceSummary}</small></span>
            <label className="specialized-node-details__replace">
              替换素材
              <input
                type="file"
                aria-label="替换素材"
                accept="video/*,image/*,audio/*"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0]
                  if (!file) return
                  update({ ...details, sourceName: file.name, sourceSummary: `${file.type || '本地素材'} · ${Math.max(1, Math.round(file.size / 1024))} KB` })
                }}
              />
            </label>
          </div>
          <fieldset className="specialized-node-details__dimensions">
            <legend>分析维度</legend>
            {([
              ['storyboard', '分镜维度'],
              ['motion', '动态维度'],
              ['music', '音乐维度'],
            ] as const).map(([dimension, label]) => (
              <label key={dimension}>
                <input type="checkbox" checked={details.dimensions[dimension]} onChange={(event) => update({ ...details, dimensions: { ...details.dimensions, [dimension]: event.currentTarget.checked } })} />
                {label}
              </label>
            ))}
          </fieldset>
          <button
            type="button"
            className="specialized-node-details__primary"
            disabled={!Object.values(details.dimensions).some(Boolean)}
            onClick={() => setDemoStatus('演示分析已完成，未调用真实模型。')}
          >开始拉片（演示）</button>
          {demoStatus ? <p role="status">{demoStatus}</p> : null}
        </>
      ) : null}

      {details.type === 'smart-edit' ? <SmartEditDetails details={details} onUpdate={update} /> : null}
    </section>
  )
}
