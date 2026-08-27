import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { makeProjectFixture } from '../../test/fixtures'
import { createFixtureProviderRegistry } from '../../test/provider-fixtures'
import { CanvasGenerationDialogs } from './CanvasGenerationDialogs'

test('extracted analysis layer rejects stale project/canvas sessions and preserves draft callbacks', () => {
  const project = { ...makeProjectFixture(), activeCanvasId: 'canvas-1' }
  const submit = vi.fn(), close = vi.fn()
  const session = { nodeId: 'shot-1', projectId: project.id, canvasId: 'old-canvas', toolId: 'panorama-720-api', prompt: '古桥' }
  const props = { project, providerRegistry: createFixtureProviderRegistry(), analysis: { session, onSubmit: submit, onClose: close, onImportFile: vi.fn() } }
  const view = render(<CanvasGenerationDialogs {...props} />)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  view.rerender(<CanvasGenerationDialogs {...props} analysis={{ ...props.analysis, session: { ...session, canvasId: 'canvas-1' } }} />)
  expect(screen.getByRole('dialog', { name: '720全景' })).toBeVisible()
  expect(submit).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '确认生成' }))
  expect(submit).toHaveBeenCalledWith(expect.objectContaining({ prompt: '古桥', parameters: expect.objectContaining({ resolution: '1.5K', count: 1 }) }))
  view.rerender(<CanvasGenerationDialogs {...props} project={{ ...project, id: 'another-project' }} />)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
