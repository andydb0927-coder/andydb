import type { PromptCommandContext } from './prompt-assist'

const structuredMarkers = ['主体与场景：', '镜头：', '光线：', '声音：'] as const

export function optimizePromptLocally(
  prompt: string,
  context: PromptCommandContext,
) {
  const trimmed = prompt.trim()
  if (!trimmed) return ''
  if (structuredMarkers.every((marker) => trimmed.includes(marker))) {
    return trimmed
  }
  const normalized = trimmed.replace(/\s+/g, ' ')

  const camera = context === 'video'
    ? '中景起拍，稳定缓慢前推，主体运动方向清晰，镜头衔接连续。'
    : '中景构图，主体位于视觉中心，前景与背景形成清晰空间层次。'
  const sound = context === 'video'
    ? '保留符合场景的环境声、动作声，背景音乐克制且不遮挡主体声音。'
    : '记录画面隐含的环境声与氛围线索，供后续视频或声音设计引用。'

  return [
    `主体与场景：${normalized}`,
    `镜头：${camera}`,
    '光线：主光方向明确，柔和轮廓光分离主体与背景，控制高光不过曝。',
    `声音：${sound}`,
  ].join('\n')
}
