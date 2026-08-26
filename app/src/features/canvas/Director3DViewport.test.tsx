import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import { createDefaultDirectorScene } from './director-3d-scene'
import { Director3DViewport } from './Director3DViewport'

test('manages the object tree and camera controls without requiring WebGL in tests', async () => {
  const user = userEvent.setup()
  const onChange = vi.fn()
  const scene = createDefaultDirectorScene()

  render(
    <Director3DViewport
      title="导演台 01"
      scene={scene}
      onChange={onChange}
      onExportViews={vi.fn()}
    />,
  )

  expect(screen.getByRole('img', { name: '导演台 01 3D视口' })).toBeVisible()
  const tree = screen.getByRole('tree', { name: '3D对象树' })
  expect(within(tree).getByRole('treeitem', { name: /人形素模 01/ })).toBeVisible()

  await user.click(screen.getByRole('button', { name: '添加立方体' }))
  expect(onChange).toHaveBeenLastCalledWith(
    expect.objectContaining({
      objects: expect.arrayContaining([
        expect.objectContaining({ kind: 'cube', name: '立方体 01' }),
      ]),
    }),
  )

  await user.click(screen.getByRole('button', { name: '顶部视图' }))
  expect(onChange).toHaveBeenLastCalledWith(
    expect.objectContaining({
      camera: expect.objectContaining({ view: 'top' }),
    }),
  )
  await user.click(screen.getByRole('button', { name: '正交投影' }))
  expect(onChange).toHaveBeenLastCalledWith(
    expect.objectContaining({
      camera: expect.objectContaining({ projection: 'orthographic' }),
    }),
  )

  const trajectory = screen.getByRole('button', { name: '运动轨迹（待接入）' })
  expect(trajectory).toBeDisabled()
  expect(trajectory).toHaveAccessibleDescription('待接入运动运镜生成')
})
