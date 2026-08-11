import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, test, vi } from 'vitest'

import type { Project } from '../project/model'
import { makeProjectFixture } from '../../test/fixtures'
import { AssetsHistoryPage } from './AssetsHistoryPage'

function repositoryWith(...projects: Project[]) {
  return {
    listRecent: vi.fn().mockResolvedValue(projects),
  }
}

describe('assets and history page', () => {
  test('shows persisted assets and links an active version back to its source node', async () => {
    render(
      <MemoryRouter>
        <AssetsHistoryPage repository={repositoryWith(makeProjectFixture())} />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: '素材与历史' })).toBeVisible()
    expect(await screen.findByText('asset-shot-river-v1')).toBeVisible()
    expect(screen.getByText('河岸寻人')).toBeVisible()
    expect(
      screen.getByRole('link', { name: '在画布中查看 河岸寻人' }),
    ).toHaveAttribute('href', '/project/project-frost-river?focus=shot-1')
  })

  test('offers the project space when no local project exists', async () => {
    render(
      <MemoryRouter>
        <AssetsHistoryPage repository={repositoryWith()} />
      </MemoryRouter>,
    )

    expect(
      await screen.findByRole('link', { name: '创建项目' }),
    ).toHaveAttribute('href', '/')
  })
})
