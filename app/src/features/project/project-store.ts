import { create } from 'zustand'

import {
  appendNodeVersion,
  type CanvasNode,
  type DependencyEdge,
  type GenerationJob,
  type NodeVersion,
  type Project,
  type TimelineItem,
} from './model'
import { ProjectRepository } from './project-repository'
import type { GenerationResult } from '../generation/generation-adapter'

export type PersistenceStatus = 'saved' | 'saving' | 'failed' | 'offline'

type SaveRepository = Pick<ProjectRepository, 'save'>
type LoadRepository = Pick<ProjectRepository, 'load'>
type NodeUpdates = Partial<
  Pick<CanvasNode, 'kind' | 'title' | 'position' | 'sourceChanged'>
>

interface ProjectStore {
  projectsById: Record<string, Project>
  activeProjectId?: string
  activeProject?: Project
  saveStatus: PersistenceStatus
  past: Project[]
  future: Project[]
  addNode: (node: CanvasNode) => void
  updateNode: (nodeId: string, changes: NodeUpdates) => void
  updateNodePositions: (
    positions: Array<{ nodeId: string; position: CanvasNode['position'] }>,
  ) => void
  deleteNode: (nodeId: string) => void
  connectNodes: (edge: DependencyEdge) => void
  appendVersion: (
    nodeId: string,
    version: Omit<NodeVersion, 'id' | 'createdAt'>,
  ) => void
  updateGenerationJob: (projectId: string, job: GenerationJob) => void
  applyGenerationSuccess: (
    projectId: string,
    job: GenerationJob,
    result: GenerationResult,
  ) => void
  addToTimeline: (item: TimelineItem) => void
  reorderTimeline: (orderedItemIds: string[]) => void
  undo: () => void
  redo: () => void
  persistActive: (repository?: SaveRepository) => Promise<void>
  hydrate: (
    projectId: string,
    repository?: LoadRepository,
    signal?: AbortSignal,
  ) => Promise<boolean>
}

const defaultRepository = new ProjectRepository()

function withUpdatedTimestamp(project: Project): Project {
  return { ...project, updatedAt: new Date().toISOString() }
}

function findDownstream(project: Project, nodeId: string) {
  const nodeIds = new Set<string>()
  const edgeIds = new Set<string>()
  const queue = [nodeId]

  while (queue.length > 0) {
    const sourceId = queue.shift()!
    for (const edge of project.edges) {
      if (edge.sourceNodeId !== sourceId) continue
      edgeIds.add(edge.id)
      if (nodeIds.has(edge.targetNodeId)) continue
      nodeIds.add(edge.targetNodeId)
      queue.push(edge.targetNodeId)
    }
  }

  nodeIds.delete(nodeId)
  return { nodeIds, edgeIds }
}

function hasDependencyPath(
  edges: DependencyEdge[],
  sourceNodeId: string,
  targetNodeId: string,
) {
  const outgoing = new Map<string, string[]>()
  for (const edge of edges) {
    const targets = outgoing.get(edge.sourceNodeId)
    if (targets) targets.push(edge.targetNodeId)
    else outgoing.set(edge.sourceNodeId, [edge.targetNodeId])
  }

  const visited = new Set([sourceNodeId])
  const queue = [sourceNodeId]

  for (let index = 0; index < queue.length; index += 1) {
    const currentNodeId = queue[index]
    if (currentNodeId === targetNodeId) return true

    for (const nextNodeId of outgoing.get(currentNodeId) ?? []) {
      if (visited.has(nextNodeId)) continue
      visited.add(nextNodeId)
      queue.push(nextNodeId)
    }
  }

  return false
}

function replaceGenerationJob(jobs: GenerationJob[], job: GenerationJob) {
  return jobs.some((candidate) => candidate.id === job.id)
    ? jobs.map((candidate) => (candidate.id === job.id ? job : candidate))
    : [...jobs, job]
}

function isTransientGenerationJob(job: GenerationJob) {
  return job.status === 'queued' || job.status === 'running'
}

