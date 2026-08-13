import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, test } from 'vitest'

import { buildDemoWorks } from './demo-works'
import { WorkCard } from './WorkCard'

describe('community work card', () => {
  test('shows a verified author, likes and the creation-process action', () => {
    const work = buildDemoWorks()[0]
    render(
      <MemoryRouter>
        <WorkCard work={work} />
      </MemoryRouter>,
    )

    expect(screen.getByLabelText(`${work.author} 已认证`)).toBeVisible()
    expect(screen.getByText(work.author)).toBeVisible()
    expect(screen.getByLabelText(`${work.metrics.likes} 次点赞`)).toBeVisible()
    expect(screen.getByText(`${work.metrics.views} 播放`)).toBeVisible()
    expect(
      screen.getByRole('link', { name: `查看 ${work.title} 的创作过程` }),
    ).toHaveAttribute('href', '/projects/new')
  })
})
