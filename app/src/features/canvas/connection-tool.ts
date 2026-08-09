export type ConnectionToolState =
  | { phase: 'idle' }
  | { phase: 'selecting-source' }
  | { phase: 'selecting-target'; sourceNodeId: string }

export function startConnectionTool(): ConnectionToolState {
  return { phase: 'selecting-source' }
}

export function cancelConnectionTool(): ConnectionToolState {
  return { phase: 'idle' }
}

export function chooseConnectionNode(
  state: ConnectionToolState,
  nodeId: string,
): {
  state: ConnectionToolState
  connection?: { sourceNodeId: string; targetNodeId: string }
} {
  if (state.phase === 'selecting-source') {
    return { state: { phase: 'selecting-target', sourceNodeId: nodeId } }
  }
  if (state.phase === 'selecting-target') {
    return {
      state,
      connection: { sourceNodeId: state.sourceNodeId, targetNodeId: nodeId },
    }
  }
  return { state }
}
