export interface SubjectAsset {
  id: string
  name: string
  description: string
  tags: string[]
  coverUrl: string
  sampleImages: string[]
  sourceAssetId?: string
  sourceProjectId?: string
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
