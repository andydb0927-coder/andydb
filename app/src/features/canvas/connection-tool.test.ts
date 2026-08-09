import { expect, test } from 'vitest'

import {
  cancelConnectionTool,
  chooseConnectionNode,
  startConnectionTool,
} from './connection-tool'

test('selects a source and then emits one source-target pair', () => {
  const started = startConnectionTool()
  const source = chooseConnectionNode(started, 'character')

  expect(source).toEqual({
    state: { phase: 'selecting-target', sourceNodeId: 'character' },
  })
  expect(chooseConnectionNode(source.state, 'storyboard')).toEqual({
    state: source.state,
    connection: { sourceNodeId: 'character', targetNodeId: 'storyboard' },
  })
  expect(cancelConnectionTool()).toEqual({ phase: 'idle' })
})
