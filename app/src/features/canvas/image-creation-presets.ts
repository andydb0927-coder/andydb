import type { ManagedAiPlaceholderId } from '../generation/model-provider-registry'
import { isImageAnalysisToolId } from '../generation/ark-image-analysis-provider'

export type ImageTemplateCategory = 'story' | 'texture' | 'space' | 'setting'

interface ImageAiPreset {
  providerId: ManagedAiPlaceholderId
  promptText: string
}

interface ImageCreationTemplate {
  label: string
  category: ImageTemplateCategory
  featured?: boolean
  ai?: ImageAiPreset
}

export const imageCreationTemplateColumns: ReadonlyArray<
  ReadonlyArray<{ title: string; items: readonly ImageCreationTemplate[] }>
> = [
  [
    {
      title: '分镜叙事',
      items: [
        { label: '调度故事板', category: 'story', featured: true },
        { label: '故事板', category: 'story', featured: true },
        { label: '25宫格连贯分镜', category: 'story', ai: {
          providerId: 'storyboard-25-grid-api',
          promptText: '将当前故事拆为25个时间连续、动作衔接、角色一致的电影分镜，覆盖远景、中景、近景与细节镜头。',
        } },
        { label: '剧情推演四宫格', category: 'story', ai: {
          providerId: 'plot-four-grid-api',
          promptText: '围绕同一角色与场景，按起因、发展、转折、结果输出四个连续剧情画面，保持人物与美术风格一致。',
        } },
        { label: '画面推演 - 3秒后', category: 'story' },
        { label: '画面推演 - 5秒前', category: 'story' },
      ],
    },
    {
      title: '质感调节',
      items: [
        { label: '人像质感调节', category: 'texture', featured: true },
        { label: '电影级光影校正', category: 'texture', ai: {
          providerId: 'cinematic-lighting-api',
          promptText: '保持主体与构图不变，使用电影级三点布光矫正：主光方向明确、辅光控制反差、轮廓光分离背景，高光不过曝。',
        } },
      ],
    },
  ],
  [
    {
      title: '空间与机位',
      items: [
        { label: '720全景', category: 'space', ai: {
          providerId: 'panorama-720-api',
          promptText: '将当前场景扩展为无缝等距柱状720全景，保持地平线水平、主体位置一致、左右边缘可连续拼接。',
        } },
        { label: '多机位九宫格', category: 'space', ai: {
          providerId: 'multi-camera-grid-api',
          promptText: '同一主体、同一服装与同一场景保持一致，输出九个连贯机位：正面、侧面、背面、俯拍、仰拍、近景、中景、全景与细节特写。',
        } },
      ],
    },
    {
      title: '设定图',
      items: [
        { label: '角色脸部三视图', category: 'setting', ai: {
          providerId: 'setting-image-api',
          promptText: '输出角色脸部正面、左侧面、右侧面三视图，保持五官比例、发型、妆容与光线一致，中性背景。',
        } },
        { label: '角色设定图', category: 'setting', ai: {
          providerId: 'setting-image-api',
          promptText: '输出标准角色设定图：全身正面、侧面、背面与服装细节，标注材质、色彩和比例，中性背景。',
        } },
        { label: '角色三视图', category: 'setting', ai: {
          providerId: 'setting-image-api',
          promptText: '输出角色全身正面、侧面、背面三视图，统一姿势、比例、服装、发型与光线，中性背景。',
        } },
        { label: '场景设定图', category: 'setting', ai: {
          providerId: 'setting-image-api',
          promptText: '输出场景设定图：全景、关键区域、材质和光线说明，保持空间比例与美术风格统一。',
        } },
        { label: '产品设定图', category: 'setting', ai: {
          providerId: 'setting-image-api',
          promptText: '输出产品正面、侧面、背面与结构细节设定图，标注材质、配色和尺寸关系，中性背景。',
        } },
      ],
    },
  ],
]

// Compatibility projection for existing Slash consumers; definitions only live above.
export const imageAiPlaceholderPresets: Record<string, ImageAiPreset> = Object.fromEntries(
  imageCreationTemplateColumns.flatMap(column => column.flatMap(group =>
    group.items.flatMap(item => item.ai ? [[item.label, item.ai] as const] : []),
  )),
)

export function imageAiPlaceholderForLabel(label: string) {
  return imageAiPlaceholderPresets[
    label as keyof typeof imageAiPlaceholderPresets
  ]
}


export function resolveImagePreset(label: string) {
  const preset = imageAiPlaceholderForLabel(label)
  if (!preset) return { kind: 'tool' as const, label }
  return { kind: isImageAnalysisToolId(preset.providerId) ? 'analysis' as const : 'placeholder' as const, label, ...preset }
}
