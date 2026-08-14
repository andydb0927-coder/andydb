import { create } from 'zustand'

import {
  appendNodeVersion,
  type CanvasCreation,
  type CanvasNode,
  type DependencyEdge,
  type GenerationJob,
  type ImageGenerationSettings,
  type NodeVersion,
  type Project,
  type TimelineItem,
} from './model'
import {
  type ConnectionValidationResult,
  validateDependencyConnection,
  validateImageReferenceConnection,
} from './dependency-policy'
import { ProjectRepository } from './project-repository'
import type { GenerationResult } from '../generation/generation-adapter'
import { reorderTimeline as reorderTimelineItems } from '../timeline/timeline-model'
import {
  updateCreativeCardProject,
  type CreativeCardDraft,
} from './creative-card'
import type { WorkflowNodeRun } from '../workflow/workflow-model'

export type PersistenceStatus =
  | 'dirty'
  | 'saving'
  | 'saved'
  | 'error'
  | 'offline'

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
  renameProject: (title: string) => void
  addNode: (node: CanvasNode) => void
  createCanvasContent: (creation: CanvasCreation) => void
  createConnectedCanvasContent: (
    sourceNodeId: string,
    creation: CanvasCreation,
    edgeId: string,
  ) => boolean
  updateNode: (nodeId: string, changes: NodeUpdates) => void
  updateCreativeCard: (nodeId: string, draft: CreativeCardDraft) => void
  updateNodePositions: (
    positions: Array<{ nodeId: string; position: CanvasNode['position'] }>,
  ) => void
  setActiveImageResult: (nodeId: string, resultId: string) => void
  updateImageGenerationSettings: (
    nodeId: string,
    changes: Partial<ImageGenerationSettings>,
  ) => void
  rotateImageNode: (nodeId: string) => void
  groupNodes: (nodeIds: Iterable<string>) => string | undefined
  ungroupNodes: (groupId: string) => boolean
  deleteNode: (nodeId: string) => void
  connectNodes: (edge: DependencyEdge) => ConnectionValidationResult
  connectImageReference: (edge: DependencyEdge) => ConnectionValidationResult
  disconnectNodes: (edgeId: string) => boolean
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
  applyWorkflowGenerationSuccess: (
    projectId: string,
    nodeRun: WorkflowNodeRun,
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
  const outgoing = new Map<string, DependencyEdge[]>()
  for (const edge of project.edges) {
    const sourceNodeId = edge.sourceNodeId
    const edges = outgoing.get(sourceNodeId) ?? []
    edges.push(edge)
    outgoing.set(sourceNodeId, edges)
  }
  const queue = [nodeId]
  const visited = new Set(queue)

  for (let index = 0; index < queue.length; index += 1) {
    const sourceId = queue[index]
    for (const edge of outgoing.get(sourceId) ?? []) {
      edgeIds.add(edge.id)
      if (visited.has(edge.targetNodeId)) continue
      visited.add(edge.targetNodeId)
      nodeIds.add(edge.targetNodeId)
      queue.push(edge.targetNodeId)
    }
  }

  return { nodeIds, edgeIds }
}

function markDependencyConsumersChanged(project: Project, targetNodeId: string) {
  const downstream = findDownstream(project, targetNodeId)
  return {
    ...project,
    nodes: project.nodes.map((node) =>
      node.id === targetNodeId || downstream.nodeIds.has(node.id)
        ? { ...node, sourceChanged: true }
        : node,
    ),
    edges: project.edges.map((edge) =>
      downstream.edgeIds.has(edge.id)
        ? { ...edge, sourceChanged: true }
        : edge,
    ),
  }
}

function replaceGenerationJob(jobs: GenerationJob[], job: GenerationJob) {
  return jobs.some((candidate) => candidate.id === job.id)
    ? jobs.map((candidate) => (candidate.id === job.id ? job : candidate))
    : [...jobs, job]
}

