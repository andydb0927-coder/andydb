import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, test } from 'vitest'

import { ChallengeDetailPage } from './ChallengeDetailPage'
import { ChallengesPage } from './ChallengesPage'

describe('creator challenges', () => {
  test('shows local challenge cards with the official page information hierarchy', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <ChallengesPage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: '创作者挑战赛' })).toBeVisible()
    expect(screen.getByText('本地演示数据，不会发起真实报名或作品提交。')).toBeVisible()
    expect(screen.getByRole('heading', { name: 'LibTV Skill 导演大师赛' })).toBeVisible()
    expect(screen.getByText('13 万元现金 + 70 万积分')).toBeVisible()
    expect(screen.getByText('1,286 人参与')).toBeVisible()
    expect(screen.getByRole('link', { name: '查看 LibTV Skill 导演大师赛' })).toHaveAttribute(
      'href',
      '/activity/director-master',
    )

    await user.click(screen.getByRole('button', { name: '已颁奖' }))
    expect(screen.queryByRole('heading', { name: 'LibTV Skill 导演大师赛' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '「故事的种子」AI 短片征集' })).toBeVisible()
  })

  test('opens a complete local activity landing page for a known challenge', () => {
    render(
      <MemoryRouter initialEntries={['/activity/director-master']}>
        <Routes>
          <Route path="/activity/:challengeId" element={<ChallengeDetailPage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: 'LibTV Skill 导演大师赛' })).toBeVisible()
    expect(screen.getByRole('link', { name: '去创作' })).toHaveAttribute('href', '/projects/new')
    expect(screen.getByRole('region', { name: '活动日历' })).toBeVisible()
    expect(screen.getByRole('region', { name: '活动赛道' })).toBeVisible()
    expect(screen.getByRole('region', { name: '参赛指引' })).toBeVisible()
    expect(screen.getByRole('region', { name: '分级奖项' })).toBeVisible()
    expect(screen.getByText('最佳导演奖')).toBeVisible()
    expect(screen.queryByText('详情占位')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '返回挑战赛' })).toHaveAttribute('href', '/challenges')
  })
})
