export type ModelCapabilityKind = 'image' | 'video'

export interface ModelCapability {
  id: string
  kind: ModelCapabilityKind
  label: string
  status: string
  description: string
}

export const modelProviderStatus = 'LibTV 状态由本地实时目录决定'

export const modelCapabilities: ModelCapability[] = [
  {
    id: 'demo-image-draft',
    kind: 'image',
    label: '演示图像草稿',
    status: '本地草稿结果',
    description: '通过模型供应商注册表分发本地 Mock 图像，用于验证队列、计费、画布与版本回填。',
  },
  {
    id: 'demo-video-draft',
    kind: 'video',
    label: '演示视频草稿',
    status: '本地演示视频',
    description: '通过注册表分发可灵与 Seedance 风格 Mock，用本地视频验证进度、历史和导出流程。',
  },
]
