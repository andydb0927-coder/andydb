import { withAppBase } from '../../app/public-url'
import type { GenerationRequest } from '../generation/generation-adapter'
import type { AppliedStyle } from '../project/model'
export type { AppliedStyle } from '../project/model'

export type StyleTarget = 'image' | 'video' | 'text'
export interface StyleCard extends AppliedStyle {
  author: string
  heat: string
  commercial: boolean
  model: string
  category: string
  cover?: string
  custom?: boolean
}
export interface StylePreference { id: string; favorite: boolean; lastUsedAt?: string }
export const styleCategories = ['推荐', '摄影写真', '电商营销', '动漫游戏', '风格插画', '平面设计', '建筑及室内设计', '创意玩法', '文创周边', '小说推文'] as const

// These are editable prompt templates, not model weights or trained styles.
export const builtInStyles: StyleCard[] = [
  { id: 'comic-character-sheet', name: 'J_漫剧素材三视图', author: 'JM32', heat: '4900', commercial: true, model: 'Style Image V8.2', category: '动漫游戏', cover: withAppBase('/demo/character-lin-yuan.png'), promptFragment: '采用漫剧角色设定风格：清晰轮廓、统一角色比例与服装细节，叙事表达简洁。', compatibility: { targetKinds: ['image', 'video', 'text'] } },
  { id: 'balanced-boy', name: '男生·三庭五眼比例均衡', author: '小小苏', heat: '415', commercial: true, model: 'Z Image', category: '摄影写真', cover: withAppBase('/demo/shot-rooftop.png'), promptFragment: '采用自然人像写真风格：面部比例均衡、柔和自然光、真实皮肤细节，避免过度修饰。', compatibility: { targetKinds: ['image', 'video', 'text'] } },
  { id: 'commerce-key-visual', name: '全网免费电商主图', author: '楚逸AICG', heat: '250', commercial: true, model: 'Qwen Image', category: '电商营销', cover: withAppBase('/demo/scene-rain-street.png'), promptFragment: '采用电商主视觉风格：突出产品主体，干净背景，清晰材质与精确轮廓，表达直接。', compatibility: { targetKinds: ['image', 'video', 'text'] } },
  { id: 'portrait-film', name: 'Z-Image 人像写真', author: '光影研究所', heat: '1.8w', commercial: false, model: 'Z Image', category: '摄影写真', cover: withAppBase('/demo/shot-river.png'), promptFragment: '采用电影人像风格：克制情绪、低饱和色彩、柔和侧光、细腻胶片颗粒。', compatibility: { targetKinds: ['image', 'video', 'text'] } },
  { id: 'render-poster', name: '3D 电商渲染级 KV 海报', author: '立体造物', heat: '21.6w', commercial: true, model: 'Lib Image', category: '平面设计', cover: withAppBase('/demo/scene-rain-street.png'), promptFragment: '采用三维产品海报风格：层次分明、精致材质、柔和轮廓光，主体与背景对比明确。', compatibility: { targetKinds: ['image', 'video', 'text'] } },
  { id: 'storyboard-sheet', name: '分镜脚本故事版分镜', author: '镜头簿', heat: '1500', commercial: true, model: 'Lib Image', category: '小说推文', cover: withAppBase('/demo/shot-rooftop.png'), promptFragment: '采用分镜故事板风格：明确景别、机位与角色行动，保持场景连续性，逐镜叙事。', compatibility: { targetKinds: ['image', 'text'] } },
]

export function isAppliedStyle(value: unknown): value is AppliedStyle {
  if (!value || typeof value !== 'object') return false
  const card = value as Partial<AppliedStyle>
  return typeof card.id === 'string' && Boolean(card.id.trim()) &&
    typeof card.name === 'string' && Boolean(card.name.trim()) && card.name.length <= 80 &&
    typeof card.promptFragment === 'string' && Boolean(card.promptFragment.trim()) && card.promptFragment.length <= 2000 &&
    Array.isArray(card.compatibility?.targetKinds) && card.compatibility.targetKinds.length > 0 &&
    card.compatibility.targetKinds.every(kind => ['image', 'video', 'text'].includes(kind)) &&
    (card.compatibility.providerIds === undefined ||
      (Array.isArray(card.compatibility.providerIds) && card.compatibility.providerIds.every(id => typeof id === 'string' && Boolean(id.trim()))))
}

export function styleSnapshot(card: AppliedStyle): AppliedStyle {
  if (!isAppliedStyle(card)) throw new Error('风格配置无效，请重新选择风格。')
  return { id: card.id, name: card.name, promptFragment: card.promptFragment,
    compatibility: { targetKinds: [...card.compatibility.targetKinds],
      ...(card.compatibility.providerIds ? { providerIds: [...card.compatibility.providerIds] } : {}) } }
}

export function styleCompatibilityReason(style: AppliedStyle, target: string, providerId?: string) {
  if (!isAppliedStyle(style)) return '风格配置无效，请重新选择风格。'
  if (!style.compatibility.targetKinds.some(kind => kind === target) ||
    (style.compatibility.providerIds && !style.compatibility.providerIds.includes(providerId ?? ''))) {
    return `风格「${style.name}」与当前模型或生成类型不兼容，请移除风格或重新选择。`
  }
  return undefined
}

/** Dispatch-only transformation. Never write this transformed prompt into an editor/job. */
export function prepareStyledRequest(request: GenerationRequest): GenerationRequest {
  if (!request.style) return request
  const reason = styleCompatibilityReason(request.style, request.targetKind, request.providerId)
  if (reason) throw new Error(reason)
  return request.targetKind === 'text'
    ? { ...request, systemPromptPrefix: request.style.promptFragment }
    : { ...request, prompt: `${request.style.promptFragment}\n\n${request.prompt}` }
}

/** Retrying an existing job uses the confirmed snapshot, not a newly selected style. */
export function restoreTaskStyle(request: GenerationRequest, style?: AppliedStyle): GenerationRequest {
  const restored = { ...request }
  if (style) restored.style = styleSnapshot(style)
  else delete restored.style
  return restored
}
