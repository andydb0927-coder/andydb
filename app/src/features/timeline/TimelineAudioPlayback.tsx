import { useEffect, useRef, useState } from 'react'
import type { ResolvedTimelineClip } from './timeline-types'

export function TimelineAudioPlayback({ item, currentTime, playing, volume }: { item: ResolvedTimelineClip; currentTime: number; playing: boolean; volume: number }) {
  const ref = useRef<HTMLAudioElement>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    const audio = ref.current
    if (!audio) return
    const time = item.clip.sourceInSeconds + (currentTime - item.startSeconds) * (item.clip.playbackRate ?? 1)
    if (!playing || Math.abs(audio.currentTime - time) > 0.25) audio.currentTime = time
    audio.playbackRate = item.clip.playbackRate ?? 1
    // Match AudioBufferSourceNode playback-rate behavior used by the exporter.
    audio.preservesPitch = false
    audio.volume = volume
  }, [item, currentTime, playing, volume])
  useEffect(() => {
    const audio = ref.current
    if (!audio) return
    let active = true
    if (playing) void audio.play().catch(() => { if (active) setError(true) })
    else audio.pause()
    return () => { active = false; audio.pause() }
  }, [playing])
  return <>
    <audio ref={ref} src={item.asset?.url} aria-label={`音轨播放 ${item.clip.name}`} preload="auto" data-playback-rate={item.clip.playbackRate ?? 1} data-volume={volume} onError={() => setError(true)} />
    {error && <p role="alert">音轨“{item.clip.name}”暂时无法播放，请检查媒体或再次点击播放。</p>}
  </>
}
