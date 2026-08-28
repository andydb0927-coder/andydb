import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import { createDefaultDirectorScene } from './director-3d-scene'
import { Director3DViewport } from './Director3DViewport'
import { useState } from 'react'

test('light presets, lens and keyframes are editable offline while preview requires WebGL', async () => {
  const user = userEvent.setup()
  function Harness() {
    const [scene, setScene] = useState(createDefaultDirectorScene)
    return <Director3DViewport title="测试" scene={scene} onChange={setScene} onExportViews={vi.fn()} />
  }
  render(<Harness />)
  await user.click(screen.getByRole('button', { name: '三点布光' }))
  expect(screen.getByRole('spinbutton', { name: '主光 X' })).toHaveValue(4)
  await user.click(screen.getByRole('button', { name: '侧逆光' }))
  expect(screen.getByRole('spinbutton', { name: '主光 X' })).toHaveValue(-4)
  await user.click(screen.getByRole('button', { name: '特写机位' }))
  expect(screen.getByRole('spinbutton', { name: '相机焦距（毫米）' })).toHaveValue(85)
  await user.click(screen.getByRole('button', { name: '添加桌子' }))
  expect(screen.getByRole('treeitem', { name: /桌子 01/ })).toBeVisible()
  await user.click(screen.getByText('运镜轨迹预览', { selector: 'summary' }))
  await user.click(screen.getByRole('button', { name: '记录当前位置为关键帧' }))
  await user.click(screen.getByRole('button', { name: '全景机位' }))
  await user.click(screen.getByRole('button', { name: '记录当前位置为关键帧' }))
  expect(within(screen.getByRole('list', { name: '位置关键帧' })).getAllByRole('listitem')).toHaveLength(2)
  expect(screen.getByRole('button', { name: '播放运镜预览' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '播放运镜预览' })).toHaveAccessibleDescription(/WebGL/)
  expect(screen.getByRole('button', { name: '导出场景快照 PNG 到画布' })).toBeDisabled()
})

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

  const trajectory = screen.getByRole('button', { name: 'AI 运镜生成（待接入）' })
  expect(trajectory).toBeDisabled()
  expect(trajectory).toHaveAccessibleDescription('待接入运动运镜生成')
})
