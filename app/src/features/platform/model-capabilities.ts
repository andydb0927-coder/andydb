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
    description: '使用当前 DemoGenerationAdapter 生成本地示例图像，用于验证画布与版本流程。',
  },
  {
    id: 'demo-video-draft',
    kind: 'video',
    label: '演示视频草稿',
    status: '静态示意帧',
    description: '当前仅以本地静态示意帧验证视频节点流程，不输出真实视频文件。',
  },
]
