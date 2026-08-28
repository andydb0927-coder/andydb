import type { TaskStatus } from '../generation/task-status.js'

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

/** Compatibility alias. The canonical contract is generation/task-status. */
export type JobStatus = TaskStatus

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
  textContent?: string
  /** Immutable generation inputs; older versions resolve these from job history. */
  generationConfig?: GenerationConfiguration
  generatedPrompt?: string
  audioDetails?: AudioNodeDetails
}

export interface Asset {
  id: string
  kind: 'image' | 'video' | 'audio' | 'text'
  url: string
  mimeType: string
  width?: number
  height?: number
  durationSeconds?: number
  framesPerSecond?: number
  resolution?: string
  sampleRate?: number
  audioChannels?: number
}

export interface ImageResult {
  id: string
  assetId: string
}

export interface ImageAnnotationPoint {
  x: number
  y: number
}

interface ImageAnnotationBase {
  id: string
  color: string
  lineWidth: number
}

export type ImageAnnotation =
  | (ImageAnnotationBase & {
      kind: 'rectangle' | 'ellipse' | 'arrow'
      start: ImageAnnotationPoint
      end: ImageAnnotationPoint
    })
  | (ImageAnnotationBase & {
      kind: 'brush'
      points: ImageAnnotationPoint[]
    })
  | (ImageAnnotationBase & {
      kind: 'text'
      point: ImageAnnotationPoint
      text: string
    })

export interface ImageGenerationSettings {
  prompt: string
  pValue: string
  stylization: number
  weirdness: number
  diversity: number
  autoLink: boolean
  editStrength: number
  quality: '低画质' | '标准画质' | '高画质'
  resolution: '1K' | '1.5K' | '2K' | '4K' | '自适应'
  aspectRatio:
    | '自适应'
    | '自定义'
    | '1:1'
    | '1:2'
    | '2:1'
    | '9:16'
    | '16:9'
    | '3:4'
    | '4:3'
    | '3:2'
    | '2:3'
    | '5:4'
    | '4:5'
    | '21:9'
    | '9:21'
  customWidth: number
  customHeight: number
  count: 1 | 2 | 4
}

export interface GenerationReferenceConfig {
  url: string
  kind: 'image' | 'video' | 'audio'
  mimeType: string
  role?: 'first_frame' | 'last_frame' | 'reference_image'
}

export interface AppliedStyle {
  id: string
  name: string
  promptFragment: string
  compatibility: { targetKinds: Array<'image' | 'video' | 'text'>; providerIds?: string[] }
}

export interface SubjectReference {
  id: string
  name: string
  description: string
  coverUrl: string
  mimeType: string
}

