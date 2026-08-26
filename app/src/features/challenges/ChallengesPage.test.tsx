import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, test } from 'vitest'

import { ChallengeDetailPage } from './ChallengeDetailPage'
import { ChallengesPage } from './ChallengesPage'

describe('creator challenges', () => {
  test('shows compact local challenge cards with counted status filters and one clear card link', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <ChallengesPage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: '创作者挑战赛' })).toBeVisible()
    expect(screen.getByText('本地演示数据，不会发起真实报名或作品提交。')).toBeVisible()
    expect(screen.getByRole('button', { name: '全部 3' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '进行中 2' })).toBeVisible()
    expect(screen.getByRole('button', { name: '已颁奖 1' })).toBeVisible()
    expect(screen.getByRole('heading', { name: '光影接力导演挑战' })).toBeVisible()
    expect(screen.getByText('本地荣誉徽章与专题推荐')).toBeVisible()
    expect(screen.getByText('1,286 人参与')).toBeVisible()
    const directorCard = screen.getByRole('article', { name: '光影接力导演挑战' })
    expect(within(directorCard).getAllByRole('link')).toHaveLength(1)
    expect(within(directorCard).getByRole('link', { name: '光影接力导演挑战' })).toHaveAttribute(
      'href',
      '/activity/director-master',
    )

    await user.click(screen.getByRole('button', { name: '已颁奖 1' }))
    expect(screen.queryByRole('heading', { name: '光影接力导演挑战' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '旧物醒来时' })).toBeVisible()
  })

  test('opens a restrained long-form local activity document for a known challenge', () => {
    render(
      <MemoryRouter initialEntries={['/activity/director-master']}>
        <Routes>
          <Route path="/activity/:challengeId" element={<ChallengeDetailPage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: '光影接力导演挑战' })).toBeVisible()
    expect(screen.getByRole('link', { name: '去创作' })).toHaveAttribute(
      'href',
      '/projects/new?challenge=director-master',
    )
    expect(screen.getByText('进行中')).toBeVisible()
    expect(screen.getByText('2026.08.01 — 2026.09.30')).toBeVisible()
    expect(screen.getByText('1,286 人参与')).toBeVisible()
    expect(screen.getByText('本页使用本地演示目录，不代表真实报名、评审或线上提交。')).toBeVisible()
    expect(screen.getByRole('region', { name: '赛事时间线' })).toBeVisible()
    expect(screen.getByRole('region', { name: '活动赛道' })).toBeVisible()
    expect(screen.getByRole('region', { name: '赛制规则' })).toBeVisible()
    expect(screen.getByRole('region', { name: '参赛指引' })).toBeVisible()
    expect(screen.getByRole('region', { name: '奖项说明' })).toBeVisible()
    expect(screen.getByRole('region', { name: '评审说明' })).toBeVisible()
    expect(screen.getByRole('region', { name: '示例作品' })).toBeVisible()
    expect(screen.getAllByRole('separator')).toHaveLength(6)
    expect(screen.getByText('最佳导演奖')).toBeVisible()
    expect(screen.getAllByRole('link', { name: /查看示例作品/ })).toHaveLength(3)
    expect(screen.queryByRole('region', { name: '挑战赛概要' })).not.toBeInTheDocument()
    expect(screen.queryByRole('img', { name: '光影接力导演挑战 封面' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '返回挑战赛' })).toHaveAttribute('href', '/challenges')
  })

  test('keeps the local not-found state and route back to the challenge catalogue', () => {
    render(
      <MemoryRouter initialEntries={['/activity/missing-local-challenge']}>
        <Routes>
          <Route path="/activity/:challengeId" element={<ChallengeDetailPage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: '挑战赛暂不可用' })).toBeVisible()
    expect(screen.getByText('该本地演示挑战赛不存在或已移除。')).toBeVisible()
    expect(screen.getByRole('link', { name: '返回挑战赛' })).toHaveAttribute('href', '/challenges')
  })
})
