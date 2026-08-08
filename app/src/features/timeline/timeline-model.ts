import type { Asset, CanvasNode, Project, TimelineItem } from '../project/model'

export interface ResolvedTimelineItem {
  item: TimelineItem
  node?: CanvasNode
  asset?: Asset
  missing: boolean
  startSeconds: number
  endSeconds: number
  aspectRatio?: string
}

export function reorderTimeline(
  items: TimelineItem[],
  fromIndex: number,
  toIndex: number,
): TimelineItem[] {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= items.length ||
    toIndex >= items.length
  ) {
    return items
  }

  const reordered = [...items]
  const [moved] = reordered.splice(fromIndex, 1)
  reordered.splice(toIndex, 0, moved)
  return reordered.map((item, order) => ({ ...item, order }))
}

export function getTimelineDuration(items: TimelineItem[]): number {
  return items
    .filter((item) => item.track === 'video')
    .reduce((total, item) => total + item.durationSeconds, 0)
}

function describeAspectRatio(asset?: Asset) {
  if (!asset?.width || !asset.height) return undefined
  const ratio = asset.width / asset.height
  if (Math.abs(ratio - 16 / 9) < 0.02) return '16:9'
  if (Math.abs(ratio - 9 / 16) < 0.02) return '9:16'
  return `${asset.width}:${asset.height}`
}

export function resolveTimeline(
  project: Pick<Project, 'nodes' | 'assets' | 'timeline'>,
): ResolvedTimelineItem[] {
  let cursor = 0
  return project.timeline
    .filter((item) => item.track === 'video')
    .sort((left, right) => left.order - right.order)
    .map((item) => {
      const node = project.nodes.find((candidate) => candidate.id === item.nodeId)
      const version = node?.versions.find(
        (candidate) => candidate.id === node.activeVersionId,
      )
      const asset = project.assets.find(
        (candidate) => candidate.id === version?.assetId,
      )
      const startSeconds = cursor
      cursor += item.durationSeconds
      return {
        item,
        node,
        asset,
        missing: !node || !asset,
        startSeconds,
        endSeconds: cursor,
        aspectRatio: describeAspectRatio(asset),
      }
    })
}
