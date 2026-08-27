import type { ImageGenerationSettings, NodeKind } from '../project/model'
import type { ManagedAiPlaceholderId } from '../generation/model-provider-registry'
import { imageAiPlaceholderPresets } from './image-creation-presets'
export { imageAiPlaceholderPresets, imageAiPlaceholderForLabel } from './image-creation-presets'

export type PromptCommandContext = 'image' | 'video'
export type PromptCommandSection = 'preset' | 'tool' | 'parameter'

export interface PromptCommand {
  id: string
  context: PromptCommandContext
  section: PromptCommandSection
  slash: string
  label: string
  description: string
  promptText?: string
  imageSettings?: Partial<ImageGenerationSettings>
  videoParameters?: Record<string, string | number | boolean>
  createNodeKind?: Extract<NodeKind, 'image' | 'storyboard' | 'video'>
  aiProviderId?: ManagedAiPlaceholderId
}

export interface PromptCommandResult {
  prompt: string
  imageSettings?: Partial<ImageGenerationSettings>
  videoParameters?: Record<string, string | number | boolean>
  createNodeKind?: PromptCommand['createNodeKind']
}

export interface AutoLinkCandidate {
  nodeId: string
  title: string
  kind: NodeKind
  tags: string[]
  assetId?: string
}

export const promptCommandSectionLabels: Record<PromptCommandSection, string> = {
  preset: '预设',
  tool: '工具命令',
  parameter: '参数预览',
}

const promptCommands: PromptCommand[] = [
  {
    id: 'image-cinematic',
    context: 'image',
    section: 'preset',
    slash: '电影感',
    label: '电影感生图预设',
    description: '插入电影感光影与构图描述',
    promptText: '电影感构图，柔和体积光，细腻影调，',
    imageSettings: { quality: '高画质', resolution: '2K' },
  },
  {
    id: 'image-reference-node',
    context: 'image',
    section: 'tool',
    slash: '参考节点',
    label: '插入参考图片节点',
    description: '在当前节点左侧创建一个空图片参考节点',
    promptText: '@待选参考图 ',
    createNodeKind: 'image',
  },
  {
    id: 'image-ai-nine-grid',
    context: 'image',
    section: 'preset',
    slash: '九宫格',
    label: '九宫格分镜预设',
    description: 'Seedream 串行9张，打开逐格提示词与总成本确认',
    promptText: imageAiPlaceholderPresets['多机位九宫格'].promptText,
    aiProviderId: imageAiPlaceholderPresets['多机位九宫格'].providerId,
  },
  {
    id: 'image-ai-four-grid',
    context: 'image',
    section: 'preset',
    slash: '四宫格',
    label: '剧情推演四宫格预设',
    description: '本地剧情模板 + Seedream 串行4张，确认后执行',
    promptText: imageAiPlaceholderPresets['剧情推演四宫格'].promptText,
    aiProviderId: imageAiPlaceholderPresets['剧情推演四宫格'].providerId,
  },
  {
    id: 'image-ai-25-grid',
    context: 'image',
    section: 'preset',
    slash: '25宫格',
    label: '25宫格连贯分镜预设',
    description: '本地机位模板 + Seedream 串行25张，确认整组费用',
    promptText: imageAiPlaceholderPresets['25宫格连贯分镜'].promptText,
    aiProviderId: imageAiPlaceholderPresets['25宫格连贯分镜'].providerId,
  },
  {
    id: 'image-ai-lighting',
    context: 'image',
    section: 'preset',
    slash: '光影',
    label: '电影级光影矫正预设',
    description: '参考图光影重绘，可提示框选区域，确认后执行',
    promptText: imageAiPlaceholderPresets['电影级光影校正'].promptText,
    aiProviderId: imageAiPlaceholderPresets['电影级光影校正'].providerId,
  },
  {
    id: 'image-ai-setting',
    context: 'image',
    section: 'preset',
    slash: '设定图',
    label: '角色与场景设定图预设',
    description: '统一设定图版式与视角，AI 服务待接入',
    promptText: imageAiPlaceholderPresets['角色设定图'].promptText,
    aiProviderId: imageAiPlaceholderPresets['角色设定图'].providerId,
  },
  {
    id: 'image-portrait',
    context: 'image',
    section: 'parameter',
    slash: '竖屏',
    label: '竖屏 9:16 参数',
    description: '9:16 · 2K · 1张',
    promptText: '竖屏电影构图，',
    imageSettings: { aspectRatio: '9:16', resolution: '2K', count: 1 },
  },
  {
    id: 'image-four',
    context: 'image',
    section: 'parameter',
    slash: '四张',
    label: '四张结果参数',
    description: '生成数量 4张，结果使用 2×2 网格',
    imageSettings: { count: 4 },
  },
  {
    id: 'video-cinematic',
    context: 'video',
    section: 'preset',
    slash: '运镜',
    label: '电影运镜预设',
    description: '插入稳定前推、景深与光影描述',
    promptText: '摄影机稳定缓慢前推，浅景深，光影自然过渡，',
  },
  {
    id: 'video-storyboard-node',
    context: 'video',
    section: 'tool',
    slash: '分镜节点',
    label: '插入分镜预设节点',
    description: '创建分镜节点作为视频上游',
    promptText: '@待编辑分镜 ',
    createNodeKind: 'storyboard',
  },
  {
    id: 'video-short',
    context: 'video',
    section: 'parameter',
    slash: '短片',
    label: '5秒竖屏短片参数',
    description: '9:16 · 5s · 1080P · 声音开启',
    videoParameters: {
      aspectRatio: '9:16',
      duration: '5',
      quality: '1080P',
      sound: true,
    },
  },
]

