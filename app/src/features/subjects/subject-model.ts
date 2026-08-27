import type { GenerationUsage } from '../generation/generation-adapter'

export interface SubjectVisualDescription {
  name: string
  appearance: string
  clothing: string
  tags: string[]
}

export interface SubjectExtractionMetadata {
  appearance: string
  clothing: string
  providerId: string
  modelName: string
  extractedAt: string
  usage?: GenerationUsage
}

export type SubjectExtractionDraft = SubjectVisualDescription & SubjectExtractionMetadata

export interface SubjectAsset {
  id: string
  name: string
  description: string
  tags: string[]
  coverUrl: string
  sampleImages: string[]
  sourceAssetId?: string
  sourceProjectId?: string
  aiExtraction?: SubjectExtractionMetadata
  createdAt: string
  updatedAt: string
}

export interface CreateSubjectInput {
  name: string
  description: string
  tags: string[]
  coverUrl: string
  sampleImages: string[]
  sourceAssetId?: string
  sourceProjectId?: string
  aiExtraction?: SubjectExtractionMetadata
}

export function normalizeSubjectTags(values: string[]): string[] {
  const tags: string[] = []
  for (const value of values) {
    const tag = value.trim().slice(0, 16)
    if (!tag || tags.includes(tag)) continue
    tags.push(tag)
    if (tags.length === 8) break
  }
  return tags
}
