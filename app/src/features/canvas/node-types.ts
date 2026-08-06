import type { Node } from '@xyflow/react'

import type {
  Asset,
  CanvasNode,
  GenerationJob,
  NodeKind,
} from '../project/model'
import { AssetNode } from './nodes/AssetNode'
import { PreviewNode } from './nodes/PreviewNode'
import { StoryboardNode } from './nodes/StoryboardNode'
import { VideoNode } from './nodes/VideoNode'

export type CreativeNodeAction =
  | 'regenerate'
  | 'extend-shot'
  | 'generate-video'
  | 'add-to-timeline'

export interface CreativeNodeProps {
  node: CanvasNode
  selected: boolean
  job?: GenerationJob
  onAction(action: CreativeNodeAction): void
}

export interface CreativeNodeData extends Record<string, unknown>, CreativeNodeProps {
  asset?: Asset
  actionsPlacement: 'before' | 'after'
  onSelect(): void
  onDelete(trigger: HTMLButtonElement): void
}

export type CreativeFlowNode = Node<CreativeNodeData, NodeKind>

export const nodeTypes = {
  character: AssetNode,
  scene: AssetNode,
  storyboard: StoryboardNode,
  video: VideoNode,
  preview: PreviewNode,
}
