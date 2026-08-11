import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, test } from 'vitest'

import { PlatformShell } from './PlatformShell'

function renderWorkspaceShell() {
  return render(
    <MemoryRouter initialEntries={['/project/demo-project']}>
      <Routes>
        <Route path="/project/:projectId" element={<PlatformShell mode="workspace" />}>
          <Route index element={<h1>项目画布</h1>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('platform shell', () => {
  test('marks the current canvas and collapses its workspace rail', async () => {
    const user = userEvent.setup()
    renderWorkspaceShell()

    expect(screen.getByRole('link', { name: '创作画布' })).toHaveAttribute(
      'aria-current',
      'page',
    )

    await user.click(screen.getByRole('button', { name: '收起平台导航' }))

    expect(screen.getByRole('navigation', { name: '平台导航' })).toHaveAttribute(
      'data-collapsed',
      'true',
    )
    expect(screen.getByRole('button', { name: '展开平台导航' })).toBeVisible()
  })
})
