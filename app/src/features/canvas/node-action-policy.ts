import type { NodeKind } from '../project/model'
import { isCreativeCardKind } from '../project/creative-card'
import type { CreativeNodeAction } from './node-types'

export interface NodeActionSpec {
  action: CreativeNodeAction
  label: string
}

const existingPrimaryActions: NodeActionSpec[] = [
  { action: 'regenerate', label: '重生成' },
  { action: 'extend-shot', label: '扩展镜头' },
  { action: 'generate-video', label: '生成视频' },
]

export function primaryActionsForNode(
  kind: NodeKind,
  hasAsset: boolean,
): NodeActionSpec[] {
  if (isCreativeCardKind(kind)) {
    return [{ action: 'edit-card', label: '编辑卡片' }]
  }
  if (kind === 'text') {
    return [{ action: 'extend-shot', label: '生成分镜' }]
  }
  if (kind === 'image') {
    return [{ action: 'generate-video', label: '生成视频' }]
  }

  return (kind === 'video' || kind === 'storyboard') && hasAsset
    ? [
        ...existingPrimaryActions,
        { action: 'add-to-timeline', label: '加入时间线' },
      ]
    : [...existingPrimaryActions]
}
