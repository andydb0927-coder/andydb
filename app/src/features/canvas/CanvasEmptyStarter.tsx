import {
  AudioLines,
  BookOpenText,
  ContactRound,
  Images,
  MousePointer2,
} from 'lucide-react'

import type { QuickNodeType } from './CanvasNodeTypePicker'

const starterOptions: ReadonlyArray<{
  type: QuickNodeType
  label: string
  badge?: string
  tone: 'story' | 'character' | 'reference' | 'audio'
  icon: typeof BookOpenText
}> = [
  {
    type: 'script-generator',
    label: '故事脚本生成',
    tone: 'story',
    icon: BookOpenText,
  },
  {
    type: 'character-turnaround',
    label: '角色三视图',
    tone: 'character',
    icon: ContactRound,
  },
  {
    type: 'reference-video',
    label: '全能参考生视频',
    badge: '需配置',
    tone: 'reference',
    icon: Images,
  },
  {
    type: 'audio-video',
    label: '音频生视频',
    badge: '需配置',
    tone: 'audio',
    icon: AudioLines,
  },
]

export function CanvasEmptyStarter({
  disabled = false,
  onSelect,
}: {
  disabled?: boolean
  onSelect(type: QuickNodeType): void
}) {
  return (
    <section
      className="canvas-empty-starter"
      role="region"
      aria-label="开始创作"
    >
      <p className="canvas-empty-starter__hint">
        <MousePointer2 aria-hidden="true" />
        <strong>双击画布</strong>
        <span>自由生成节点</span>
      </p>
      <div className="canvas-empty-starter__options">
        {starterOptions.map(({ type, label, badge, tone, icon: Icon }) => (
          <button
            key={type}
            type="button"
            aria-label={badge ? `${label} ${badge}` : label}
            data-tone={tone}
            disabled={disabled}
            onClick={() => onSelect(type)}
          >
            <span className="canvas-empty-starter__icon">
              <Icon aria-hidden="true" />
            </span>
            <strong>{label}</strong>
            {badge ? <em>{badge}</em> : null}
          </button>
        ))}
      </div>
    </section>
  )
}
