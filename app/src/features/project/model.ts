export type NodeKind =
  | 'character'
  | 'character-card'
  | 'scene'
  | 'script'
  | 'text'
  | 'image'
  | 'storyboard'
  | 'video'
  | 'preview'
  | 'worldview'

export type CreativeCardKind = 'script' | 'character-card' | 'worldview'

interface CreativeCardBase {
  imageAssetId?: string
}

export interface ScriptCard extends CreativeCardBase {
  kind: 'script'
  scenes: string
  dialogue: string
  shotNotes: string
}

export interface CharacterCard extends CreativeCardBase {
  kind: 'character-card'
  name: string
  appearance: string
  wardrobe: string
  relationships: string
}

export interface WorldviewCard extends CreativeCardBase {
  kind: 'worldview'
  background: string
  artStyle: string
  rules: string
}

export type CreativeCard = ScriptCard | CharacterCard | WorldviewCard

export type JobStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'

export type GenerationOperation =
  | 'regenerate'
  | 'extend-shot'
  | 'generate-video'

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

export interface ImageResult {
  id: string
  assetId: string
}

export interface ImageGenerationSettings {
  prompt: string
  pValue: string
  stylization: number
  weirdness: number
  diversity: number
  autoLink: boolean
}

export interface GenerationReferenceConfig {
  url: string
  kind: 'image' | 'video' | 'audio'
  mimeType: string
}

export interface GenerationConfiguration {
  targetKind: 'image' | 'video' | 'audio'
  providerId?: string
  parameters?: Record<string, string | number | boolean>
  referenceAssets: GenerationReferenceConfig[]
}

export const defaultImageGenerationSettings: ImageGenerationSettings = {
  prompt: '',
  pValue: '',
  stylization: 150,
  weirdness: 50,
  diversity: 5,
  autoLink: true,
}

export type VideoDerivedTool =
  | '视频高清'
  | '逐帧拉片'
  | '截取首帧'
  | '截取尾帧'
  | '截取当前帧'

export type VideoToolConfig =
  | {
      kind: 'upscale'
      model: 'Topazlabs' | 'HuoShan-画质增强'
      resolution: '1080P' | '2K' | '4K'
      interpolation: '不补帧' | '高质量补帧'
      slowMotion: '1x' | '2x' | '3x' | '5x'
      cost: 16
    }
  | {
      kind: 'frame-analysis'
      model: 'SD2.5'
      dimensions: ['分镜', '动态', '音乐']
    }
  | {
      kind: 'frame-capture'
      frame: '首帧' | '尾帧' | '当前帧'
    }

export interface EffectToolConfig {
  templateId: string
  effect: string
  intensity: number
  color: string
  direction: '无' | '左到右' | '右到左' | '上升' | '下降' | '径向'
  blendMode: '正常' | '滤色' | '叠加' | '柔光'
}

export interface CanvasNode {
  id: string
  kind: NodeKind
  title: string
  position: { x: number; y: number }
  storyboardDialogue?: string
  versions: NodeVersion[]
  activeVersionId: string
  sourceChanged: boolean
  modelProviderId?: string
  card?: CreativeCard
  imageResults?: ImageResult[]
  activeResultId?: string
  imageGeneration?: ImageGenerationSettings
  rotationQuarterTurns?: number
  videoTool?: VideoToolConfig
  effectTool?: EffectToolConfig
  generationConfig?: GenerationConfiguration
}

export interface CanvasGroup {
  id: string
  title: string
  kind?: 'standard' | 'storyboard'
  nodeIds: string[]
  createdAt: string
  updatedAt: string
}

export interface CanvasCreation {
  node: CanvasNode
  asset?: Asset
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
  projectId?: string
  nodeId: string
  status: JobStatus
  prompt: string
  createdAt: string
  updatedAt: string
  assetId?: string
  error?: string
  operation?: GenerationOperation
  attempt?: number
  sequence?: number
  providerId?: string
  providerName?: string
  modelName?: string
  progress?: number
  estimatedCost?: number
  creditsSpent?: number
  generationConfig?: GenerationConfiguration
}

export interface ExportJob {
  id: string
  status: JobStatus
  createdAt: string
  updatedAt: string
  assetId?: string
  error?: string
  providerId?: string
  providerName?: string
  modelName?: string
  progress?: number
  estimatedCost?: number
  creditsSpent?: number
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
  groups?: CanvasGroup[]
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
    groups: [],
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
