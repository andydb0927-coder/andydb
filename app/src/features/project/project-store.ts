import { create } from 'zustand'

import {
  appendNodeVersion,
  type CanvasNode,
  type DependencyEdge,
  type NodeVersion,
  type Project,
  type TimelineItem,
} from './model'
import { ProjectRepository } from './project-repository'

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

export const useProjectStore = create<ProjectStore>((set, get) => {
  let persistenceRequestId = 0
  let hydrationRequestId = 0

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

    addToTimeline: (item) => {
      commit((project) =>
        withUpdatedTimestamp({
          ...project,
          timeline: [...project.timeline, item],
        }),
      )
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
