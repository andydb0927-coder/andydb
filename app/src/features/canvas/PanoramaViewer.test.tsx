import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import { PanoramaViewer } from './PanoramaViewer'

test('supports drag rotation, wheel zoom, reset and Escape close', async () => {
  const user = userEvent.setup()
  const onClose = vi.fn()
  render(
    <PanoramaViewer
      imageUrl="data:image/png;base64,panorama"
      title="河岸全景"
      onClose={onClose}
    />,
  )

  const viewport = screen.getByRole('img', { name: '河岸全景 720全景视图' })
  expect(viewport).toHaveAttribute('data-yaw', '0')
  fireEvent.pointerDown(viewport, { clientX: 100, clientY: 80, pointerId: 1 })
  fireEvent.pointerMove(viewport, { clientX: 140, clientY: 65, pointerId: 1 })
  fireEvent.pointerUp(viewport, { pointerId: 1 })
  expect(viewport).not.toHaveAttribute('data-yaw', '0')

  fireEvent.wheel(viewport, { deltaY: -120 })
  expect(viewport).toHaveAttribute('data-zoom', '1.1')
  await user.click(screen.getByRole('button', { name: '重置全景视角' }))
  expect(viewport).toHaveAttribute('data-yaw', '0')
  expect(viewport).toHaveAttribute('data-zoom', '1')

  await user.keyboard('{Escape}')
  expect(onClose).toHaveBeenCalledOnce()
})
