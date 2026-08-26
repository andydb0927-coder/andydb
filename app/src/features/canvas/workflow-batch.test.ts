import { describe, expect, test } from 'vitest'

import { makeProjectFixture } from '../../test/fixtures'
import { createWorkflowBatchPlan } from './workflow-batch'

describe('workflow batch plan', () => {
  test('orders a selected group by dependencies instead of canvas order', () => {
    const project = makeProjectFixture()
    const third = {
      ...project.nodes[0],
      id: 'third-node',
      title: '第三节点',
      position: { x: 800, y: 80 },
    }
    project.nodes = [...project.nodes, third]
    const nodeIds = project.nodes.slice(0, 3).map(({ id }) => id)
    project.edges = [
      {
        id: 'edge-b-c',
        sourceNodeId: nodeIds[1],
        targetNodeId: nodeIds[2],
      },
      {
        id: 'edge-a-b',
        sourceNodeId: nodeIds[0],
        targetNodeId: nodeIds[1],
      },
    ]
    project.nodes = [project.nodes[2], project.nodes[0], project.nodes[1]]

    expect(createWorkflowBatchPlan(project, nodeIds)).toEqual({
      ok: true,
      nodeIds,
    })
  })

  test('rejects cycles and dangling dependency endpoints before enqueueing', () => {
    const project = makeProjectFixture()
    const [a, b] = project.nodes.slice(0, 2).map(({ id }) => id)
    project.edges = [
      { id: 'edge-a-b', sourceNodeId: a, targetNodeId: b },
      { id: 'edge-b-a', sourceNodeId: b, targetNodeId: a },
    ]
    expect(createWorkflowBatchPlan(project, [a, b])).toEqual({
      ok: false,
      reason: '依赖关系存在循环，请先断开循环连线。',
    })

    project.edges = [
      { id: 'edge-missing', sourceNodeId: 'missing', targetNodeId: a },
    ]
    expect(createWorkflowBatchPlan(project)).toEqual({
      ok: false,
      reason: '连线 edge-missing 指向不存在的节点。',
    })
  })
})
