import type {
  Asset,
  GenerationOperation,
  NodeVersion,
} from '../project/model'

export interface GenerationReference {
  url: string
  kind: 'image' | 'video' | 'audio'
  mimeType: string
}

export interface GenerationRequest {
  projectId: string
  nodeId: string
  operation: GenerationOperation
  targetKind: 'image' | 'video'
  prompt: string
  referenceAssets: GenerationReference[]
}

export interface GenerationResult {
  version: NodeVersion
  asset: Asset
}

export interface GenerationAdapter {
  start(
    request: GenerationRequest,
    signal: AbortSignal,
  ): Promise<GenerationResult>
}
