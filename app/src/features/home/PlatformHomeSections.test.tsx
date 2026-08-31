import type { ReactNode } from 'react'
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

function renderHome(recentProjects?: ReactNode) {
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
        recentProjects={recentProjects}
      />
    </MemoryRouter>,
  )
  return { communityRepository, contentRepository, onStartPrompt }
}

describe('platform home sections', () => {
  test('places the Agent directly after the hero and keeps discovery sections secondary', async () => {
    renderHome(<section aria-label="插入的最近项目" />)

    const hero = screen.getByRole('region', {
      name: '只需一张画布 连接你的多种创意想法',
    })
    const agent = await screen.findByRole('region', { name: '说出你的创意' })
    const features = await screen.findByRole('region', { name: '产品特性轮播' })
    const recentProjects = screen.getByRole('region', { name: '插入的最近项目' })

    expect(
      hero.compareDocumentPosition(agent),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(
      agent.compareDocumentPosition(features),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(
      features.compareDocumentPosition(recentProjects),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })

  test('renders independently when the recent-projects slot is omitted', async () => {
    renderHome()

    expect(
      await screen.findByRole('heading', { name: '说出你的创意' }),
    ).toBeVisible()
    expect(
      screen.queryByRole('region', { name: '插入的最近项目' }),
    ).not.toBeInTheDocument()
  })

  test('renders the exact hero and six specified canvas modes', async () => {
    const { contentRepository } = renderHome()

    expect(
      await screen.findByRole('heading', {
        name: '只需一张画布 连接你的多种创意想法',
      }),
    ).toBeVisible()
    expect(contentRepository.ensureSeed).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('link', { name: '新建画布创作' })).toHaveAttribute(
      'href',
      '/projects/new',
    )
    const modes = screen.getByRole('group', { name: '画布创作模式' })
    expect(within(modes).getAllByRole('button')).toHaveLength(6)
    for (const name of [
      '长叙事视频工作流',
      '片段重拍',
      '智能引用 AutoLink',
      '讲解视频',
      '素材混剪',
      '逐帧拉片',
    ]) {
      expect(within(modes).getByRole('button', { name: new RegExp(name) })).toBeVisible()
    }
  })

  test('cycles through five linked product feature cards', async () => {
    const user = userEvent.setup()
    renderHome()

    const carousel = await screen.findByRole('region', { name: '产品特性轮播' })
    expect(within(carousel).getAllByTestId('home-feature-card')).toHaveLength(5)
    const position = within(carousel).getByText('1 / 5 · 离线创作链路')
    expect(position).toHaveAttribute('aria-live', 'polite')
    expect(position).toHaveTextContent(
      '1 / 5 · 离线创作链路',
    )
    expect(within(carousel).getByRole('link', { name: /离线创作链路/ })).toHaveAttribute(
      'href',
      '/agents',
    )

    await user.click(within(carousel).getByRole('button', { name: '下一张特性' }))
    expect(within(carousel).getByText('2 / 5 · 导演台')).toBeVisible()
    await user.click(within(carousel).getByRole('button', { name: '上一张特性' }))
    expect(within(carousel).getByText('1 / 5 · 离线创作链路')).toHaveTextContent(
      '1 / 5 · 离线创作链路',
    )
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

  test('switches horizontal Skill categories and starts a selected Skill', async () => {
    const user = userEvent.setup()
    const { onStartPrompt } = renderHome()
    await screen.findByRole('heading', { name: 'Skill 灵感库' })

    const categories = screen.getByRole('group', { name: 'Skill 分类' })
    for (const category of ['专业影视', '商业广告', '音乐MV']) {
      expect(within(categories).getByRole('button', { name: category })).toBeVisible()
    }
    expect(within(categories).getByRole('button', { name: '专业影视' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('article', { name: '电影叙事分镜师' })).toBeVisible()
    expect(screen.getByRole('article', { name: '连续性导演' })).toBeVisible()

    await user.click(within(categories).getByRole('button', { name: '商业广告' }))
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

  test('filters the eight-work TV Show by long-form workflow and explicit local search', async () => {
    const user = userEvent.setup()
    const { communityRepository } = renderHome()
    expect(communityRepository.ensureDemoWorks).toHaveBeenCalledTimes(1)

    const show = await screen.findByRole('region', { name: 'TV Show 社区作品' })
    expect(within(show).getAllByRole('article')).toHaveLength(8)
    expect(within(show).getByRole('button', { name: '长叙事' })).toBeVisible()
    expect(
      within(show).getByRole('button', { name: '教育生活' }),
    ).toBeVisible()
    await user.click(within(show).getByRole('button', { name: '长叙事' }))
    expect(within(show).getAllByRole('article')).toHaveLength(2)

    await user.click(within(show).getByRole('button', { name: '全部' }))
    await user.click(within(show).getByRole('button', { name: '动漫游戏' }))
    expect(within(show).getAllByRole('article')).toHaveLength(1)
    expect(within(show).getByRole('article', { name: '机甲苏醒时' })).toBeVisible()

    await user.click(within(show).getByRole('button', { name: '全部' }))
    await user.type(within(show).getByRole('searchbox', { name: '搜索 TV Show' }), '山岚')
    expect(within(show).getAllByRole('article')).toHaveLength(8)
    await user.click(within(show).getByRole('button', { name: '搜索作品' }))
    const card = within(show).getByRole('article', { name: '山岚入茶' })
    expect(within(card).getByLabelText('一帧商业 已认证')).toBeVisible()
    expect(
      within(card).getByRole('link', { name: '查看 山岚入茶 的创作过程' }),
    ).toHaveAttribute('href', '/detail/demo-work-tea-mountain/process')
  })
})
