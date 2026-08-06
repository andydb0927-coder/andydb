import { useEffect, useMemo, useRef } from 'react'

import type {
  CanvasNode,
  DependencyEdge,
  GenerationJob,
  TimelineItem,
} from '../project/model'

const kindCopy = {
  character: '角色',
  scene: '场景',
  storyboard: '分镜',
  video: '视频',
  preview: '预览',
} as const

const jobCopy = {
  queued: '排队中',
  running: '生成中',
  succeeded: '已完成',
  failed: '生成失败',
  cancelled: '已取消',
} as const

function dependencyDepths(nodes: CanvasNode[], edges: DependencyEdge[]) {
  const depth = new Map(nodes.map((node) => [node.id, 0]))
  for (let iteration = 0; iteration < nodes.length; iteration += 1) {
    let changed = false
    for (const edge of edges) {
      const candidate = (depth.get(edge.sourceNodeId) ?? 0) + 1
      if (candidate > (depth.get(edge.targetNodeId) ?? 0)) {
        depth.set(edge.targetNodeId, candidate)
        changed = true
      }
    }
    if (!changed) break
  }
  return depth
}

export function sortNodesForList(
  nodes: CanvasNode[],
  edges: DependencyEdge[],
  timeline: TimelineItem[],
) {
  const depth = dependencyDepths(nodes, edges)
  const timelineOrder = new Map(
    timeline.map((item) => [item.nodeId, item.order]),
  )
  const createdAt = (node: CanvasNode) => node.versions[0]?.createdAt ?? ''

  return [...nodes].sort(
    (a, b) =>
      (depth.get(a.id) ?? 0) - (depth.get(b.id) ?? 0) ||
      (timelineOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
        (timelineOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER) ||
      createdAt(a).localeCompare(createdAt(b)),
  )
}

interface NodeListViewProps {
  nodes: CanvasNode[]
  edges: DependencyEdge[]
  timeline: TimelineItem[]
  jobs: GenerationJob[]
  selectedNodeId?: string
  onSelect(nodeId: string): void
  onClose(): void
}

export function NodeListView({
  nodes,
  edges,
  timeline,
  jobs,
  selectedNodeId,
  onSelect,
  onClose,
}: NodeListViewProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const orderedNodes = useMemo(
    () => sortNodesForList(nodes, edges, timeline),
    [nodes, edges, timeline],
  )

  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="canvas-dialog-backdrop canvas-dialog-backdrop--list">
      <section
        className="node-list-view"
        role="dialog"
        aria-modal="true"
        aria-labelledby="node-list-heading"
      >
        <div className="node-list-view__heading">
          <h2 id="node-list-heading" ref={headingRef} tabIndex={-1}>节点列表</h2>
          <button type="button" onClick={onClose}>关闭</button>
        </div>
        <ul>
          {orderedNodes.map((node) => {
            const job = jobs.find((candidate) => candidate.nodeId === node.id)
            const status = node.sourceChanged
              ? '上游来源已变更'
              : job
                ? jobCopy[job.status]
                : '就绪'
            return (
              <li key={node.id}>
                <button
                  type="button"
                  aria-pressed={selectedNodeId === node.id}
                  onClick={() => onSelect(node.id)}
                >
                  <strong>{node.title}</strong>
                  <span>{kindCopy[node.kind]}</span>
                  <span>{status}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
