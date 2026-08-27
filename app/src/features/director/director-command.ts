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

export function describeCommand(command: DirectorCommand) {
  switch (command.type) {
    case 'regenerate':
      return '重新生成所选节点，并保留当前版本。'
    case 'extend-shot':
      return '从所选节点扩展一个新的下游分镜。'
    case 'generate-video':
      return '从所选分镜生成一个新的下游视频节点。'
    case 'add-to-timeline':
      return '把所选片段加入时间线。'
    case 'remove-node':
      return '删除所选节点；相关下游内容会标记为来源已变更。'
    case 'replace-node':
      return '替换所选节点的内容，并保留旧版本。'
    case 'unknown':
      return command.suggestion
  }
}
