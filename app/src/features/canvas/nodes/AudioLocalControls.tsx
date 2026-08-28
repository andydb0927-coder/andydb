import { useEffect, useRef, useState } from 'react'
import type { AudioNodeDetails } from '../../project/model'
import { extractAudioToWav, type AudioSliceOptions } from '../../media/browser-media-processing'
import { audioFileExtension } from '../../media/audio-metadata'
import { audioProcessingErrorMessage } from '../../media/audio-processing'
import type { CreativeNodeData } from '../node-types'
import { AudioResultInfo, AudioVersionHistory } from './AudioEnhancementControls'

export function AudioLocalControls({ data, details, onUpdate }: { data: CreativeNodeData; details: AudioNodeDetails; onUpdate(details: AudioNodeDetails): void }) {
  const [waveform, setWaveform] = useState<number[]>([])
  const [duration, setDuration] = useState(data.asset?.durationSeconds ?? 0)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string>()
  const previewAudio = useRef<HTMLAudioElement>(null)
  const operation = useRef<AbortController | undefined>(undefined)
  useEffect(() => {
    if (data.asset?.kind !== 'audio') return
    const controller = new AbortController()
    setStatus('正在读取真实音频波形…')
    extractAudioToWav(data.asset.url, undefined, controller.signal).then(result => {
      if (controller.signal.aborted) return
      setWaveform(result.waveform)
      setDuration(result.durationSeconds ?? 0)
      if (!operation.current) setStatus('')
    }).catch(() => {
      if (!controller.signal.aborted && !operation.current) setStatus('无法读取音频波形，请检查文件是否有效或音频地址是否支持跨域访问。裸 PCM 请先转换为 WAV。')
    })
    return () => { controller.abort(); operation.current?.abort() }
  }, [data.asset?.id, data.asset?.url])
  useEffect(() => {
    const audio = previewAudio.current
    return () => { audio?.pause(); operation.current?.abort() }
  }, [])
  if (data.asset?.kind !== 'audio') return null
  const asset = data.asset
  const startSeconds = Math.min(details.trimStartSeconds ?? 0, Math.max(0, duration - 0.01))
  const endSeconds = Math.min(details.trimEndSeconds ?? duration, duration)
  const playbackRate = details.playbackRate ?? 1
  const outputDuration = Math.max(0, (endSeconds - startSeconds) / playbackRate)
  const options: AudioSliceOptions = { startSeconds, endSeconds, playbackRate,
    ...(details.fadeInSeconds ? { fadeInSeconds: details.fadeInSeconds } : {}),
    ...(details.fadeOutSeconds ? { fadeOutSeconds: details.fadeOutSeconds } : {}),
    ...(details.normalize ? { normalize: true } : {}),
  }
  const update = (changes: Partial<AudioNodeDetails>) => {
    previewAudio.current?.pause()
    setPreviewUrl(undefined)
    onUpdate({ ...details, ...changes })
  }
  const run = async (save: boolean) => {
    if (operation.current) return
    const controller = new AbortController()
    operation.current = controller
    setBusy(true)
    setStatus(save ? '正在导出本地处理 WAV…' : '正在离线渲染试听…')
    try {
      if (save) {
        if (!data.onProcessAudio) throw new Error('当前节点暂不可保存音频处理结果。')
        await data.onProcessAudio(options, controller.signal)
      } else {
        const result = await extractAudioToWav(asset.url, options, controller.signal)
        controller.signal.throwIfAborted()
        setPreviewUrl(result.dataUrl)
      }
      if (!controller.signal.aborted) setStatus(save ? 'WAV 已保存到资产库与画布。' : '试听已就绪，请播放下方音频；尚未保存。')
    } catch (error) {
      if (!controller.signal.aborted) setStatus(audioProcessingErrorMessage(error))
    } finally {
      if (operation.current === controller) { operation.current = undefined; setBusy(false) }
    }
  }
  return <>
    <AudioResultInfo asset={asset} duration={duration} entry={data.audioVersions?.find(entry => entry.version.id === data.node.activeVersionId)} />
    <section className="audio-processing nodrag nowheel" aria-label="音频截取与变速">
      <div className="audio-processing__waveform" role="img" aria-label="真实音频波形">
        {waveform.map((level, index) => <span key={index} style={{ height: `${Math.max(1, level * 100)}%` }} />)}
      </div>
      <fieldset disabled={busy}>
        <legend>本地音频处理（不扣费）</legend>
        <label>入点<input aria-label="音频入点" type="range" min="0" max={Math.max(0, endSeconds - 0.01)} step="0.01" value={startSeconds} onChange={event => update({ trimStartSeconds: Number(event.target.value) })} /></label>
        <label>出点<input aria-label="音频出点" type="range" min={Math.min(duration, startSeconds + 0.01)} max={duration} step="0.01" value={endSeconds} onChange={event => update({ trimEndSeconds: Number(event.target.value) })} /></label>
        <label>变速<input aria-label="音频变速" type="range" min="0.5" max="2" step="0.1" value={playbackRate} onChange={event => update({ playbackRate: Number(event.target.value) })} /></label>
        <label>淡入（秒）<input aria-label="音频淡入" type="range" min="0" max={outputDuration} step="0.01" value={Math.min(details.fadeInSeconds ?? 0, outputDuration)} onChange={event => update({ fadeInSeconds: Number(event.target.value) })} /></label>
        <label>淡出（秒）<input aria-label="音频淡出" type="range" min="0" max={outputDuration} step="0.01" value={Math.min(details.fadeOutSeconds ?? 0, outputDuration)} onChange={event => update({ fadeOutSeconds: Number(event.target.value) })} /></label>
        <label><input aria-label="音量归一化" type="checkbox" checked={details.normalize ?? false} onChange={event => update({ normalize: event.target.checked })} />音量归一化（峰值 -1 dBFS）</label>
      </fieldset>
      <p>{startSeconds.toFixed(2)}–{endSeconds.toFixed(2)} 秒 · {playbackRate.toFixed(1)}x · 输出 {outputDuration.toFixed(2)} 秒</p>
      <small>淡入 {(details.fadeInSeconds ?? 0).toFixed(2)}s / 淡出 {(details.fadeOutSeconds ?? 0).toFixed(2)}s，重叠时等比缩短；变速同时改变音高。</small>
      <div className="audio-processing__actions">
        <button type="button" disabled={busy || !duration} onClick={() => void run(false)}>试听选区</button>
        <button type="button" disabled={busy || !duration} onClick={() => void run(true)}>截取并导出 WAV</button>
        {busy ? <button type="button" onClick={() => { operation.current?.abort(); operation.current = undefined; setBusy(false); setStatus('已请求取消，未保存的处理结果将丢弃。') }}>取消音频处理</button> : null}
        <a href={asset.url} download={`${data.node.title}.${audioFileExtension(asset.mimeType)}`}>下载音频</a>
      </div>
      {previewUrl ? <audio ref={previewAudio} src={previewUrl} controls aria-label="本地处理试听" onError={() => setStatus('处理结果无法播放，请重新导出 WAV。')} /> : null}
      {status ? <p role="status">{status}</p> : null}
    </section>
    <AudioVersionHistory data={data} />
  </>
}
