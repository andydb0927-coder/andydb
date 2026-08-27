import type { Project } from '../project/model'
import type { LibraryAssetRecord } from '../assets/library-model'
import type { TimelineProject, TimelineSourceCandidate, ResolvedTimelineClip } from './timeline-types'
import { canvasTimelineCandidate, libraryTimelineCandidate } from './timeline-sources'

export function allClips(timeline: TimelineProject) {
  return timeline.tracks.flatMap((track) => track.clips)
}

export function candidateSources(
  project: Project,
  library: LibraryAssetRecord[],
): TimelineSourceCandidate[] {
  const candidates = [
    ...project.nodes.flatMap((node) => {
      const candidate = canvasTimelineCandidate(project, node.id)
      return candidate ? [candidate] : []
    }),
    ...library.map(libraryTimelineCandidate),
  ]
  return [...new Map(candidates.map((candidate) => [candidate.id, candidate])).values()]
}

export function activeAt(
  visual: ResolvedTimelineClip[],
  selectedClipId: string | undefined,
  currentTime: number,
) {
  return (
    visual.find(({ clip }) => clip.id === selectedClipId) ??
    visual.find(
      (item, index) =>
        currentTime >= item.startSeconds &&
        (currentTime < item.endSeconds ||
          (index === visual.length - 1 && currentTime === item.endSeconds)),
    ) ??
    visual[0]
  )
}