export interface GenerationConfiguration {
  subjects?: SubjectReference[]
  style?: AppliedStyle
  targetKind: 'image' | 'video' | 'audio' | 'text'
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
  editStrength: 0.6,
  quality: '标准画质',
  resolution: '2K',
  aspectRatio: '16:9',
  customWidth: 2048,
  customHeight: 2048,
  count: 1,
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

export interface ImageToolConfig {
  kind: 'upscale'
  model: '高清修复'
  scale: '2x' | '4x'
  resolution: '2K' | '4K'
  detailProtection: boolean
  cost: 18
}

export interface EffectToolConfig {
  templateId: string
  effect: string
  intensity: number
  color: string
  direction: '无' | '左到右' | '右到左' | '上升' | '下降' | '径向'
  blendMode: '正常' | '滤色' | '叠加' | '柔光'
}

export type TextFontStyle = '正文' | '标题' | '引用' | '等宽'
export type TextEditorBlockStyle = 'paragraph' | 'h1' | 'h2' | 'h3'
export type TextEditorListStyle = 'none' | 'bullet' | 'ordered'

export interface TextNodeDetails {
  type: 'text'
  content: string
  fontStyle: TextFontStyle
  modelProviderId?: string
  modelVariant?: string
  prompt?: string
  generatedByModel?: string
  editorMode?: 'generate' | 'manual'
  editorBlockStyle?: TextEditorBlockStyle
  editorBold?: boolean
  editorItalic?: boolean
  editorListStyle?: TextEditorListStyle
}

export interface ScriptChapter {
  id: string
  title: string
  summary: string
  scenes?: ScriptScene[]
}

export interface ScriptScene { id: string; title: string; summary: string }
export interface ScriptCharacter {
  id: string
  name: string
  description: string
  referenceAssetId?: string
  subjectId?: string
}
export interface ScriptProp { id: string; name: string; description: string }
export interface ScriptShot {
  id: string
  sceneId: string
  title: string
  shotSize: string
  cameraAngle: string
  cameraMovement: string
  prompt: string
  characterIds: string[]
  assetId?: string
  generationJobId?: string
  status?: TaskStatus
  error?: string
  canvasNodeId?: string
}

export interface ScriptNodeDetails {
  type: 'script'
  chapters: ScriptChapter[]
  modelProviderId?: string
  modelVariant?: string
  outline?: string
  sceneCount?: number
  generatedByModel?: string
  characters?: ScriptCharacter[]
  props?: ScriptProp[]
  shots?: ScriptShot[]
}

export interface AudioNodeDetails {
  type: 'audio'
  durationSeconds: number
  /** Official speaker ID; legacy Chinese aliases remain readable. */
  voice: string
  speed: number
  volume: number
  pitch?: number
  modelProviderId?: string
  modelVariant?: string
  prompt?: string
  sampleRate?: number
  format?: 'mp3' | 'wav' | 'pcm' | 'ogg_opus'
  generatedByModel?: string
  trimStartSeconds?: number
  trimEndSeconds?: number
  playbackRate?: number
  fadeInSeconds?: number
  fadeOutSeconds?: number
  normalize?: boolean
}

export interface DirectorShot {
  id: string
  title: string
  cameraHint: string
}

export type Director3DObjectKind =
  | 'cube'
  | 'sphere'
  | 'cylinder'
  | 'plane'
  | 'humanoid'
  | 'table'
  | 'chair'
  | 'tree'
  | 'column'

export type Director3DVector = [number, number, number]

export interface Director3DObject {
  id: string
  name: string
  kind: Director3DObjectKind
  color: string
  position: Director3DVector
  rotation: Director3DVector
  scale: Director3DVector
}

export type DirectorCameraProjection = 'perspective' | 'orthographic'
export type DirectorCameraView = 'top' | 'front' | 'side' | 'free'
export type DirectorCameraPreset = 'close-up' | 'medium' | 'wide' | 'low'
export type DirectorLightingPreset = 'three-point' | 'side-back' | 'top' | 'rim'

export interface DirectorLight {
  id: string
  name: string
  color: string
  intensity: number
  position: Director3DVector
  target: Director3DVector
}

export interface DirectorLightingState {
  preset: DirectorLightingPreset | 'custom' | 'legacy'
  ambientIntensity: number
  lights: DirectorLight[]
}

export interface DirectorCameraState {
  preset?: DirectorCameraPreset
  focalLength?: number
  projection: DirectorCameraProjection
  view: DirectorCameraView
  position: Director3DVector
  target: Director3DVector
  zoom: number
}

export interface Director3DSceneState {
  objects: Director3DObject[]
  camera: DirectorCameraState
  lighting?: DirectorLightingState
  trajectory?: DirectorTrajectory
}

export interface DirectorTrajectory {
  points: Director3DVector[]
  durationSeconds?: number
}

export interface DirectorNodeDetails {
  type: 'director'
  shots: DirectorShot[]
  scene3d?: Director3DSceneState
  trajectory?: DirectorTrajectory
}

export interface FrameAnalysisNodeDetails {
  type: 'frame-analysis'
  sourceName: string
  sourceSummary: string
  dimensions: {
    storyboard: boolean
    motion: boolean
    music: boolean
  }
}

export interface SmartEditTrack {
  id: string
  name: string
}

export interface SmartEditClip {
  id: string
  name: string
  durationSeconds: number
}

export interface SmartEditNodeDetails {
  type: 'smart-edit'
  tracks: SmartEditTrack[]
  clips: SmartEditClip[]
  exportDurationSeconds: number
}

export type CanvasNodeDetails =
  | TextNodeDetails
  | ScriptNodeDetails
  | AudioNodeDetails
  | DirectorNodeDetails
  | FrameAnalysisNodeDetails
  | SmartEditNodeDetails

export interface CanvasNode {
  subjectSnapshot?: SubjectReference
  /** null explicitly clears a historical style; undefined keeps old projects compatible. */
  appliedStyle?: AppliedStyle | null
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
  mirrorHorizontal?: boolean
  mirrorVertical?: boolean
  imageAnnotations?: ImageAnnotation[]
  imageTool?: ImageToolConfig
  videoTool?: VideoToolConfig
  effectTool?: EffectToolConfig
  details?: CanvasNodeDetails
  generationConfig?: GenerationConfiguration
  subjectId?: string
}

export interface CanvasGroup {
  id: string
  title: string
  kind?: 'standard' | 'storyboard' | 'preset'
  nodeIds: string[]
  storyboardLayout?: {
    preset: '2x2' | '2x3' | '3x3' | 'custom'
    columns: number
    rows: number
  }
  storyboardCaptions?: Record<string, string>
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

export interface CanvasViewportState {
  x: number
  y: number
  zoom: number
}

export interface ProjectCanvas {
  id: string
  title: string
  nodes: CanvasNode[]
  edges: DependencyEdge[]
  groups: CanvasGroup[]
  viewport: CanvasViewportState
  createdAt: string
  updatedAt: string
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
  status: TaskStatus
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
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  estimatedCostCny?: number
  generationConfig?: GenerationConfiguration
}

export interface ExportJob {
  id: string
  status: TaskStatus
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
  canvases?: ProjectCanvas[]
  activeCanvasId?: string
  challengeId?: string
  challengeTags?: string[]
}

export function createProject(title: string, intent: string): Project {
  const timestamp = new Date().toISOString()
  const canvasId = crypto.randomUUID()

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
    activeCanvasId: canvasId,
    canvases: [{
      id: canvasId,
      title: '画布 1',
      nodes: [],
      edges: [],
      groups: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      createdAt: timestamp,
      updatedAt: timestamp,
    }],
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
