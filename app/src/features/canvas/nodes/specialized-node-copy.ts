import type { CanvasNodeDetails } from '../../project/model'

export const specializedNodeTypeCopy: Record<CanvasNodeDetails['type'], string> = {
  text: '文本节点',
  script: '脚本节点',
  audio: '音频节点',
  director: '导演台节点',
  'frame-analysis': '逐帧拉片节点',
  'smart-edit': '智能剪辑节点',
}
