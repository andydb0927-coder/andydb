import { expect, test, vi } from 'vitest'

import { makeProjectFixture } from '../../test/fixtures'
import {
  buildPublishedWorkShareUrl,
  collectPublishCoverOptions,
  copyPublishedWorkShareLink,
} from './publication'

test('collects every image node result as a selectable publication cover', () => {
  const project = makeProjectFixture()
  project.nodes[0] = {
    ...project.nodes[0],
    imageResults: [{ id: 'result-river', assetId: 'asset-shot-river-v1' }],
    activeResultId: 'result-river',
  }

  expect(collectPublishCoverOptions(project)).toEqual([
    {
      id: 'result-river',
      nodeId: 'shot-1',
      label: '河岸寻人 · 结果 1',
      url: '/demo/shot-river.png',
    },
  ])
})

test('copies the fixed GitHub Pages share URL', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  const url = await copyPublishedWorkShareLink('work-local-1', { writeText })

  expect(url).toBe('https://andydb0927-coder.github.io/andydb/view/work-local-1')
  expect(buildPublishedWorkShareUrl('work local')).toBe(
    'https://andydb0927-coder.github.io/andydb/view/work%20local',
  )
  expect(writeText).toHaveBeenCalledWith(url)
})
