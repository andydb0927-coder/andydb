export interface ProjectFolder {
  id: string
  name: string
  normalizedName: string
  createdAt: string
  updatedAt: string
}

export interface ProjectLocation {
  projectId: string
  folderId?: string
  updatedAt: string
}
