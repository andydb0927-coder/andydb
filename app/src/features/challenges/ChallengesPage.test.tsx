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
      '/challenges/director-master',
    )

    await user.click(screen.getByRole('button', { name: '已颁奖' }))
    expect(screen.queryByRole('heading', { name: 'LibTV Skill 导演大师赛' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '「故事的种子」AI 短片征集' })).toBeVisible()
  })

  test('opens a local detail placeholder for a known challenge', () => {
    render(
      <MemoryRouter initialEntries={['/challenges/director-master']}>
        <Routes>
          <Route path="/challenges/:challengeId" element={<ChallengeDetailPage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: 'LibTV Skill 导演大师赛' })).toBeVisible()
    expect(screen.getByText('详情占位')).toBeVisible()
    expect(screen.getByRole('link', { name: '返回挑战赛' })).toHaveAttribute('href', '/challenges')
  })
})
