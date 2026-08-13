import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { expect, test, vi } from 'vitest'

import { CanvasTopBar } from './CanvasTopBar'

test('switches workspace modes and exposes the agent as a pressed control', async () => {
  const user = userEvent.setup()
  const onModeChange = vi.fn()
  const onToggleAgent = vi.fn()
  render(
    <MemoryRouter>
      <CanvasTopBar
        projectId="project-1"
        projectTitle="工作台演示"
        saveStatus="saved"
        canUndo={false}
        canRedo={false}
        mode="workflow"
        agentOpen={false}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        onOpenNodeList={vi.fn()}
        onModeChange={onModeChange}
        onToggleAgent={onToggleAgent}
      />
    </MemoryRouter>,
  )

  expect(screen.getByRole('button', { name: '画布 1' })).toBeVisible()
  expect(screen.getByRole('button', { name: '工作流' })).toHaveAttribute('aria-pressed', 'true')
  await user.click(screen.getByRole('button', { name: '故事板' }))
  expect(onModeChange).toHaveBeenCalledWith('storyboard')
  const agent = screen.getByRole('button', { name: 'Agent' })
  expect(agent).toHaveAttribute('aria-pressed', 'false')
  await user.click(agent)
  expect(onToggleAgent).toHaveBeenCalledOnce()
})

test('keeps publish and share actions explicitly local-only', async () => {
  const user = userEvent.setup()
  render(
    <MemoryRouter>
      <CanvasTopBar
        projectTitle="工作台演示"
        saveStatus="saved"
        canUndo={false}
        canRedo={false}
        mode="workflow"
        agentOpen={false}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        onOpenNodeList={vi.fn()}
        onModeChange={vi.fn()}
        onToggleAgent={vi.fn()}
      />
    </MemoryRouter>,
  )
  await user.click(screen.getByRole('button', { name: '发布与分享' }))
  expect(screen.getByRole('menu')).toHaveTextContent('本地演示不执行外部发布')
})
