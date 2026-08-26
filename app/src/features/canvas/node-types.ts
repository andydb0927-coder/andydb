import type { Node } from '@xyflow/react'

import type {
  Asset,
  CanvasNode,
  CanvasNodeDetails,
  EffectToolConfig,
  GenerationJob,
  ImageGenerationSettings,
  ImageAnnotation,
  ImageToolConfig,
  NodeKind,
  VideoDerivedTool,
} from '../project/model'
import type {
  AudioSliceOptions,
  ImageGridSize,
  VideoSegmentOptions,
} from '../media/browser-media-processing'
import type { ProviderRegistry } from '../generation/model-provider-registry'
import type { AutoLinkCandidate } from './prompt-assist'
import { AssetNode } from './nodes/AssetNode'
import { CreativeCardNode } from './nodes/CreativeCardNode'
import { PreviewNode } from './nodes/PreviewNode'
import { StoryboardNode } from './nodes/StoryboardNode'
import { VideoNode } from './nodes/VideoNode'

export type CreativeNodeAction =
  | 'edit-card'
  | 'generate'
  | 'regenerate'
  | 'extend-shot'
  | 'generate-video'
  | 'add-to-timeline'
  | 'cancel-generation'
  | 'retry-generation'

export interface CreativeNodeProps {
  node: CanvasNode
  selected: boolean
  job?: GenerationJob
  onAction(action: CreativeNodeAction, trigger?: HTMLButtonElement): void
}

export interface CreativeNodeData extends Record<string, unknown>, CreativeNodeProps {
  providerRegistry?: ProviderRegistry
  asset?: Asset
  imageResults?: Array<{ id: string; asset: Asset }>
  imageReferences?: Array<{ id: string; title: string; asset: Asset }>
  videoReferences?: Array<{ id: string; title: string; asset: Asset }>
  incomingReferenceCount?: number
  autoLinkCandidates?: AutoLinkCandidate[]
  linkedAutoLinkNodeIds?: string[]
  imageReferenceSelecting?: boolean
  actionsPlacement: 'before' | 'after'
  contextual: boolean
  connectionMode: boolean
  connectionSource: boolean
  focusOnMount: boolean
  focusRequestVersion: number
  onSelect(): void
  onHandleActivate(type: 'source' | 'target', trigger: HTMLElement): void
  onFocusComplete(): void
  onDelete(trigger: HTMLButtonElement): void
  onRenameNode?(title: string): void
  onSetActiveResult?(resultId: string): void
  onUpdateImageGenerationSettings?(
    settings: Partial<ImageGenerationSettings>,
  ): void
  onSelectModelProvider?(providerId: string): void
  onUpdateVideoGenerationParameters?(
    parameters: Record<string, string | number | boolean>,
  ): void
  onUpdateVideoPrompt?(prompt: string): void
  onCreatePromptNode?(kind: Extract<NodeKind, 'image' | 'storyboard' | 'video'>): void
  onApplyAutoLink?(candidate: AutoLinkCandidate): void
  onStartImageReferenceSelection?(trigger: HTMLButtonElement): void
  onEndImageReferenceSelection?(returnToNode: boolean): void
  onImportImageReference?(file: File): void
  onLocalImageGenerate?(prompt: string): void
  onCreateImageToolNode?(tool: string): void
  onUpdateImageTool?(changes: Partial<ImageToolConfig>): void
  onCreateVideoToolNode?(tool: VideoDerivedTool): void
  onCaptureVideoFrame?(
    tool: Extract<VideoDerivedTool, '截取首帧' | '截取尾帧' | '截取当前帧'>,
    video: HTMLVideoElement,
    seconds: number,
  ): Promise<void> | void
  onProcessVideo?(options: VideoSegmentOptions): Promise<void> | void
  onExtractVideoAudio?(): Promise<void> | void
  onProcessAudio?(options: AudioSliceOptions): Promise<void> | void
  onSplitImage?(grid: ImageGridSize, group: boolean): Promise<void> | void
  onSaveImageAnnotations?(annotations: ImageAnnotation[]): void
  onMirrorImage?(axis: 'horizontal' | 'vertical'): void
  onLocalVideoGenerate?(prompt: string): void
  onGenerateText?(
    details: Extract<CanvasNodeDetails, { type: 'text' | 'script' }>,
    prompt: string,
  ): void
  onCreateTextToVideoPreset?(): void
  onUpdateEffectTool?(changes: Partial<EffectToolConfig>): void
  onUpdateNodeDetails?(details: CanvasNodeDetails): void
}

export type CreativeFlowNode = Node<CreativeNodeData, NodeKind>

export const nodeTypes = {
  character: AssetNode,
  'character-card': CreativeCardNode,
  scene: AssetNode,
  script: CreativeCardNode,
  text: AssetNode,
  image: AssetNode,
  storyboard: StoryboardNode,
  video: VideoNode,
  preview: PreviewNode,
  worldview: CreativeCardNode,
}
