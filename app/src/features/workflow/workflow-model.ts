import type { GenerationRequest } from '../generation/generation-adapter'
import type { CanvasNode, Project } from '../project/model'

export type WorkflowStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'

export type WorkflowExecutionMode = 'serial' | 'parallel'

export interface WorkflowLogEntry {
  id: string
  timestamp: string
  level: 'info' | 'error'
  message: string
  nodeRunId?: string
}

export interface WorkflowNodeRun {
  id: string
  nodeId: string
  nodeTitle: string
  order: number
  status: WorkflowStatus
  progress: number
  attempt: number
  request: GenerationRequest
  startedAt?: string
  finishedAt?: string
  error?: string
}

export interface WorkflowRun {
  id: string
  projectId: string
  mode: WorkflowExecutionMode
  status: WorkflowStatus
  nodes: WorkflowNodeRun[]
  logs: WorkflowLogEntry[]
  createdAt: string
  updatedAt: string
  startedAt?: string
  finishedAt?: string
}

interface WorkflowModelDependencies {
  now(): string
  randomId(): string
}

const defaultDependencies: WorkflowModelDependencies = {
  now: () => new Date().toISOString(),
  randomId: () => crypto.randomUUID(),
}

const executableKinds = new Set<CanvasNode['kind']>([
  'image',
  'storyboard',
  'video',
])

function compareCanvasNodes(left: CanvasNode, right: CanvasNode) {
  return (
    left.position.x - right.position.x ||
    left.position.y - right.position.y ||
    left.title.localeCompare(right.title) ||
    left.id.localeCompare(right.id)
  )
}

export function isWorkflowExecutableNode(node: CanvasNode) {
  return executableKinds.has(node.kind)
}

export function executableWorkflowNodes(
  project: Project,
  selectedNodeIds: Iterable<string>,
) {
  const selected = new Set(selectedNodeIds)
  const candidates = project.nodes.filter(
    (node) => selected.has(node.id) && isWorkflowExecutableNode(node),
  )
  const byId = new Map(candidates.map((node) => [node.id, node]))
  const indegree = new Map(candidates.map((node) => [node.id, 0]))
  const outgoing = new Map<string, string[]>()

  for (const edge of project.edges) {
    if (!byId.has(edge.sourceNodeId) || !byId.has(edge.targetNodeId)) continue
    indegree.set(edge.targetNodeId, (indegree.get(edge.targetNodeId) ?? 0) + 1)
    const targets = outgoing.get(edge.sourceNodeId) ?? []
    targets.push(edge.targetNodeId)
    outgoing.set(edge.sourceNodeId, targets)
  }

  const ready = candidates
    .filter((node) => indegree.get(node.id) === 0)
    .sort(compareCanvasNodes)
  const ordered: CanvasNode[] = []

  while (ready.length > 0) {
    const current = ready.shift()!
    ordered.push(current)
    for (const targetId of outgoing.get(current.id) ?? []) {
      const nextIndegree = (indegree.get(targetId) ?? 1) - 1
      indegree.set(targetId, nextIndegree)
      if (nextIndegree !== 0) continue
      ready.push(byId.get(targetId)!)
      ready.sort(compareCanvasNodes)
    }
  }

  if (ordered.length !== candidates.length) {
    const orderedIds = new Set(ordered.map(({ id }) => id))
    ordered.push(
      ...candidates.filter(({ id }) => !orderedIds.has(id)).sort(compareCanvasNodes),
    )
  }

  return ordered
}

function requestForNode(project: Project, node: CanvasNode): GenerationRequest {
  const activeVersion = node.versions.find(
    (version) => version.id === node.activeVersionId,
  )
  const asset = project.assets.find(
    (candidate) => candidate.id === activeVersion?.assetId,
  )

  return {
    projectId: project.id,
    nodeId: node.id,
    operation: 'regenerate',
    targetKind: node.kind === 'video' ? 'video' : 'image',
    prompt: activeVersion?.prompt ?? project.intent,
    referenceAssets: asset
      ? [
          {
            url: asset.url,
            kind: asset.kind,
            mimeType: asset.mimeType,
          },
        ]
      : [],
  }
}

export function buildWorkflowRun(
  project: Project,
  selectedNodeIds: Iterable<string>,
  mode: WorkflowExecutionMode,
  dependencies: WorkflowModelDependencies = defaultDependencies,
): WorkflowRun {
  const nodes = executableWorkflowNodes(project, selectedNodeIds)
  if (nodes.length === 0) {
    throw new Error('Select at least one executable workflow node')
  }

  const timestamp = dependencies.now()
  const runId = dependencies.randomId()
  return {
    id: runId,
    projectId: project.id,
    mode,
    status: 'pending',
    createdAt: timestamp,
    updatedAt: timestamp,
    logs: [
      {
        id: `${runId}:created`,
        timestamp,
        level: 'info',
        message: `已创建${mode === 'serial' ? '串行' : '并行'}运行，共 ${nodes.length} 个节点`,
      },
    ],
    nodes: nodes.map((node, order) => ({
      id: dependencies.randomId(),
      nodeId: node.id,
      nodeTitle: node.title,
      order,
      status: 'pending',
      progress: 0,
      attempt: 1,
      request: requestForNode(project, node),
    })),
  }
}

export function workflowProgress(run: WorkflowRun) {
  if (run.nodes.length === 0) return 0
  return Math.round(
    run.nodes.reduce((total, node) => total + node.progress, 0) /
      run.nodes.length,
  )
}

export function normalizeInterruptedRun(
  run: WorkflowRun,
  now: () => string = defaultDependencies.now,
): WorkflowRun {
  if (run.status !== 'pending' && run.status !== 'running') return run
  const timestamp = now()
  const nodes = run.nodes.map((node) =>
    node.status === 'running' || node.status === 'pending'
      ? {
          ...node,
          status: 'pending' as const,
          progress: 0,
          startedAt: undefined,
          finishedAt: undefined,
          error: undefined,
        }
      : node,
  )

  return {
    ...run,
    status: 'pending',
    nodes,
    updatedAt: timestamp,
    startedAt: undefined,
    finishedAt: undefined,
    logs: [
      ...run.logs,
      {
        id: `${run.id}:resume:${timestamp}`,
        timestamp,
        level: 'info',
        message: '已恢复中断运行，将跳过已成功节点',
      },
    ],
  }
}
