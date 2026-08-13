import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, test, vi } from 'vitest'

import { buildDemoWorks } from '../community/demo-works'
import { buildHomeContentSeed } from './home-content'
import { PlatformHomeSections } from './PlatformHomeSections'

function makeContentRepository() {
  return {
    ensureSeed: vi.fn().mockResolvedValue(true),
    list: vi.fn().mockResolvedValue(buildHomeContentSeed()),
  }
}

function makeCommunityRepository() {
  return {
    ensureDemoWorks: vi.fn().mockResolvedValue(true),
    listPublished: vi.fn().mockResolvedValue(buildDemoWorks()),
  }
}

function renderHome() {
  const contentRepository = makeContentRepository()
  const communityRepository = makeCommunityRepository()
  const onStartPrompt = vi.fn()
  render(
    <MemoryRouter>
      <PlatformHomeSections
        contentRepository={contentRepository}
        communityRepository={communityRepository}
        disabled={false}
        onStartPrompt={onStartPrompt}
      />
    </MemoryRouter>,
  )
  return { communityRepository, contentRepository, onStartPrompt }
}

describe('platform home sections', () => {
  test('renders the required hero, local activity countdown and six canvas modes', async () => {
    const user = userEvent.setup()
    const { contentRepository } = renderHome()

    expect(
      await screen.findByRole('heading', {
        name: '只需一张画布，连接你的多种创意想法',
      }),
    ).toBeVisible()
    expect(contentRepository.ensureSeed).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('link', { name: '新建画布创作' })).toHaveAttribute(
      'href',
      '#create-project',
    )
    expect(screen.getByRole('timer')).toHaveTextContent(/\d{2}:\d{2}:\d{2}/)
    const modes = screen.getByRole('group', { name: '画布创作模式' })
    expect(within(modes).getAllByRole('button')).toHaveLength(6)
    expect(within(modes).getByRole('button', { name: /逐帧拉片/ })).toBeVisible()

    await user.click(screen.getByRole('button', { name: '关闭活动横幅' }))
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
  })

  test('validates an Agent idea, accepts local attachments and sends the idea to canvas', async () => {
    const user = userEvent.setup()
    const { onStartPrompt } = renderHome()
    await screen.findByRole('heading', { name: '说出你的创意' })

    await user.click(screen.getByRole('button', { name: '发送创意' }))
    expect(screen.getByRole('alert')).toHaveTextContent('请先说出你的创意')

    const file = new File(['local'], '人物参考.png', { type: 'image/png' })
    await user.upload(screen.getByLabelText('添加附件'), file)
    expect(screen.getByText('已选择：人物参考.png')).toBeVisible()

    await user.type(
      screen.getByRole('textbox', { name: '说出你的创意' }),
      '一只纸鹤飞过未来城市',
    )
    await user.click(screen.getByRole('button', { name: '发送创意' }))

    expect(onStartPrompt).toHaveBeenCalledWith({
      key: 'agent-idea',
      title: '创意草稿',
      prompt: '一只纸鹤飞过未来城市',
    })
  })

  test('groups six recommendation cards and starts a selected Skill', async () => {
    const user = userEvent.setup()
    const { onStartPrompt } = renderHome()
    await screen.findByRole('heading', { name: '推荐 Skill' })

    for (const category of ['专业影视', '商业广告', '音乐MV']) {
      const group = screen.getByRole('region', { name: category })
      expect(within(group).getAllByRole('article')).toHaveLength(2)
    }
    const card = screen.getByRole('article', { name: '品牌氛围片' })
    expect(within(card).getByText('栖光创意')).toBeVisible()
    expect(within(card).getByText('3,612 次使用')).toBeVisible()
    await user.click(
      within(card).getByRole('button', { name: '使用 Skill：品牌氛围片' }),
    )
    expect(onStartPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'home-skill-brand-film',
        title: '品牌氛围片',
        prompt: expect.stringContaining('品牌氛围片'),
      }),
    )
  })

  test('links four capabilities and filters the eight-work TV Show locally', async () => {
    const user = userEvent.setup()
    const { communityRepository } = renderHome()
    expect(await screen.findByRole('heading', { name: '模型与创作工具' })).toBeVisible()
    expect(screen.getAllByTestId('home-capability')).toHaveLength(4)
    expect(screen.getByRole('link', { name: /查看模型能力/ })).toHaveAttribute(
      'href',
      '/models',
    )
    expect(communityRepository.ensureDemoWorks).toHaveBeenCalledTimes(1)

    const show = await screen.findByRole('region', { name: 'TV Show 社区作品' })
    expect(within(show).getAllByRole('article')).toHaveLength(8)
    expect(
      within(show).getByRole('button', { name: '教育生活' }),
    ).toBeVisible()
    await user.click(within(show).getByRole('button', { name: '动漫游戏' }))
    expect(within(show).getAllByRole('article')).toHaveLength(1)
    expect(within(show).getByRole('article', { name: '机甲苏醒时' })).toBeVisible()

    await user.click(within(show).getByRole('button', { name: '全部' }))
    await user.type(within(show).getByRole('searchbox', { name: '搜索 TV Show' }), '山岚')
    const card = within(show).getByRole('article', { name: '山岚入茶' })
    expect(within(card).getByLabelText('一帧商业 已认证')).toBeVisible()
    expect(
      within(card).getByRole('link', { name: '查看 山岚入茶 的创作过程' }),
    ).toHaveAttribute('href', '/discover/demo-work-tea-mountain')
  })
})
