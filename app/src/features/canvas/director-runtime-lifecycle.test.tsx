import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { Director3DViewport } from './Director3DViewport'
import { createDefaultDirectorScene, applyDirectorLightingPreset } from './director-3d-scene'

const mocks = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), dispose: vi.fn(), snapshot: vi.fn() }))
vi.mock('./director-3d-runtime', () => ({
  DIRECTOR_ASSET_MIME: 'application/x-director-local-asset',
  createDirectorRuntime: mocks.create,
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('WebGLRenderingContext', class {})
  mocks.create.mockReturnValue({ update: mocks.update, dispose: mocks.dispose, snapshot: mocks.snapshot })
})
afterEach(() => { vi.unstubAllGlobals(); vi.resetAllMocks() })

test('updates lighting declarations without recreating or leaking a renderer', () => {
  const scene = createDefaultDirectorScene()
  const { rerender, unmount } = render(<Director3DViewport title="导演台" scene={scene} onChange={vi.fn()} onExportViews={vi.fn()} />)
  const changed = applyDirectorLightingPreset(scene, 'top')
  rerender(<Director3DViewport title="导演台" scene={changed} onChange={vi.fn()} onExportViews={vi.fn()} />)
  expect(mocks.create).toHaveBeenCalledTimes(1)
  expect(mocks.update).toHaveBeenLastCalledWith(changed, 'director-humanoid')
  unmount()
  expect(mocks.dispose).toHaveBeenCalledTimes(1)
})

test('prevents duplicate exports and passes snapshot identity to the asset save callback', async () => {
  let complete!: (blob: Blob) => void
  mocks.snapshot.mockImplementation(() => new Promise<Blob>(resolve => { complete = resolve }))
  const save = vi.fn()
  render(<Director3DViewport title="导演台" scene={createDefaultDirectorScene()} onChange={vi.fn()} onExportViews={save} />)
  const button = screen.getByRole('button', { name: '导出场景快照 PNG 到画布' })
  fireEvent.click(button); fireEvent.click(button)
  expect(mocks.snapshot).toHaveBeenCalledTimes(1)
  const blob = new Blob(['fixture'], { type: 'image/png' })
  await act(async () => complete(blob))
  expect(save).toHaveBeenCalledExactlyOnceWith(blob, 'snapshot')
  expect(screen.getByRole('status', { name: '3D导出状态' })).toHaveTextContent('场景快照 PNG 已写入画布与资产库。')
})

test('unmount cancels pending export delivery instead of writing into a different project', async () => {
  let complete!: (blob: Blob) => void
  mocks.snapshot.mockImplementation(() => new Promise<Blob>(resolve => { complete = resolve }))
  const save = vi.fn()
  const { unmount } = render(<Director3DViewport title="导演台" scene={createDefaultDirectorScene()} onChange={vi.fn()} onExportViews={save} />)
  fireEvent.click(screen.getByRole('button', { name: '导出四视图 PNG 到画布' }))
  unmount()
  await act(async () => complete(new Blob()))
  expect(save).not.toHaveBeenCalled()
  expect(mocks.dispose).toHaveBeenCalledTimes(1)
})

test('failed PNG export surfaces the error and can retry', async () => {
  mocks.snapshot.mockRejectedValueOnce(new Error('场景 PNG 编码失败。')).mockResolvedValue(new Blob())
  render(<Director3DViewport title="导演台" scene={createDefaultDirectorScene()} onChange={vi.fn()} onExportViews={vi.fn()} />)
  const button = screen.getByRole('button', { name: '导出场景快照 PNG 到画布' })
  fireEvent.click(button)
  await waitFor(() => expect(screen.getByRole('status', { name: '3D导出状态' })).toHaveTextContent('场景 PNG 编码失败。'))
  expect(button).toBeEnabled()
  fireEvent.click(button)
  await waitFor(() => expect(screen.getByRole('status', { name: '3D导出状态' })).toHaveTextContent('已写入画布与资产库'))
})
