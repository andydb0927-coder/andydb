export type NodeKind =
  | 'character'
  | 'scene'
  | 'storyboard'
  | 'video'
  | 'preview'

export type JobStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'

export interface NodeVersion {
  id: string
  createdAt: string
  prompt: string
  assetId?: string
  generationJobId?: string
}

export interface Asset {
  id: string
  kind: 'image' | 'video' | 'audio'
  url: string
  mimeType: string
  width?: number
  height?: number
  durationSeconds?: number
}

export interface CanvasNode {
  id: string
  kind: NodeKind
  title: string
  position: { x: number; y: number }
  versions: NodeVersion[]
  activeVersionId: string
  sourceChanged: boolean
}

export interface DependencyEdge {
  id: string
  sourceNodeId: string
  targetNodeId: string
  sourceChanged?: boolean
}

export interface TimelineItem {
  id: string
  nodeId: string
  order: number
  durationSeconds: number
  track: 'video' | 'audio'
}

export interface GenerationJob {
  id: string
  nodeId: string
  status: JobStatus
  prompt: string
  createdAt: string
  updatedAt: string
  assetId?: string
  error?: string
}

export interface ExportJob {
  id: string
  status: JobStatus
  createdAt: string
  updatedAt: string
  assetId?: string
  error?: string
}

export interface Project {
  id: string
  title: string
  intent: string
  createdAt: string
  updatedAt: string
  assets: Asset[]
  nodes: CanvasNode[]
  edges: DependencyEdge[]
  timeline: TimelineItem[]
  jobs: GenerationJob[]
  exportJobs: ExportJob[]
}

export function createProject(title: string, intent: string): Project {
  const timestamp = new Date().toISOString()

  return {
    id: crypto.randomUUID(),
    title,
    intent,
    createdAt: timestamp,
    updatedAt: timestamp,
    assets: [],
    nodes: [],
    edges: [],
    timeline: [],
    jobs: [],
    exportJobs: [],
  }
}

export function appendNodeVersion(
  project: Project,
  nodeId: string,
  version: Omit<NodeVersion, 'id' | 'createdAt'>,
): Project {
  const node = project.nodes.find((candidate) => candidate.id === nodeId)

  if (!node) {
    return project
  }

  const timestamp = new Date().toISOString()
  const nextVersion: NodeVersion = {
    ...version,
    id: crypto.randomUUID(),
    createdAt: timestamp,
  }

  return {
    ...project,
    updatedAt: timestamp,
    nodes: project.nodes.map((candidate) =>
      candidate.id === nodeId
        ? {
            ...candidate,
            versions: [...candidate.versions, nextVersion],
            activeVersionId: nextVersion.id,
          }
        : candidate,
    ),
  }
}