function sanitizeGenerationBaseline(baseline: Project, current: Project) {
  const currentJobs = new Map(current.jobs.map((job) => [job.id, job]))
  const removedJobIds = new Set<string>()
  const jobs = baseline.jobs.flatMap((job) => {
    if (!isTransientGenerationJob(job)) return [job]
    const latest = currentJobs.get(job.id)
    if (latest) return [latest]
    removedJobIds.add(job.id)
    return []
  })
  if (
    removedJobIds.size === 0 &&
    jobs.every((job, index) => job === baseline.jobs[index])
  ) {
    return baseline
  }
  return {
    ...baseline,
    jobs,
    nodes: baseline.nodes.map((node) => ({
      ...node,
      versions: node.versions.map((version) =>
        version.generationJobId && removedJobIds.has(version.generationJobId)
          ? { ...version, generationJobId: undefined }
          : version,
      ),
    })),
  }
}

function nextNumber(nodes: CanvasNode[], kind: 'storyboard' | 'video') {
  const label = kind === 'storyboard' ? '分镜' : '视频'
  return (
    nodes.reduce((highest, node) => {
      if (node.kind !== kind) return highest
      const match = node.title.match(new RegExp(`^${label}\\s*(\\d+)$`))
      return Math.max(highest, match ? Number(match[1]) : 0)
    }, 0) + 1
  )
}

function nextVideoNumber(nodes: CanvasNode[], source: CanvasNode) {
  const used = new Set(
    nodes.flatMap((node) => {
      if (node.kind !== 'video') return []
      const match = node.title.match(/^视频\s*(\d+)$/)
      return match ? [Number(match[1])] : []
    }),
  )
  const sourceMatch = source.title.match(/(\d+)$/)
  let candidate = sourceMatch ? Number(sourceMatch[1]) : 1
  while (used.has(candidate)) candidate += 1
  return candidate
}

