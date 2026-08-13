import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, test } from 'vitest'

import { PlatformTaskDrawer } from './PlatformTaskDrawer'
import { createPlatformTaskProgressStore } from './platform-task-progress'

function renderDrawer(storage: Storage = localStorage) {
  return render(
    <MemoryRouter>
      <PlatformTaskDrawer
        progressStore={createPlatformTaskProgressStore(storage)}
        onRequestClose={() => undefined}
      />
    </MemoryRouter>,
  )
}

describe('platform task drawer', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  test('shows all phases, aggregate progress, and navigable targets', () => {
    renderDrawer()

    expect(screen.getByRole('complementary', { name: '平台完善路线图' })).toBeVisible()
    expect(screen.getByText('9 / 13 已完成')).toBeVisible()
    expect(screen.getByText(/当前阶段：/)).toHaveTextContent('当前阶段：导出、发布与分享')
    expect(screen.getAllByRole('listitem')).toHaveLength(13)
    expect(screen.getByRole('link', { name: '打开 平台骨架' })).toHaveAttribute('href', '/')
  })

  test('persists a status change and restores it on remount', async () => {
    const user = userEvent.setup()
    const storage = localStorage
    storage.clear()
    const first = renderDrawer(storage)

    await user.selectOptions(
      screen.getByRole('combobox', { name: '更新 导出、发布与分享 状态' }),
      'completed',
    )
    expect(screen.getByText('10 / 13 已完成')).toBeVisible()
    first.unmount()

    renderDrawer(storage)
    expect(screen.getByRole('combobox', { name: '更新 导出、发布与分享 状态' })).toHaveValue('completed')
  })
})
