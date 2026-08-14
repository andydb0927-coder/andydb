import type { Node } from '@xyflow/react'

import type {
  Asset,
  CanvasNode,
  GenerationJob,
  NodeKind,
  VideoDerivedTool,
} from '../project/model'
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
  asset?: Asset
  imageResults?: Array<{ id: string; asset: Asset }>
  videoReferences?: Array<{ id: string; title: string; asset: Asset }>
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
  onSetActiveResult?(resultId: string): void
  onLocalImageGenerate?(): void
  onCreateVideoToolNode?(tool: VideoDerivedTool): void
  onLocalVideoGenerate?(): void
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
