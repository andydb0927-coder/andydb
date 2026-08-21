import type { Node } from '@xyflow/react'

import type {
  Asset,
  CanvasNode,
  CanvasNodeDetails,
  EffectToolConfig,
  GenerationJob,
  ImageGenerationSettings,
  NodeKind,
  VideoDerivedTool,
} from '../project/model'
import type { ProviderRegistry } from '../generation/model-provider-registry'
import { AssetNode } from './nodes/AssetNode'
import { CreativeCardNode } from './nodes/CreativeCardNode'
import { PreviewNode } from './nodes/PreviewNode'
import { StoryboardNode } from './nodes/StoryboardNode'
import { VideoNode } from './nodes/VideoNode'

export type CreativeNodeAction =
  | 'edit-card'
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
  onStartImageReferenceSelection?(trigger: HTMLButtonElement): void
  onEndImageReferenceSelection?(returnToNode: boolean): void
  onLocalImageGenerate?(): void
  onCreateImageToolNode?(tool: string): void
  onCreateVideoToolNode?(tool: VideoDerivedTool): void
  onLocalVideoGenerate?(): void
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
