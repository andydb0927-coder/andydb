import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { expect, test, vi } from 'vitest'

import { makeProjectFixture } from '../../test/fixtures'
import { AccountPage } from './AccountPage'

test('reports the saved project count and no cloud account', async () => {
  const projectA = makeProjectFixture()
  const projectB = { ...makeProjectFixture(), id: 'project-second' }
  const repository = {
    listRecent: vi.fn().mockResolvedValue([projectA, projectB]),
  }

  render(
    <MemoryRouter>
      <AccountPage repository={repository} />
    </MemoryRouter>,
  )

  expect(await screen.findByText('2 个本地项目')).toBeVisible()
  expect(screen.getByText('登录、团队与会员：未接入')).toBeVisible()
})
