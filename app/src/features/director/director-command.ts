export interface DirectorContext {
  selectedNodeId?: string
}

export type DirectorCommand =
  | { type: 'regenerate'; nodeId: string }
  | { type: 'extend-shot'; sourceNodeId: string }
  | { type: 'generate-video'; sourceNodeId: string }
  | { type: 'add-to-timeline'; nodeId: string }
  | { type: 'remove-node'; nodeId: string }
  | { type: 'replace-node'; nodeId: string }
  | { type: 'unknown'; suggestion: string }

const UNKNOWN_COMMAND: DirectorCommand = {
  type: 'unknown',
  suggestion:
    '可以试试：扩展这个镜头；重新生成这个镜头；把这个片段加入时间线',
}

export function parseDirectorCommand(
  input: string,
  context: DirectorContext,
): DirectorCommand {
  const nodeId = context.selectedNodeId
  if (!nodeId) return UNKNOWN_COMMAND

  switch (input.trim()) {
    case '扩展这个镜头':
      return { type: 'extend-shot', sourceNodeId: nodeId }
    case '重新生成这个镜头':
    case '重生成这个镜头':
      return { type: 'regenerate', nodeId }
    case '把这个镜头生成视频':
    case '生成这个镜头的视频':
      return { type: 'generate-video', sourceNodeId: nodeId }
    case '把这个片段加入时间线':
      return { type: 'add-to-timeline', nodeId }
    case '删除这个节点':
      return { type: 'remove-node', nodeId }
    case '替换这个节点':
      return { type: 'replace-node', nodeId }
    default:
      return UNKNOWN_COMMAND
  }
}
