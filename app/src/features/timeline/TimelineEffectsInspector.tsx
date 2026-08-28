import { useState } from 'react'
import { clipDuration } from './timeline-math'
import { editSubtitle, setAudioEnvelope, setClipPlacement, setTransition } from './timeline-editing'
import { normalizeSubtitleStyle } from './timeline-composition'
import type { TimelineClip, TimelineProject, TimelineSubtitleStyle, TimelineTransition } from './timeline-types'

export function TimelineEffectsInspector({ timeline, clip, onChange }: { timeline: TimelineProject; clip: TimelineClip; onChange(next: TimelineProject): void }) {
  const [keyTime, setKeyTime] = useState(0)
  const [keyVolume, setKeyVolume] = useState(1)
  const track = timeline.tracks.find(t => t.id === clip.trackId)!
  const index = track.clips.findIndex(c => c.id === clip.id)
  const previous = track.clips[index - 1]
  const duration = clipDuration(clip)
  const style = normalizeSubtitleStyle(clip.subtitleStyle)
  const subtitle = (patch: Partial<{ text: string; startSeconds: number; endSeconds: number; style: Partial<TimelineSubtitleStyle> }>) => onChange(editSubtitle(timeline, clip.id, { text: clip.text ?? '', startSeconds: clip.startSeconds, endSeconds: clip.startSeconds + duration, ...patch }))
  return (
    <fieldset className="timeline-effects">
      <legend>{clip.kind === 'audio' ? '音轨与音量包络' : clip.kind === 'subtitle' ? '字幕时间与样式' : '片段转场'}</legend>
      {(clip.kind === 'image' || clip.kind === 'video') && <>
        <label>入场转场<select value={clip.transitionIn?.kind ?? 'none'} disabled={!previous} aria-describedby={!previous ? `transition-reason-${clip.id}` : undefined} onChange={e => onChange(setTransition(timeline, clip.id, e.target.value === 'none' ? undefined : { kind: e.target.value as TimelineTransition['kind'], durationSeconds: clip.transitionIn?.durationSeconds ?? 1 }))}>
          <option value="none">无转场</option><option value="fade">淡入淡出</option><option value="dissolve">交叉溶解</option><option value="black">黑场</option>
        </select></label>
        {!previous ? <p id={`transition-reason-${clip.id}`}>首个片段无前置镜头，无法添加片段间转场。</p> : null}
        {clip.transitionIn && <label>转场时长（秒）<input type="number" min={1 / 24} max={Math.min(duration, previous ? clipDuration(previous) : duration)} step={0.1} value={clip.transitionIn.durationSeconds} onChange={e => onChange(setTransition(timeline, clip.id, { ...clip.transitionIn!, durationSeconds: Number(e.target.value) }))} /></label>}
        <small>转场不改变总时长；交叉溶解从前镜头末帧过渡。</small>
      </>}
      {clip.kind === 'subtitle' && <>
        <label>编辑字幕文本<textarea value={clip.text ?? ''} onChange={e => subtitle({ text: e.target.value })} /></label>
        <label>字幕开始（秒）<input type="number" min={0} step={0.1} value={clip.startSeconds} onChange={e => subtitle({ startSeconds: Number(e.target.value) })} /></label>
        <label>字幕结束（秒）<input type="number" min={clip.startSeconds + 1 / 24} step={0.1} value={clip.startSeconds + duration} onChange={e => subtitle({ endSeconds: Number(e.target.value) })} /></label>
        <label>字幕字号<input type="number" min={16} max={160} value={style.fontSize} onChange={e => subtitle({ style: { fontSize: Number(e.target.value) } })} /></label>
        <label>字幕颜色<input type="color" value={style.color} onChange={e => subtitle({ style: { color: e.target.value } })} /></label>
        <label>字幕背景<select value={style.background} onChange={e => subtitle({ style: { background: e.target.value } })}><option value="transparent">透明</option><option value="#000000">黑色</option><option value="#ffffff">白色</option></select></label>
        <label>字幕位置<select value={style.position} onChange={e => subtitle({ style: { position: e.target.value as TimelineSubtitleStyle['position'] } })}><option value="bottom">底部</option><option value="center">中部</option><option value="top">顶部</option></select></label>
        <label><input type="checkbox" checked={style.bold} onChange={e => subtitle({ style: { bold: e.target.checked } })} />字幕粗体</label>
      </>}
      {clip.kind === 'audio' && <>
        <label>所在音频轨<select value={clip.trackId} onChange={e => onChange(setClipPlacement(timeline, clip.id, e.target.value, clip.startSeconds))}>{timeline.tracks.filter(t => t.kind === 'audio').map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <label>音频开始（秒）<input type="number" min={0} step={0.1} value={clip.startSeconds} onChange={e => onChange(setClipPlacement(timeline, clip.id, clip.trackId, Number(e.target.value)))} /></label>
        <label>关键帧时间（秒）<input type="number" min={0} max={duration} step={0.1} value={keyTime} onChange={e => setKeyTime(Number(e.target.value))} /></label>
        <label>关键帧音量<input type="range" min={0} max={1} step={0.05} value={keyVolume} onChange={e => setKeyVolume(Number(e.target.value))} /></label>
        <output>{Math.round(keyVolume * 100)}%</output>
        <button type="button" disabled={!Number.isFinite(keyTime) || keyTime < 0 || keyTime > duration} onClick={() => onChange(setAudioEnvelope(timeline, clip.id, [...(clip.volumeKeyframes ?? []), { timeSeconds: keyTime, value: keyVolume }]))}>添加音量关键帧</button>
        <p>时间为片段局部秒；关键帧间线性过渡，无关键帧时音量100%。</p>
        <ul aria-label="音量关键帧">{(clip.volumeKeyframes ?? []).map(p => <li key={p.timeSeconds}>{p.timeSeconds.toFixed(2)}s · {Math.round(p.value * 100)}% <button type="button" aria-label={`删除 ${p.timeSeconds} 秒音量关键帧`} onClick={() => onChange(setAudioEnvelope(timeline, clip.id, clip.volumeKeyframes!.filter(k => k.timeSeconds !== p.timeSeconds)))}>删除</button></li>)}</ul>
      </>}
    </fieldset>
  )
}
