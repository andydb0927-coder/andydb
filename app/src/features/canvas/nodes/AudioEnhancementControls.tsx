import { useEffect, useId, useRef, useState } from 'react'
import type { Asset, AudioNodeDetails } from '../../project/model'
import type { AudioVersionEntry, AudioVoiceSample } from '../../project/audio-version-history'
import { findAudioVoice, officialAudioVoices } from '../../generation/audio-voice-catalog'
import type { ModelProvider } from '../../generation/model-provider-registry'
import { audioFileExtension } from '../../media/audio-metadata'
import { extractAudioToWav } from '../../media/browser-media-processing'
import type { CreativeNodeData } from '../node-types'
import './audio-enhancements.css'

export function AudioVoicePicker({ value, samples, onChange }: { value: string; samples: AudioVoiceSample[]; onChange(id: string): void }) {
  const id = useId()
  const player = useRef<HTMLAudioElement>(null)
  const [status, setStatus] = useState('')
  const selected = findAudioVoice(value)
  const epoch = useRef(0)
  useEffect(() => {
    const audio = player.current
    audio?.pause()
    epoch.current += 1
    return () => { epoch.current += 1; audio?.pause() }
  }, [value])
  const preview = async (sample: AudioVoiceSample) => {
    const audio = player.current
    if (!audio) return
    const current = ++epoch.current
    audio.pause()
    audio.src = sample.asset.url
    try {
      await audio.play()
      if (epoch.current !== current) return
      if (epoch.current === current) setStatus('正在播放已有样音，不发起生成、不扣费。')
    } catch {
      if (epoch.current === current) setStatus('样音播放失败，请检查音频是否可访问或使用下方播放控件重试。')
    }
  }
  return <div className="audio-voice-picker nodrag nowheel">
    <label>音色<select aria-label="音色" value={selected?.id ?? value} onChange={event => onChange(event.target.value)}>
      {!selected ? <option value={value} disabled>{value}（旧音色，请重新选择）</option> : null}
      {officialAudioVoices.map(voice => <option key={voice.id} value={voice.id}>{voice.name} · {voice.id}</option>)}
    </select></label>
    <details><summary>音色样音（{officialAudioVoices.length}）</summary>
      {officialAudioVoices.map(voice => {
        const sample = samples.find(sample => sample.voiceId === voice.id)
        return <div key={voice.id} className="audio-voice-picker__row">
          <div><strong>{voice.name}</strong><code>{voice.id}</code></div>
          <button type="button" disabled={!sample} aria-label={`试听 ${voice.name}`} aria-describedby={`${id}-${voice.id}`} onClick={() => sample && void preview(sample)}>试听</button>
          <small id={`${id}-${voice.id}`}>{sample ? '播放本项目已有生成样音，不扣费。' : '尚无该音色样音；生成一次后可试听，不会自动生成。'}</small>
        </div>
      })}
      <audio ref={player} controls preload="none" aria-label="音色样音播放器" onError={() => setStatus('样音无法加载，请重新生成或检查音频地址。')} />
      {status ? <p role="status">{status}</p> : null}
    </details>
  </div>
}

export function AudioParameterSliders({ provider, details, onUpdate }: { provider: ModelProvider; details: AudioNodeDetails; onUpdate(details: AudioNodeDetails): void }) {
  return <div className="audio-parameter-sliders nodrag nowheel">
    {(['speed', 'volume', 'pitch'] as const).map(name => {
      const definition = provider.parameterSchema[name]
      const label = { speed: '语速', volume: '音量', pitch: '音调' }[name]
      if (definition?.type !== 'number') return <p key={name}>{label}：该模型不支持调节</p>
      const value = details[name] ?? definition.defaultValue
      return <label key={name}><span>{label}<output>{value}{name === 'speed' ? 'x' : name === 'volume' ? '%' : ''}</output></span>
        <input aria-label={label} type="range" min={definition.min} max={definition.max} step={definition.step} value={value} onChange={event => onUpdate({ ...details, [name]: Number(event.target.value) })} />
      </label>
    })}
  </div>
}

