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

interface ProjectStore {
  projectsById: Record<string, Project>
  activeProjectId?: string
  activeProject?: Project
  saveStatus: PersistenceStatus
  past: Project[]
  future: Project[]
  addNode: (node: CanvasNode) => void
  updateNode: (nodeId: string, changes: Partial<CanvasNode>) => void
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
  hydrate: (projectId: string, repository?: LoadRepository) => Promise<void>
}

const defaultRepository = new ProjectRepository()

function withUpdatedTimestamp(project: Project): Project {
  return { ...project, updatedAt: new Date().toISOString() }
}

export const useProjectStore = create<ProjectStore>((set, get) => {
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
            node.id === nodeId ? { ...node, ...changes, id: node.id } : node,
          ),
        })
      })
    },

    deleteNode: (nodeId) => {
      commit((project) => {
        if (!project.nodes.some((node) => node.id === nodeId)) return project

        return withUpdatedTimestamp({
          ...project,
          nodes: project.nodes.filter((node) => node.id !== nodeId),
          edges: project.edges.filter(
            (edge) =>
              edge.sourceNodeId !== nodeId && edge.targetNodeId !== nodeId,
          ),
          timeline: project.timeline.filter((item) => item.nodeId !== nodeId),
        })
      })
    },

    connectNodes: (edge) => {
      commit((project) =>
        withUpdatedTimestamp({ ...project, edges: [...project.edges, edge] }),
      )
    },

    appendVersion: (nodeId, version) => {
      commit((project) => appendNodeVersion(project, nodeId, version))
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
        const reordered = orderedItemIds.flatMap((id, order) => {
          const item = itemsById.get(id)
          return item ? [{ ...item, order }] : []
        })

        if (reordered.length !== project.timeline.length) return project

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
      const project = get().activeProject
      if (!project) return

      if (!navigator.onLine) {
        set({ saveStatus: 'offline' })
        return
      }

      set({ saveStatus: 'saving' })
      try {
        await repository.save(project)
        set({ saveStatus: 'saved' })
      } catch {
        set({ saveStatus: 'failed' })
      }
    },

    hydrate: async (projectId, repository = defaultRepository) => {
      const project = await repository.load(projectId)
      if (!project) return

      set((state) => ({
        projectsById: { ...state.projectsById, [project.id]: project },
        activeProjectId: project.id,
        activeProject: project,
        past: [],
        future: [],
        saveStatus: 'saved',
      }))
    },
  }
})
