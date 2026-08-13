import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, test, vi } from 'vitest'

import type { Project } from '../project/model'
import { makeProjectFixture } from '../../test/fixtures'
import { StoryBiblePage } from './StoryBiblePage'

function storyProject(): Project {
  const project = makeProjectFixture()
  return {
    ...project,
    title: '潮汐城计划',
    nodes: [
      ...project.nodes,
      {
        id: 'script-rain',
        kind: 'script',
        title: '雨夜重逢',
        position: { x: 0, y: 0 },
        versions: [],
        activeVersionId: '',
        sourceChanged: false,
        card: {
          kind: 'script',
          scenes: '场一：河岸夜外',
          dialogue: '林渊：你终于来了。',
          shotNotes: '远景缓慢推近。',
        },
      },
      {
        id: 'character-linyuan',
        kind: 'character-card',
        title: '林渊角色卡',
        position: { x: 0, y: 0 },
        versions: [],
        activeVersionId: '',
        sourceChanged: false,
        card: {
          kind: 'character-card',
          name: '林渊',
          appearance: '短发，右眼下有小痣',
          wardrobe: '深灰长风衣',
          relationships: '林舟的姐姐，与程野存在旧心结',
          imageAssetId: project.assets[0].id,
        },
      },
      {
        id: 'world-tide',
        kind: 'worldview',
        title: '潮汐城世界观',
        position: { x: 0, y: 0 },
        versions: [],
        activeVersionId: '',
        sourceChanged: false,
        card: {
          kind: 'worldview',
          background: '雨季淹城三天',
          artStyle: '低饱和蓝绿胶片',
          rules: '铜铃后不得直呼失踪者姓名',
        },
      },
    ],
  }
}

function renderPage(listAll = vi.fn().mockResolvedValue([storyProject()])) {
  const view = render(
    <MemoryRouter>
      <StoryBiblePage repository={{ listAll }} />
    </MemoryRouter>,
  )
  return { ...view, listAll }
}

describe('StoryBiblePage', () => {
  test('aggregates all structured cards with image previews and source links', async () => {
    const { listAll } = renderPage()

    expect(await screen.findByRole('heading', { name: '故事设定' })).toBeVisible()
    expect(listAll).toHaveBeenCalledTimes(1)
    expect(screen.getByText('3 张创作卡')).toBeVisible()
    expect(screen.getByRole('article', { name: '雨夜重逢' })).toBeVisible()
    expect(screen.getByRole('article', { name: '林渊角色卡' })).toBeVisible()
    expect(screen.getByRole('article', { name: '潮汐城世界观' })).toBeVisible()
    expect(screen.getByRole('img', { name: '林渊角色卡引用图片' })).toHaveAttribute(
      'src',
      storyProject().assets[0].url,
    )
    expect(screen.getByRole('link', { name: '在画布中查看 林渊角色卡' })).toHaveAttribute(
      'href',
      `/project/${storyProject().id}?focus=character-linyuan`,
    )
  })

  test('searches card body and project source, then filters by kind', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('article', { name: '雨夜重逢' })

    await user.type(screen.getByRole('searchbox', { name: '搜索故事设定' }), '旧心结')
    expect(screen.getByRole('article', { name: '林渊角色卡' })).toBeVisible()
    expect(screen.queryByRole('article', { name: '雨夜重逢' })).not.toBeInTheDocument()

    await user.clear(screen.getByRole('searchbox', { name: '搜索故事设定' }))
    await user.type(screen.getByRole('searchbox', { name: '搜索故事设定' }), '潮汐城计划')
    expect(screen.getAllByRole('article')).toHaveLength(3)

    await user.clear(screen.getByRole('searchbox', { name: '搜索故事设定' }))
    await user.click(screen.getByRole('radio', { name: '世界观' }))
    expect(screen.getByRole('article', { name: '潮汐城世界观' })).toBeVisible()
    expect(screen.queryByRole('article', { name: '林渊角色卡' })).not.toBeInTheDocument()
  })

  test('distinguishes no projects, no cards, and no matches', async () => {
    const user = userEvent.setup()
    const emptyProject = { ...makeProjectFixture(), nodes: [] }
    const listAll = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([emptyProject])
    const first = renderPage(listAll)
    expect(await screen.findByText('尚无项目')).toBeVisible()
    expect(first.listAll).toHaveBeenCalledTimes(1)
    first.unmount()

    listAll.mockResolvedValue([emptyProject])
    const second = render(
      <MemoryRouter>
        <StoryBiblePage repository={{ listAll }} />
      </MemoryRouter>,
    )
    expect(await screen.findByText('尚无结构化创作卡')).toBeVisible()
    second.unmount()

    renderPage()
    await screen.findByRole('article', { name: '雨夜重逢' })
    await user.type(screen.getByRole('searchbox', { name: '搜索故事设定' }), '不存在内容')
    expect(screen.getByText('没有匹配的故事设定')).toBeVisible()
  })

  test('shows a fixed load error without leaking repository details', async () => {
    renderPage(vi.fn().mockRejectedValue(new Error('PRIVATE local path')))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('无法读取故事设定')
    expect(alert).not.toHaveTextContent('PRIVATE')
  })
})