export function promptCommandsFor(context: PromptCommandContext) {
  return promptCommands.filter((command) => command.context === context)
}

export function slashQuery(value: string): string | undefined {
  const slashIndex = value.lastIndexOf('/')
  if (slashIndex < 0) return undefined
  const query = value.slice(slashIndex + 1)
  if (query.includes('\n')) return undefined
  return query.trim()
}

export function replaceSlashQuery(value: string, replacement: string) {
  const slashIndex = value.lastIndexOf('/')
  if (slashIndex < 0) return `${value}${replacement}`
  return `${value.slice(0, slashIndex)}${replacement}`
}

export function filterPromptCommands(
  context: PromptCommandContext,
  query: string,
) {
  const normalized = query.trim().toLocaleLowerCase()
  return promptCommandsFor(context).filter((command) =>
    !normalized ||
    `${command.slash} ${command.label} ${command.description}`
      .toLocaleLowerCase()
      .includes(normalized),
  )
}

export function executePromptCommand(
  command: PromptCommand,
  currentPrompt: string,
): PromptCommandResult {
  const prompt = command.promptText
    ? replaceSlashQuery(currentPrompt, command.promptText)
    : currentPrompt.slice(0, Math.max(0, currentPrompt.lastIndexOf('/')))
  return {
    prompt,
    ...(command.imageSettings ? { imageSettings: { ...command.imageSettings } } : {}),
    ...(command.videoParameters ? { videoParameters: { ...command.videoParameters } } : {}),
    ...(command.createNodeKind ? { createNodeKind: command.createNodeKind } : {}),
  }
}

function normalizedTerms(value: string) {
  return value
    .toLocaleLowerCase()
    .split(/[\s,，。.!！?？、;；:：@]+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2)
}

export function matchAutoLinkCandidates(
  prompt: string,
  candidates: readonly AutoLinkCandidate[],
  excludedNodeIds: ReadonlySet<string> = new Set(),
) {
  const terms = normalizedTerms(prompt)
  if (terms.length === 0) return []
  const normalizedPrompt = prompt.toLocaleLowerCase()
  return candidates
    .filter((candidate) =>
      !excludedNodeIds.has(candidate.nodeId) &&
      !prompt.includes(`@${candidate.title}`),
    )
    .map((candidate) => {
      const title = candidate.title.toLocaleLowerCase()
      const haystack = [candidate.title, ...candidate.tags]
        .join(' ')
        .toLocaleLowerCase()
      const termScore = terms.reduce(
        (total, term) => total + (title.includes(term) ? 4 : haystack.includes(term) ? 1 : 0),
        0,
      )
      const embeddedScore = [candidate.title, ...candidate.tags].reduce((total, value) => {
        const normalized = value.toLocaleLowerCase()
        return total + (normalized.length >= 2 && normalizedPrompt.includes(normalized)
          ? value === candidate.title ? 4 : 1
          : 0)
      }, 0)
      return { ...candidate, score: termScore + embeddedScore }
    })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title))
    .slice(0, 5)
}

export function insertAutoLinkMention(prompt: string, title: string) {
  const separator = prompt && !/\s$/.test(prompt) ? ' ' : ''
  return `${prompt}${separator}@${title} `
}
