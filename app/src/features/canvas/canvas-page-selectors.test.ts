import { expect, test } from 'vitest'
import { makeProjectFixture } from '../../test/fixtures'
import { downstreamConsumers, sameSelection } from './canvas-page-selectors'
import type { LibTvProviderSelection } from '../generation/libtv-contract'

test('downstream traversal tolerates cycles, deduplicates and keeps project node order', () => {
  const project = makeProjectFixture()
  project.nodes.push({ ...project.nodes[0], id: 'third', title: '第三个' })
  project.edges.push({ id: 'back', sourceNodeId: 'rain-audio', targetNodeId: 'shot-1' }, { id: 'branch', sourceNodeId: 'shot-1', targetNodeId: 'third' }, { id: 'repeat', sourceNodeId: 'rain-audio', targetNodeId: 'third' })
  const before = JSON.stringify(project)
  expect(downstreamConsumers(project, 'shot-1').map(node => node.id)).toEqual(['rain-audio', 'third'])
  expect(downstreamConsumers(project, 'third')).toEqual([])
  expect(JSON.stringify(project)).toBe(before)
})

test('provider confirmation identity compares all six pinned selection fields', () => {
  const selection: LibTvProviderSelection = { projectUuid: 'project', projectName: '项目', imageModelKey: 'image', imageModelName: '图片', videoModelKey: 'video', videoModelName: '视频' }
  expect(sameSelection(selection, { ...selection })).toBe(true)
  for (const key of Object.keys(selection) as Array<keyof LibTvProviderSelection>) {
    expect(sameSelection(selection, { ...selection, [key]: 'changed' })).toBe(false)
  }
})
