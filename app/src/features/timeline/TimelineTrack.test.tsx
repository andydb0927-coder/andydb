import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { expect, test, vi } from 'vitest'

import { makeProjectFixture } from '../../test/fixtures'
import { TimelineTrack } from './TimelineTrack'

test('builds missing-source links with the active router basename', () => {
  const project = makeProjectFixture()
  render(
    <MemoryRouter basename="/andydb" initialEntries={['/andydb/project/project-frost-river/preview']}>
      <TimelineTrack
        project={project}
        items={[{
          item: { id: 'missing', nodeId: 'missing-node', order: 0, durationSeconds: 3, track: 'video' },
          missing: true,
          startSeconds: 0,
          endSeconds: 3,
        }]}
        activeIndex={0}
        onActiveIndexChange={vi.fn()}
        onReorder={vi.fn()}
      />
    </MemoryRouter>,
  )

  expect(screen.getByRole('link', { name: '返回来源节点' })).toHaveAttribute(
    'href',
    `/andydb/project/${project.id}?focus=missing-node`,
  )
})