function placeGeneratedNode(
  project: Project,
  source: CanvasNode,
  kind: 'storyboard' | 'video',
) {
  const x = source.position.x + 340
  let y = source.position.y + (kind === 'storyboard' ? 260 : 180)

  while (
    project.nodes.some(
      (node) =>
        Math.abs(node.position.x - x) < 300 &&
        Math.abs(node.position.y - y) < 300,
    )
  ) {
    y += 300
  }

  return { x, y }
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

function nextGroupNumber(titles: Iterable<string>) {
  let highest = 0
  for (const title of titles) {
    const match = title.match(/^分组\s*(\d+)$/)
    if (match) highest = Math.max(highest, Number(match[1]))
  }
  return highest + 1
}

export const useProjectStore = create<ProjectStore>((set, get) => {
  let persistenceRequestId = 0
  let hydrationRequestId = 0
  let persistenceChain: Promise<void> = Promise.resolve()
  const generationBaselines = new Map<string, Project>()

  const commit = (mutate: (project: Project) => Project) => {
    const current = get().activeProject
    if (!current) return

    const next = mutate(current)
    if (next === current) return

    set((state) => ({
      projectsById: { ...state.projectsById, [next.id]: next },
      activeProject: next,
      saveStatus: 'dirty',
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

    renameProject: (title) => {
      const normalized = title.trim()
      if (!normalized || normalized.length > 60) return
      commit((project) =>
        project.title === normalized
          ? project
          : withUpdatedTimestamp({ ...project, title: normalized }),
      )
    },

    addNode: (node) => {
      commit((project) =>
        withUpdatedTimestamp({ ...project, nodes: [...project.nodes, node] }),
      )
    },

    createCanvasContent: ({ node, asset }) => {
      commit((project) => {
        const nodeConflict = project.nodes.some(
          (candidate) => candidate.id === node.id,
        )
        const assetConflict =
          asset !== undefined &&
          project.assets.some((candidate) => candidate.id === asset.id)
        if (nodeConflict || assetConflict) return project

        return withUpdatedTimestamp({
          ...project,
          assets: asset ? [...project.assets, asset] : project.assets,
          nodes: [...project.nodes, node],
        })
      })
    },

    createConnectedCanvasContent: (sourceNodeId, { node, asset }, edgeId) => {
      let created = false
      commit((project) => {
        const nodeConflict = project.nodes.some(
          (candidate) => candidate.id === node.id,
        )
        const assetConflict =
          asset !== undefined &&
          project.assets.some((candidate) => candidate.id === asset.id)
        const edgeConflict = project.edges.some(({ id }) => id === edgeId)
        if (nodeConflict || assetConflict || edgeConflict) return project

        const withNode: Project = {
          ...project,
          assets: asset ? [...project.assets, asset] : project.assets,
          nodes: [...project.nodes, node],
        }
        const validation = validateDependencyConnection(
          withNode,
          sourceNodeId,
          node.id,
        )
        if (!validation.ok) return project
        created = true
        return withUpdatedTimestamp({
          ...withNode,
          edges: [
            ...project.edges,
            {
              id: edgeId,
              sourceNodeId,
              targetNodeId: node.id,
              sourceChanged: false,
            },
          ],
        })
      })
      return created
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

    updateCreativeCard: (nodeId, draft) => {
      commit((project) => {
        let updated: Project
        try {
          updated = updateCreativeCardProject(project, nodeId, draft)
        } catch {
          return project
        }
        const downstream = findDownstream(updated, nodeId)
        return {
          ...updated,
          nodes: updated.nodes.map((node) =>
            downstream.nodeIds.has(node.id)
              ? { ...node, sourceChanged: true }
              : node,
          ),
          edges: updated.edges.map((edge) =>
            edge.targetNodeId === nodeId
              ? { ...edge, sourceChanged: false }
              : downstream.edgeIds.has(edge.id)
              ? { ...edge, sourceChanged: true }
              : edge,
          ),
        }
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

    setActiveImageResult: (nodeId, resultId) => {
      commit((project) => {
        const source = project.nodes.find(({ id }) => id === nodeId)
        const result = source?.imageResults?.find(({ id }) => id === resultId)
        const resultAsset = project.assets.find(({ id }) => id === result?.assetId)
        const activeVersion = source?.versions.find(
          ({ id }) => id === source.activeVersionId,
        )
        if (
          !source ||
          !result ||
          !activeVersion ||
          resultAsset?.kind !== 'image' ||
          source.activeResultId === resultId
        ) {
          return project
        }
        const downstream = findDownstream(project, nodeId)

        return withUpdatedTimestamp({
          ...project,
          nodes: project.nodes.map((node) => {
            if (node.id === nodeId) {
              return {
                ...node,
                activeResultId: resultId,
                versions: node.versions.map((version) =>
                  version.id === node.activeVersionId
                    ? { ...version, assetId: result.assetId }
                    : version,
                ),
              }
            }
            return downstream.nodeIds.has(node.id)
              ? { ...node, sourceChanged: true }
              : node
          }),
          edges: project.edges.map((edge) =>
            downstream.edgeIds.has(edge.id)
              ? { ...edge, sourceChanged: true }
              : edge,
          ),
        })
      })
    },

    updateImageGenerationSettings: (nodeId, changes) => {
      commit((project) => {
        const source = project.nodes.find(({ id }) => id === nodeId)
        if (
          !source ||
          !['image', 'character', 'scene'].includes(source.kind) ||
          source.videoTool
        ) {
          return project
        }
        const current: ImageGenerationSettings = {
          prompt:
            source.versions.find(({ id }) => id === source.activeVersionId)
              ?.prompt ?? '',
          pValue: '',
          stylization: 150,
          weirdness: 50,
          diversity: 5,
          autoLink: true,
          ...source.imageGeneration,
        }
        const next: ImageGenerationSettings = {
          prompt:
            changes.prompt === undefined ? current.prompt : changes.prompt,
          pValue:
            changes.pValue === undefined ? current.pValue : changes.pValue,
          stylization:
            changes.stylization === undefined
              ? current.stylization
              : Math.min(1000, Math.max(0, changes.stylization)),
          weirdness:
            changes.weirdness === undefined
              ? current.weirdness
              : Math.min(3000, Math.max(0, changes.weirdness)),
          diversity:
            changes.diversity === undefined
              ? current.diversity
              : Math.min(100, Math.max(0, changes.diversity)),
          autoLink:
            changes.autoLink === undefined
              ? current.autoLink
              : changes.autoLink,
        }
        if (
          current.prompt === next.prompt &&
          current.pValue === next.pValue &&
          current.stylization === next.stylization &&
          current.weirdness === next.weirdness &&
          current.diversity === next.diversity &&
          current.autoLink === next.autoLink
        ) {
          return project
        }

        return withUpdatedTimestamp({
          ...project,
          nodes: project.nodes.map((node) =>
            node.id === nodeId ? { ...node, imageGeneration: next } : node,
          ),
        })
      })
    },

    rotateImageNode: (nodeId) => {
      commit((project) => {
        const source = project.nodes.find(({ id }) => id === nodeId)
        if (!source) return project
        const activeVersion = source.versions.find(
          ({ id }) => id === source.activeVersionId,
        )
        const asset = project.assets.find(({ id }) => id === activeVersion?.assetId)
        if (asset?.kind !== 'image') return project
        const downstream = findDownstream(project, nodeId)

        return withUpdatedTimestamp({
          ...project,
          nodes: project.nodes.map((node) => {
            if (node.id === nodeId) {
              return {
                ...node,
                rotationQuarterTurns: ((node.rotationQuarterTurns ?? 0) + 1) % 4,
              }
            }
            return downstream.nodeIds.has(node.id)
              ? { ...node, sourceChanged: true }
              : node
          }),
          edges: project.edges.map((edge) =>
            downstream.edgeIds.has(edge.id)
              ? { ...edge, sourceChanged: true }
              : edge,
          ),
        })
      })
    },

    groupNodes: (nodeIds) => {
      let createdGroupId: string | undefined
      commit((project) => {
        const requested = new Set(nodeIds)
        const orderedNodeIds = project.nodes
          .filter(({ id }) => requested.has(id))
          .map(({ id }) => id)
        if (orderedNodeIds.length < 2) return project

        const selected = new Set(orderedNodeIds)
        const existingGroups = project.groups ?? []
        const timestamp = new Date().toISOString()
        const remainingGroups = existingGroups
          .map((group) => {
            const nextNodeIds = group.nodeIds.filter(
              (nodeId) => !selected.has(nodeId),
            )
            return nextNodeIds.length === group.nodeIds.length
              ? group
              : { ...group, nodeIds: nextNodeIds, updatedAt: timestamp }
          })
          .filter((group) => group.nodeIds.length >= 2)
        createdGroupId = crypto.randomUUID()
        const number = nextGroupNumber(existingGroups.map(({ title }) => title))

        return withUpdatedTimestamp({
          ...project,
          groups: [
            ...remainingGroups,
            {
              id: createdGroupId,
              title: `分组 ${String(number).padStart(2, '0')}`,
              nodeIds: orderedNodeIds,
              createdAt: timestamp,
              updatedAt: timestamp,
            },
          ],
        })
      })
      return createdGroupId
    },

    ungroupNodes: (groupId) => {
      let removed = false
      commit((project) => {
        if (!(project.groups ?? []).some(({ id }) => id === groupId)) {
          return project
        }
        removed = true
        return withUpdatedTimestamp({
          ...project,
          groups: (project.groups ?? []).filter(({ id }) => id !== groupId),
        })
      })
      return removed
    },

    deleteNode: (nodeId) => {
      commit((project) => {
        if (!project.nodes.some((node) => node.id === nodeId)) return project
        const downstream = findDownstream(project, nodeId)
        const timestamp = new Date().toISOString()

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
          ...(project.groups
            ? {
                groups: project.groups
                  .map((group) => {
                    const nextNodeIds = group.nodeIds.filter(
                      (id) => id !== nodeId,
                    )
                    return nextNodeIds.length === group.nodeIds.length
                      ? group
                      : { ...group, nodeIds: nextNodeIds, updatedAt: timestamp }
                  })
                  .filter((group) => group.nodeIds.length >= 2),
              }
            : {}),
        })
      })
    },

    connectNodes: (edge) => {
      let result: ConnectionValidationResult = {
        ok: false,
        reason: 'missing-node',
      }
      commit((project) => {
        result = project.edges.some(({ id }) => id === edge.id)
          ? { ok: false, reason: 'duplicate' }
          : validateDependencyConnection(
              project,
              edge.sourceNodeId,
              edge.targetNodeId,
            )
        if (!result.ok) return project
        const connected = {
          ...project,
          edges: [...project.edges, { ...edge, sourceChanged: false }],
        }
        return withUpdatedTimestamp(
          markDependencyConsumersChanged(connected, edge.targetNodeId),
        )
      })
      return result
    },

    connectImageReference: (edge) => {
      let result: ConnectionValidationResult = {
        ok: false,
        reason: 'missing-node',
      }
      commit((project) => {
        result = project.edges.some(({ id }) => id === edge.id)
          ? { ok: false, reason: 'duplicate' }
          : validateImageReferenceConnection(
              project,
              edge.sourceNodeId,
              edge.targetNodeId,
            )
        if (!result.ok) return project
        const connected = {
          ...project,
          edges: [...project.edges, { ...edge, sourceChanged: false }],
        }
        return withUpdatedTimestamp(
          markDependencyConsumersChanged(connected, edge.targetNodeId),
        )
      })
      return result
    },

    disconnectNodes: (edgeId) => {
      let removed = false
      commit((project) => {
        const edge = project.edges.find(({ id }) => id === edgeId)
        if (!edge) return project
        removed = true
        const disconnected = {
          ...project,
          edges: project.edges.filter(({ id }) => id !== edgeId),
        }
        return withUpdatedTimestamp(
          markDependencyConsumersChanged(disconnected, edge.targetNodeId),
        )
      })
      return removed
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
        ...(state.activeProjectId === projectId
          ? { activeProject: next, saveStatus: 'dirty' as const }
          : {}),
        ...(terminal
          ? {
              past: state.past.map((snapshot) =>
                snapshot.id === projectId
                  ? sanitizeGenerationBaseline(snapshot, next)
                  : snapshot,
              ),
              future: state.future.map((snapshot) =>
                snapshot.id === projectId
                  ? sanitizeGenerationBaseline(snapshot, next)
                  : snapshot,
              ),
            }
          : {}),
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
          position: placeGeneratedNode(project, source, kind),
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
              saveStatus: 'dirty' as const,
              past: [...state.past, baseline],
              future: [],
            }
          : {}),
      }))
    },

    applyWorkflowGenerationSuccess: (projectId, nodeRun, result) => {
      const project = get().projectsById[projectId]
      const source = project?.nodes.find((node) => node.id === nodeRun.nodeId)
      if (
        !project ||
        !source ||
        nodeRun.request.projectId !== projectId ||
        nodeRun.request.nodeId !== nodeRun.nodeId ||
        nodeRun.status !== 'running'
      ) {
        throw new Error('Workflow project or source mismatch')
      }
      if (project.assets.some((asset) => asset.id === result.asset.id)) {
        throw new Error('Workflow asset ID collision')
      }
      if (
        project.nodes.some((node) =>
          node.versions.some((version) => version.id === result.version.id),
        )
      ) {
        throw new Error('Workflow version ID collision')
      }
      if (
        result.version.assetId !== result.asset.id ||
        result.version.generationJobId !== nodeRun.id
      ) {
        throw new Error('Workflow result reference mismatch')
      }
      if (project.jobs.some((job) => job.id === nodeRun.id)) {
        throw new Error('Workflow job ID collision')
      }

      const timestamp = new Date().toISOString()
      const job: GenerationJob = {
        id: nodeRun.id,
        projectId,
        nodeId: nodeRun.nodeId,
        status: 'succeeded',
        prompt: nodeRun.request.prompt,
        createdAt: nodeRun.startedAt ?? timestamp,
        updatedAt: timestamp,
        assetId: result.asset.id,
        operation: nodeRun.request.operation,
        attempt: nodeRun.attempt,
        sequence:
          project.jobs.reduce(
            (latest, candidate) => Math.max(latest, candidate.sequence ?? 0),
            0,
          ) + 1,
      }
      const versioned = withUpdatedTimestamp({
        ...project,
        assets: [...project.assets, result.asset],
        jobs: [...project.jobs, job],
        nodes: project.nodes.map((node) =>
          node.id === source.id
            ? {
                ...node,
                versions: [...node.versions, result.version],
                activeVersionId: result.version.id,
                sourceChanged: false,
              }
            : node,
        ),
      })
      const downstream = findDownstream(versioned, source.id)
      const next: Project = {
        ...versioned,
        nodes: versioned.nodes.map((node) =>
          downstream.nodeIds.has(node.id)
            ? { ...node, sourceChanged: true }
            : node,
        ),
        edges: versioned.edges.map((edge) =>
          downstream.edgeIds.has(edge.id)
            ? { ...edge, sourceChanged: true }
            : edge,
        ),
      }
      set((state) => ({
        projectsById: { ...state.projectsById, [projectId]: next },
        ...(state.activeProjectId === projectId
          ? { activeProject: next, saveStatus: 'dirty' as const }
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
          (node?.kind !== 'video' && node?.kind !== 'storyboard') ||
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
          timeline: [
            ...project.timeline,
            { ...item, order: project.timeline.length },
          ],
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

        let reordered = project.timeline
        orderedItemIds.forEach((id, toIndex) => {
          const fromIndex = reordered.findIndex((item) => item.id === id)
          reordered = reorderTimelineItems(reordered, fromIndex, toIndex)
        })

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
        saveStatus: 'dirty',
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
        saveStatus: 'dirty',
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
      const write = persistenceChain.then(() => repository.save(project))
      persistenceChain = write.catch(() => undefined)
      try {
        await write
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
          set({ saveStatus: 'error' })
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
