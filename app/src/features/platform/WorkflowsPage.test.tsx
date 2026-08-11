import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { expect, test } from 'vitest'

import { WorkflowsPage } from './WorkflowsPage'

test('routes each workflow to a preselected project-space recipe', () => {
  render(
    <MemoryRouter>
      <WorkflowsPage />
    </MemoryRouter>,
  )

  expect(
    screen.getByRole('link', { name: '使用品牌氛围片' }),
  ).toHaveAttribute('href', '/?recipe=brand-atmosphere')
})
