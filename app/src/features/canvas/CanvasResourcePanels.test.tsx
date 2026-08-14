import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import type { Project } from '../project/model'
import {
  AssetLibraryPanel,
  CharacterLibraryPanel,
  EffectToolboxPanel,
} from './CanvasResourcePanels'

const project: Project = {
  id: 'resource-project',
  title: '资源库验收',
  intent: '本地演示',
  createdAt: '2026-08-15T00:00:00.000Z',
  updatedAt: '2026-08-15T00:00:00.000Z',
  assets: [
    {
      id: 'asset-rain',
      kind: 'image',
      url: '/demo/scene-rain-street.png',
      mimeType: 'image/png',
      width: 1600,
      height: 900,
    },
    {
      id: 'asset-video',
      kind: 'video',
      url: '/demo/demo-video.mp4',
      mimeType: 'video/mp4',
      durationSeconds: 5,
    },
  ],
  nodes: [
    {
      id: 'rain-node',
      kind: 'scene',
      title: '雨夜长街',
      position: { x: 0, y: 0 },
      versions: [{
        id: 'rain-version',
        createdAt: '2026-08-15T00:00:00.000Z',
        prompt: '雨夜街景',
        assetId: 'asset-rain',
      }],
      activeVersionId: 'rain-version',
      sourceChanged: false,
    },
    {
      id: 'video-node',
      kind: 'video',
      title: '追逐片段',
      position: { x: 320, y: 0 },
      versions: [{
        id: 'video-version',
        createdAt: '2026-08-15T00:01:00.000Z',
        prompt: '追逐',
        assetId: 'asset-video',
      }],
      activeVersionId: 'video-version',
      sourceChanged: false,
    },
  ],
  edges: [],
  timeline: [],
  jobs: [],
  exportJobs: [],
}

test('offers the exact 17 effect templates and inserts the chosen effect', async () => {
  const user = userEvent.setup()
  const onInsert = vi.fn()
  render(<EffectToolboxPanel onInsert={onInsert} />)

  const grid = screen.getByRole('list', { name: '动效模板' })
  expect(within(grid).getAllByRole('button')).toHaveLength(17)
  for (const name of [
    '光效', '烟雾', '粒子', '水墨', '古风', '火焰', '雨雪', '星轨', '闪电',
    '爆炸', '流体', '霓虹', '烟雾消散', '飘带', '花瓣', '落叶', '极光',
  ]) {
    expect(within(grid).getByRole('button', { name: `使用${name}模板` })).toBeVisible()
  }

  await user.click(within(grid).getByRole('button', { name: '使用极光模板' }))
  expect(onInsert).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'aurora', name: '极光' }),
  )
})

test('searches, filters, renames, moves, deletes and sends library assets', async () => {
  const user = userEvent.setup()
  const onInsert = vi.fn()
  render(<AssetLibraryPanel project={project} onInsert={onInsert} />)

  const dialog = screen.getByRole('dialog', { name: '素材库' })
  expect(within(dialog).getByRole('tree', { name: '文件夹' })).toBeVisible()
  await user.type(within(dialog).getByRole('searchbox', { name: '搜索素材' }), '雨夜')
  expect(within(dialog).getByRole('article', { name: '素材 雨夜长街' })).toBeVisible()
  expect(within(dialog).queryByRole('article', { name: '素材 追逐片段' })).not.toBeInTheDocument()
  await user.clear(within(dialog).getByRole('searchbox', { name: '搜索素材' }))
  await user.selectOptions(within(dialog).getByLabelText('类型筛选'), 'video')
  expect(within(dialog).getByRole('article', { name: '素材 追逐片段' })).toBeVisible()
  await user.selectOptions(within(dialog).getByLabelText('类型筛选'), 'all')

  const rain = within(dialog).getByRole('article', { name: '素材 雨夜长街' })
  await user.dblClick(within(rain).getByText('雨夜长街'))
  const rename = within(rain).getByRole('textbox', { name: '重命名雨夜长街' })
  await user.clear(rename)
  await user.type(rename, '蓝调雨夜{Enter}')
  expect(within(dialog).getByRole('article', { name: '素材 蓝调雨夜' })).toBeVisible()

  const renamed = within(dialog).getByRole('article', { name: '素材 蓝调雨夜' })
  await user.pointer({ target: renamed, keys: '[MouseRight]' })
  const menu = screen.getByRole('menu', { name: '素材操作' })
  expect(within(menu).getByRole('menuitem', { name: '重命名' })).toBeVisible()
  await user.click(within(menu).getByRole('menuitem', { name: '移动到' }))
  await user.click(screen.getByRole('menuitem', { name: '灵感收集' }))
  expect(within(renamed).getByText(/灵感收集/)).toBeVisible()

  await user.pointer({ target: renamed, keys: '[MouseRight]' })
  expect(screen.getByRole('menu', { name: '素材操作' })).toBeVisible()
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('menu', { name: '素材操作' })).not.toBeInTheDocument()

  await user.click(within(renamed).getByRole('button', { name: '发送蓝调雨夜到画布' }))
  expect(onInsert).toHaveBeenCalledWith(
    expect.objectContaining({ name: '蓝调雨夜', folderId: 'inspiration' }),
  )

  await user.pointer({ target: renamed, keys: '[MouseRight]' })
  await user.click(screen.getByRole('menuitem', { name: '删除' }))
  expect(within(dialog).queryByRole('article', { name: '素材 蓝调雨夜' })).not.toBeInTheDocument()
})

test('filters character cards, previews four images and applies selected characters', async () => {
  const user = userEvent.setup()
  const onApply = vi.fn()
  render(<CharacterLibraryPanel onApply={onApply} />)

  const dialog = screen.getByRole('dialog', { name: '角色库' })
  expect(within(dialog).getByRole('region', { name: '最近使用' })).toBeVisible()
  await user.selectOptions(within(dialog).getByLabelText('性别'), '女')
  await user.selectOptions(within(dialog).getByLabelText('时代'), '古代')
  const card = within(dialog).getByRole('article', { name: '角色 程野' })
  expect(within(card).getAllByRole('img')).toHaveLength(4)
  expect(within(card).getAllByText('侦查使')).not.toHaveLength(0)

  await user.click(within(card).getByRole('button', { name: '查看程野' }))
  expect(screen.getByRole('dialog', { name: '角色详情 程野' })).toBeVisible()
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('dialog', { name: '角色详情 程野' })).not.toBeInTheDocument()

  await user.click(within(card).getByRole('button', { name: '使用程野' }))
  const selected = within(dialog).getByRole('region', { name: '已选角色' })
  expect(within(selected).getByText('程野')).toBeVisible()
  await user.click(within(dialog).getByRole('button', { name: '应用 1 个角色到画布' }))
  expect(onApply).toHaveBeenCalledWith([
    expect.objectContaining({ id: 'cheng-ye', name: '程野' }),
  ])
})
