import type { TimelineClip } from './timeline-types'

export function clipDuration(clip: TimelineClip): number {
  const playbackRate = clip.playbackRate ?? 1
  return Math.max(0, clip.sourceOutSeconds - clip.sourceInSeconds) / playbackRate
}
