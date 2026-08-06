import { describe, expect, test } from 'vitest'

import { makeProjectFixture } from '../../test/fixtures'
import { useProjectStore } from '../project/project-store'
import { parseDirectorCommand } from './director-command'

describe('AI director command parser', () => {
  test('maps shot extension to the selected source node', () => {
    expect(
      parseDirectorCommand('扩展这个镜头', { selectedNodeId: 'shot-2' }),
    ).toEqual({
      type: 'extend-shot',
      sourceNodeId: 'shot-2',
    })
  })

  test('maps timeline insertion to the selected video node', () => {
    expect(
      parseDirectorCommand('把这个片段加入时间线', {
        selectedNodeId: 'video-2',
      }),
    ).toEqual({
      type: 'add-to-timeline',
      nodeId: 'video-2',
    })
  })

  test('returns three supported examples for unknown input without mutating the project', () => {
    const project = makeProjectFixture()
    useProjectStore.setState({
      projectsById: { [project.id]: project },
      activeProjectId: project.id,
      activeProject: project,
      past: [],
      future: [],
    })

    const command = parseDirectorCommand('让它更有感觉', {
      selectedNodeId: 'shot-1',
    })

    expect(command).toEqual({
      type: 'unknown',
      suggestion:
        '可以试试：扩展这个镜头；重新生成这个镜头；把这个片段加入时间线',
    })
    expect(useProjectStore.getState().activeProject).toBe(project)
  })

  test('parses remove and replace as explicit destructive commands', () => {
    expect(
      parseDirectorCommand('删除这个节点', { selectedNodeId: 'shot-2' }),
    ).toEqual({ type: 'remove-node', nodeId: 'shot-2' })
    expect(
      parseDirectorCommand('替换这个节点', { selectedNodeId: 'shot-2' }),
    ).toEqual({ type: 'replace-node', nodeId: 'shot-2' })
  })
})