export const useProjectStore = create<ProjectStore>((set, get) => {
  let persistenceRequestId = 0
  let hydrationRequestId = 0
  const generationBaselines = new Map<string, Project>()

  const commit = (mutate: (project: Project) => Project) => {
    const current = get().activeProject
    if (!current) return

    const next = mutate(current)
    if (next === current) return

    set((state) => ({
      projectsById: { ...state.projectsById, [next.id]: next },
      activeProject: next,
      past: [...state.past, current],
      future: [],
    }))
  }

  return {
    projectsById: {},
    activeProjectId: undefined,
    activeProject: undefined,
    saveStatus: 'saved',
    past: [],
    future: [],

    addNode: (node) => {
      commit((project) =>
        withUpdatedTimestamp({ ...project, nodes: [...project.nodes, node] }),
      )
    },

    updateNode: (nodeId, changes) => {
      commit((project) => {
        if (!project.nodes.some((node) => node.id === nodeId)) return project

        return withUpdatedTimestamp({
          ...project,
          nodes: project.nodes.map((node) =>
            node.id === nodeId
              ? {
                  ...node,
                  ...(changes.kind === undefined
                    ? {}
                    : { kind: changes.kind }),
                  ...(changes.title === undefined
                    ? {}
                    : { title: changes.title }),
                  ...(changes.position === undefined
                    ? {}
                    : { position: changes.position }),
                  ...(changes.sourceChanged === undefined
                    ? {}
                    : { sourceChanged: changes.sourceChanged }),
                }
              : node,
          ),
        })
      })
    },

    updateNodePositions: (positions) => {
      commit((project) => {
        const positionsById = new Map(
          positions.map(({ nodeId, position }) => [nodeId, position]),
        )
        const changed = project.nodes.some((node) => {
          const position = positionsById.get(node.id)
          return (
            position !== undefined &&
            (position.x !== node.position.x || position.y !== node.position.y)
          )
        })
        if (!changed) return project

        return withUpdatedTimestamp({
          ...project,
          nodes: project.nodes.map((node) => {
            const position = positionsById.get(node.id)
            return position ? { ...node, position } : node
          }),
        })
      })
    },

    deleteNode: (nodeId) => {
      commit((project) => {
        if (!project.nodes.some((node) => node.id === nodeId)) return project
        const downstream = findDownstream(project, nodeId)

        return withUpdatedTimestamp({
          ...project,
          nodes: project.nodes
            .filter((node) => node.id !== nodeId)
            .map((node) =>
              downstream.nodeIds.has(node.id)
                ? { ...node, sourceChanged: true }
                : node,
            ),
          edges: project.edges.filter(
            (edge) =>
              edge.sourceNodeId !== nodeId && edge.targetNodeId !== nodeId,
          ),
          timeline: project.timeline.filter((item) => item.nodeId !== nodeId),
          jobs: project.jobs.filter((job) => job.nodeId !== nodeId),
        })
      })
    },

    connectNodes: (edge) => {
      commit((project) => {
        const nodeIds = new Set(project.nodes.map((node) => node.id))
        const duplicatesExistingEdge = project.edges.some(
          (existingEdge) =>
            existingEdge.id === edge.id ||
            (existingEdge.sourceNodeId === edge.sourceNodeId &&
              existingEdge.targetNodeId === edge.targetNodeId),
        )
        const wouldCreateCycle = hasDependencyPath(
          project.edges,
          edge.targetNodeId,
          edge.sourceNodeId,
        )

        if (
          !nodeIds.has(edge.sourceNodeId) ||
          !nodeIds.has(edge.targetNodeId) ||
          edge.sourceNodeId === edge.targetNodeId ||
          duplicatesExistingEdge ||
          wouldCreateCycle
        ) {
          return project
        }

        return withUpdatedTimestamp({
          ...project,
          edges: [...project.edges, { ...edge, sourceChanged: false }],
        })
      })
    },

    appendVersion: (nodeId, version) => {
      commit((project) => {
        const versioned = appendNodeVersion(project, nodeId, version)
        if (versioned === project) return project
        const downstream = findDownstream(versioned, nodeId)

        return {
          ...versioned,
          nodes: versioned.nodes.map((node) =>
            node.id === nodeId
              ? { ...node, sourceChanged: false }
              : downstream.nodeIds.has(node.id)
              ? { ...node, sourceChanged: true }
              : node,
          ),
          edges: versioned.edges.map((edge) =>
            edge.targetNodeId === nodeId
              ? { ...edge, sourceChanged: false }
              : downstream.edgeIds.has(edge.id)
              ? { ...edge, sourceChanged: true }
              : edge,
          ),
        }
      })
    },

    updateGenerationJob: (projectId, job) => {
      if (job.status === 'succeeded') return
      if (job.projectId !== undefined && job.projectId !== projectId) return
      const project = get().projectsById[projectId]
      if (!project) return
      const existingJob = project.jobs.find(
        (candidate) => candidate.id === job.id,
      )
      if (
        existingJob?.attempt !== undefined &&
        job.attempt !== undefined &&
        existingJob.attempt > job.attempt
      ) {
        return
      }

      const baselineKey = `${projectId}:${job.id}`
      const terminal = job.status === 'failed' || job.status === 'cancelled'
      if (!terminal && !generationBaselines.has(baselineKey)) {
        generationBaselines.set(baselineKey, project)
      }
      const source = project.nodes.find((node) => node.id === job.nodeId)
      const activeVersion = source?.versions.find(
        (version) => version.id === source.activeVersionId,
      )
      const referencedJob = project.jobs.find(
        (candidate) => candidate.id === activeVersion?.generationJobId,
      )
      const shouldRelink =
        !referencedJob ||
        referencedJob.id === job.id ||
        (job.sequence ?? 0) > (referencedJob.sequence ?? 0)
      const next = {
        ...project,
        updatedAt: job.updatedAt,
        jobs: replaceGenerationJob(project.jobs, job),
        nodes: project.nodes.map((node) =>
          node.id === job.nodeId
            ? {
                ...node,
                versions: node.versions.map((version) =>
                  shouldRelink && version.id === node.activeVersionId
                    ? { ...version, generationJobId: job.id }
                    : version,
                ),
              }
            : node,
        ),
      }
      set((state) => ({
        projectsById: { ...state.projectsById, [projectId]: next },
        ...(state.activeProjectId === projectId ? { activeProject: next } : {}),
      }))
      if (terminal) generationBaselines.delete(baselineKey)
    },

    applyGenerationSuccess: (projectId, job, result) => {
      const project = get().projectsById[projectId]
      if (!project || job.projectId !== projectId) {
        throw new Error('Generation project mismatch')
      }
      const source = project.nodes.find((node) => node.id === job.nodeId)
      const storedJob = project.jobs.find((candidate) => candidate.id === job.id)
      const activeVersion = source?.versions.find(
        (version) => version.id === source.activeVersionId,
      )
      if (
        !source ||
        !job.operation ||
        storedJob?.status !== 'running' ||
        storedJob.attempt !== job.attempt ||
        storedJob.nodeId !== job.nodeId ||
        storedJob.operation !== job.operation ||
        storedJob.projectId !== job.projectId ||
        storedJob.sequence !== job.sequence
      ) {
        throw new Error('Generation source or attempt mismatch')
      }
      if (activeVersion?.generationJobId !== job.id) {
        throw new Error('Stale generation result')
      }
      if (project.assets.some((asset) => asset.id === result.asset.id)) {
        throw new Error('Generation asset ID collision')
      }
      if (
        project.nodes.some((node) =>
          node.versions.some((version) => version.id === result.version.id),
        )
      ) {
        throw new Error('Generation version ID collision')
      }
      if (
        result.version.assetId !== result.asset.id ||
        result.version.generationJobId !== job.id
      ) {
        throw new Error('Generation result reference mismatch')
      }

      const version: NodeVersion = result.version
      const assets = [...project.assets, result.asset]
      let next: Project

      if (job.operation === 'regenerate') {
        const nextProject = withUpdatedTimestamp({
          ...project,
          assets,
          jobs: replaceGenerationJob(project.jobs, job),
          nodes: project.nodes.map((node) =>
            node.id === source.id
              ? {
                  ...node,
                  versions: [...node.versions, version],
                  activeVersionId: version.id,
                  sourceChanged: false,
                }
              : node,
          ),
        })
        const downstream = findDownstream(nextProject, source.id)
        next = {
          ...nextProject,
          nodes: nextProject.nodes.map((node) =>
            downstream.nodeIds.has(node.id)
              ? { ...node, sourceChanged: true }
              : node,
          ),
          edges: nextProject.edges.map((edge) =>
            downstream.edgeIds.has(edge.id)
              ? { ...edge, sourceChanged: true }
              : edge,
          ),
        }
      } else {
        const kind =
          job.operation === 'extend-shot' ? 'storyboard' : 'video'
        const number =
          kind === 'video'
            ? nextVideoNumber(project.nodes, source)
            : nextNumber(project.nodes, kind)
        const paddedNumber = String(number).padStart(2, '0')
        const nodeId = `${kind}-${paddedNumber}-${crypto.randomUUID()}`
        const generatedNode: CanvasNode = {
          id: nodeId,
          kind,
          title: `${kind === 'storyboard' ? '分镜' : '视频'} ${paddedNumber}`,
          position: {
            x: source.position.x + 340,
            y: source.position.y + (kind === 'storyboard' ? 120 : 180),
          },
          versions: [version],
          activeVersionId: version.id,
          sourceChanged: false,
        }
        const completedJob: GenerationJob = { ...job, nodeId }
        next = withUpdatedTimestamp({
          ...project,
          assets,
          nodes: [...project.nodes, generatedNode],
          edges: [
            ...project.edges,
            {
              id: `edge-${source.id}-${nodeId}`,
              sourceNodeId: source.id,
              targetNodeId: nodeId,
              sourceChanged: false,
            },
          ],
          jobs: replaceGenerationJob(project.jobs, completedJob),
        })
      }

      const baselineKey = `${projectId}:${job.id}`
      const baseline = sanitizeGenerationBaseline(
        generationBaselines.get(baselineKey) ?? project,
        project,
      )
      generationBaselines.delete(baselineKey)
      set((state) => ({
        projectsById: { ...state.projectsById, [projectId]: next },
        ...(state.activeProjectId === projectId
          ? {
              activeProject: next,
              past: [...state.past, baseline],
              future: [],
            }
          : {}),
      }))
    },

    addToTimeline: (item) => {
      commit((project) => {
        const node = project.nodes.find(
          (candidate) => candidate.id === item.nodeId,
        )
        const activeVersion = node?.versions.find(
          (version) => version.id === node.activeVersionId,
        )
        const asset = project.assets.find(
          (candidate) => candidate.id === activeVersion?.assetId,
        )
        if (
          node?.kind !== 'video' ||
          !asset ||
          (asset.kind !== 'video' && asset.kind !== 'image') ||
          item.track !== 'video' ||
          project.timeline.some(
            (existing) =>
              existing.nodeId === item.nodeId && existing.track === item.track,
          )
        ) {
          return project
        }
        return withUpdatedTimestamp({
          ...project,
          timeline: [...project.timeline, item],
        })
      })
    },

    reorderTimeline: (orderedItemIds) => {
      commit((project) => {
        const itemsById = new Map(project.timeline.map((item) => [item.id, item]))
        const hasExactUniqueIds =
          orderedItemIds.length === project.timeline.length &&
          new Set(orderedItemIds).size === project.timeline.length &&
          orderedItemIds.every((id) => itemsById.has(id))
        if (!hasExactUniqueIds) return project

        const reordered = orderedItemIds.map((id, order) => ({
          ...itemsById.get(id)!,
          order,
        }))

        return withUpdatedTimestamp({ ...project, timeline: reordered })
      })
    },

    undo: () => {
      const state = get()
      const previous = state.past.at(-1)
      const current = state.activeProject
      if (!previous || !current) return

      set({
        projectsById: { ...state.projectsById, [previous.id]: previous },
        activeProjectId: previous.id,
        activeProject: previous,
        past: state.past.slice(0, -1),
        future: [current, ...state.future],
      })
    },

    redo: () => {
      const state = get()
      const next = state.future[0]
      const current = state.activeProject
      if (!next || !current) return

      set({
        projectsById: { ...state.projectsById, [next.id]: next },
        activeProjectId: next.id,
        activeProject: next,
        past: [...state.past, current],
        future: state.future.slice(1),
      })
    },

    persistActive: async (repository = defaultRepository) => {
      const requestId = ++persistenceRequestId
      const project = get().activeProject
      if (!project) return

      if (!navigator.onLine) {
        set({ saveStatus: 'offline' })
        return
      }

      set({ saveStatus: 'saving' })
      try {
        await repository.save(project)
        if (
          requestId === persistenceRequestId &&
          get().activeProject === project
        ) {
          set({ saveStatus: 'saved' })
        }
      } catch {
        if (
          requestId === persistenceRequestId &&
          get().activeProject === project
        ) {
          set({ saveStatus: 'failed' })
        }
      }
    },

    hydrate: async (projectId, repository = defaultRepository, signal) => {
      const requestId = ++hydrationRequestId
      const project = await repository.load(projectId)
      if (requestId !== hydrationRequestId || signal?.aborted) return false

      persistenceRequestId += 1
      if (!project) {
        set({
          activeProjectId: undefined,
          activeProject: undefined,
          past: [],
          future: [],
          saveStatus: 'saved',
        })
        return false
      }

      set((state) => ({
        projectsById: { ...state.projectsById, [project.id]: project },
        activeProjectId: project.id,
        activeProject: project,
        past: [],
        future: [],
        saveStatus: 'saved',
      }))
      return true
    },
  }
})
