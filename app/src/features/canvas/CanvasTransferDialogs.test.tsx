import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import type { WorkflowImportResult } from './canvas-workflow-export'
import {
  CanvasExportDialog,
  WorkflowImportDialog,
} from './CanvasTransferDialogs'

test('confirms canvas format and scope after showing both estimated sizes', async () => {
  const user = userEvent.setup()
  const onExport = vi.fn()
  render(
    <CanvasExportDialog
      projectTitle="雨夜电影"
      viewportEstimate={{
        scope: 'viewport',
        width: 1280,
        height: 720,
        transform: { x: 0, y: 0, zoom: 1 },
      }}
      allEstimate={{
        scope: 'all',
        width: 2048,
        height: 1120,
        transform: { x: 64, y: 64, zoom: 1 },
      }}
      onClose={vi.fn()}
      onExport={onExport}
    />,
  )

  expect(screen.getByRole('dialog', { name: '导出画布' })).toHaveTextContent(
    '当前视口·1280 × 720',
  )
  expect(screen.getByRole('dialog', { name: '导出画布' })).toHaveTextContent(
    '全画布·2048 × 1120',
  )
  await user.click(screen.getByRole('radio', { name: 'SVG 矢量图' }))
  await user.click(screen.getByRole('radio', { name: /全画布/ }))
  await user.click(screen.getByRole('button', { name: '导出 SVG' }))
  expect(onExport).toHaveBeenCalledWith('svg', 'all')
})

test('shows import conflicts and blocks confirmation for missing references', async () => {
  const result: WorkflowImportResult = {
    valid: false,
    errors: [],
    titleConflicts: ['分镜 01'],
    missingReferences: ['连线 edge-1 的目标节点 missing 不存在'],
  }
  render(
    <WorkflowImportDialog
      fileName="demo.json"
      result={result}
      onClose={vi.fn()}
      onConfirm={vi.fn()}
    />,
  )

  expect(screen.getByRole('dialog', { name: '导入工作流 JSON' })).toHaveTextContent(
    '重名节点：分镜 01',
  )
  expect(screen.getByText(/missing/)).toBeVisible()
  expect(screen.getByRole('button', { name: '确认合并' })).toBeDisabled()
})