export function AudioResultInfo({ asset, entry, duration }: { asset: Asset; entry?: AudioVersionEntry; duration?: number }) {
  const seconds = duration ?? asset.durationSeconds
  return <dl className="audio-result-info" role="group" aria-label="音频结果信息">
    <div><dt>时长</dt><dd>{seconds !== undefined && seconds > 0 ? `${seconds.toFixed(2)}s` : '未读取'}</dd></div>
    <div><dt>采样率</dt><dd>{asset.sampleRate ? `${asset.sampleRate} Hz` : '未读取'}</dd></div>
    <div><dt>格式</dt><dd>{audioFileExtension(asset.mimeType).toUpperCase()}</dd></div>
    <div><dt>成本</dt><dd>{entry?.job ? `${entry.job.creditsSpent} 积分${entry.job.estimatedCostCny === undefined ? '' : `（约¥${entry.job.estimatedCostCny}）`}` : '未提供'}</dd></div>
  </dl>
}

export function AudioVersionPreview({ asset, index, enabled }: { asset: Asset; index: number; enabled: boolean }) {
  const [preview, setPreview] = useState<{ url: string; waveform?: number[]; failed?: boolean }>()
  const cached = useRef<{ url: string; waveform: number[] }>(undefined)
  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    if (cached.current?.url === asset.url) {
      setPreview(cached.current)
    } else {
      setPreview({ url: asset.url })
      void extractAudioToWav(asset.url, undefined, controller.signal).then(result => {
        if (controller.signal.aborted) return
        cached.current = { url: asset.url, waveform: result.waveform }
        setPreview(cached.current)
      }).catch(() => {
        if (!controller.signal.aborted) setPreview({ url: asset.url, failed: true })
      })
    }
    return () => controller.abort()
  }, [asset.url, enabled])
  if (!enabled) return null
  if (preview?.url !== asset.url) return <small role="status">正在读取版本波形…</small>
  if (preview.failed) return <small role="status">波形无法读取，可使用下方播放器检查音频。</small>
  if (!preview.waveform) return <small role="status">正在读取版本波形…</small>
  return <div className="audio-version-history__waveform" role="img" aria-label={`音频版本 ${index + 1} 波形`}>
    {preview.waveform.map((peak, sample) => <span key={sample} style={{ height: `${peak * 100}%` }} />)}
  </div>
}

export function AudioVersionHistory({ data }: { data: CreativeNodeData }) {
  const [open, setOpen] = useState(false)
  const versions = data.audioVersions ?? []
  const busy = data.job?.status === 'queued' || data.job?.status === 'running'
  if (versions.length < 2) return null
  return <details className="audio-version-history nodrag nowheel" onToggle={event => setOpen(event.currentTarget.open)}><summary>音频版本（{versions.length}）</summary>
    <p>{busy ? '生成处理中，请完成或取消后恢复版本。' : '可分别试听比较；恢复同时切换音频、提示词、音色与生成参数，可撤销。'}</p>
    <ol>{versions.map(({ version, asset, job }, index) => <li key={version.id}>
      <strong>版本 {index + 1} · {asset.durationSeconds === undefined ? '未读取时长' : `${asset.durationSeconds.toFixed(2)}s`}</strong>
      <AudioVersionPreview asset={asset} index={index} enabled={open} />
      <audio controls preload={open ? 'metadata' : 'none'} src={asset.url} aria-label={`试听音频版本 ${index + 1}`} />
      <p>{version.generatedPrompt ?? job?.prompt ?? version.prompt}</p>
      <small>{findAudioVoice((version.generationConfig ?? job?.generationConfig)?.parameters?.voice)?.name ?? '未记录音色'} · {job ? `${job.creditsSpent} 积分` : '未记录成本'}</small>
      <button type="button" aria-label={`恢复音频版本 ${index + 1}`} aria-pressed={version.id === data.node.activeVersionId} disabled={busy || version.id === data.node.activeVersionId} onClick={() => data.onRestoreAudioVersion?.(version.id)}>{version.id === data.node.activeVersionId ? '当前版本' : '恢复此版本'}</button>
    </li>)}</ol>
  </details>
}
