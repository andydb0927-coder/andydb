import { useEffect, useMemo, useRef } from 'react'

import type {
  CanvasNode,
  DependencyEdge,
  GenerationJob,
  TimelineItem,
} from '../project/model'
import { selectNodeGenerationJob } from './job-selector'
import type { CreativeNodeAction } from './node-types'
import { useDialogKeyboard } from './dialog-keyboard'

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
  const indegree = new Map(nodes.map((node) => [node.id, 0]))
  const outgoing = new Map(nodes.map((node) => [node.id, [] as string[]]))

  for (const edge of edges) {
    if (!indegree.has(edge.sourceNodeId) || !indegree.has(edge.targetNodeId)) {
      continue
    }
    outgoing.get(edge.sourceNodeId)!.push(edge.targetNodeId)
    indegree.set(edge.targetNodeId, indegree.get(edge.targetNodeId)! + 1)
  }

  const queue = nodes
    .filter((node) => indegree.get(node.id) === 0)
    .map((node) => node.id)

  for (let index = 0; index < queue.length; index += 1) {
    const sourceNodeId = queue[index]
    for (const targetNodeId of outgoing.get(sourceNodeId) ?? []) {
      depth.set(
        targetNodeId,
        Math.max(
          depth.get(targetNodeId) ?? 0,
          (depth.get(sourceNodeId) ?? 0) + 1,
        ),
      )
      const remaining = indegree.get(targetNodeId)! - 1
      indegree.set(targetNodeId, remaining)
      if (remaining === 0) queue.push(targetNodeId)
    }
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
  onAction(nodeId: string, action: CreativeNodeAction): void
  onClose(): void
}

export function NodeListView({
  nodes,
  edges,
  timeline,
  jobs,
  selectedNodeId,
  onSelect,
  onAction,
  onClose,
}: NodeListViewProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const orderedNodes = useMemo(
    () => sortNodesForList(nodes, edges, timeline),
    [nodes, edges, timeline],
  )

  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  useDialogKeyboard(dialogRef, onClose)

  return (
    <div className="canvas-dialog-backdrop canvas-dialog-backdrop--list">
      <section
        ref={dialogRef}
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
            const job = selectNodeGenerationJob(node, jobs)
            const status = node.sourceChanged
              ? '上游来源已变更'
              : job
                ? jobCopy[job.status]
                : '就绪'
            const isOnTimeline = timeline.some(
              (item) => item.track === 'video' && item.nodeId === node.id,
            )
            return (
              <li key={node.id}>
                <button
                  type="button"
                  aria-label={`选择 ${node.title}`}
                  aria-pressed={selectedNodeId === node.id}
                  onClick={() => onSelect(node.id)}
                >
                  <strong>{node.title}</strong>
                  <span>{kindCopy[node.kind]}</span>
                  <span>{status}</span>
                </button>
                <div className="node-list-view__actions">
                  <button
                    type="button"
                    aria-label={`重生成 ${node.title}`}
                    onClick={() => onAction(node.id, 'regenerate')}
                  >
                    重生成
                  </button>
                  {node.kind === 'video' ? (
                    <button
                      type="button"
                      aria-label={`加入时间线 ${node.title}`}
                      disabled={isOnTimeline}
                      onClick={() => onAction(node.id, 'add-to-timeline')}
                    >
                      {isOnTimeline ? '已加入时间线' : '加入时间线'}
                    </button>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
