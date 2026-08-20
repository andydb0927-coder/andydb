import type { NodeKind } from '../project/model'
import { isCreativeCardKind } from '../project/creative-card'

export interface NodeActionSpec {
  action: 'edit-card' | 'add-to-timeline'
  label: string
}

export function primaryActionsForNode(
  kind: NodeKind,
  hasAsset: boolean,
): NodeActionSpec[] {
  if (isCreativeCardKind(kind)) {
    return [{ action: 'edit-card', label: '编辑卡片' }]
  }
  return (kind === 'video' || kind === 'storyboard') && hasAsset
    ? [{ action: 'add-to-timeline', label: '加入时间线' }]
    : []
}
