import { act, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import type {
  ExportAdapter,
  ExportResult,
  ExportSettings,
} from './export-adapter'
import { DemoExportAdapter } from './demo-export-adapter'
import { ExportPanel } from './ExportPanel'

class ControlledExportAdapter implements ExportAdapter {
  readonly requests: ExportSettings[] = []
  readonly pending: Array<{
    resolve(value: ExportResult): void
    reject(reason: unknown): void
    signal: AbortSignal
  }> = []

  start(settings: ExportSettings, signal: AbortSignal) {
    this.requests.push(settings)
    return new Promise<ExportResult>((resolve, reject) => {
      const cancel = () => reject(new DOMException('cancelled', 'AbortError'))
      if (signal.aborted) cancel()
      else signal.addEventListener('abort', cancel, { once: true })
      this.pending.push({ resolve, reject, signal })
    })
  }
}

const result: ExportResult = {
  exportJobId: 'export-project-preview-1',
  downloadUrl: '/demo/exports/project-preview.mp4',
  completedAt: '2026-08-08T10:00:00.000Z',
}

afterEach(() => vi.useRealTimers())

describe('export panel', () => {
  test('catches export settings drifting from reviewed deterministic defaults', () => {
    render(<ExportPanel projectId="project-preview" />)

    expect(screen.getByLabelText('分辨率')).toHaveValue('1920×1080')
    expect(screen.getByLabelText('画幅比')).toHaveValue('16:9')
    expect(screen.getByLabelText('帧率')).toHaveValue('24fps')
    expect(screen.getByLabelText('水印')).not.toBeChecked()
  })

  test('catches a job skipping queued or running feedback before success', async () => {
    vi.useFakeTimers()
    const adapter = new ControlledExportAdapter()
    render(<ExportPanel projectId="project-preview" adapter={adapter} />)

    act(() => screen.getByRole('button', { name: '开始演示导出' }).click())
    expect(screen.getByText('排队中')).toBeVisible()

    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(screen.getByText('正在导出')).toBeVisible()
    expect(screen.getByText('可在后台继续')).toBeVisible()
    expect(screen.getByLabelText('总体进度')).toHaveTextContent('0%')
    expect(screen.getByText(/预计剩余/)).toBeVisible()

    await act(() => vi.advanceTimersByTimeAsync(600))
    expect(screen.getByLabelText('总体进度')).toHaveTextContent('33%')

    await act(async () => adapter.pending[0].resolve(result))
    expect(screen.getByText('导出完成')).toBeVisible()
    expect(screen.getByText('演示导出')).toBeVisible()
    expect(screen.getByRole('link', { name: '下载演示文件' })).toHaveAttribute(
      'href',
      '/demo/exports/project-preview.mp4',
    )
  })

  test('catches cancellation that leaves a job running', async () => {
    vi.useFakeTimers()
    const adapter = new ControlledExportAdapter()
    render(<ExportPanel projectId="project-preview" adapter={adapter} />)

    act(() => screen.getByRole('button', { name: '开始演示导出' }).click())
    await act(() => vi.advanceTimersByTimeAsync(0))
    await act(() => screen.getByRole('button', { name: '取消导出' }).click())

    expect(screen.getByText('已取消')).toBeVisible()
    expect(adapter.pending[0].signal.aborted).toBe(true)
  })

  test('catches retry replacing successful jobs or retrying the wrong failed item', async () => {
    vi.useFakeTimers()
    const adapter = new ControlledExportAdapter()
    render(<ExportPanel projectId="project-preview" adapter={adapter} />)

    act(() => screen.getByRole('button', { name: '开始演示导出' }).click())
    await act(() => vi.advanceTimersByTimeAsync(0))
    await act(async () => adapter.pending[0].resolve(result))

    act(() => screen.getByRole('button', { name: '开始演示导出' }).click())
    await act(() => vi.advanceTimersByTimeAsync(0))
    await act(async () => adapter.pending[1].reject(new Error('disk full')))

    const failed = screen.getByRole('listitem', { name: '导出任务 2' })
    expect(within(failed).getByText('导出失败')).toBeVisible()
    expect(screen.getAllByText('导出完成')).toHaveLength(1)

    act(() => within(failed).getByRole('button', { name: '重试任务 2' }).click())
    await act(() => vi.advanceTimersByTimeAsync(0))

    expect(adapter.requests).toHaveLength(3)
    expect(screen.getByRole('listitem', { name: '导出任务 1' })).toHaveTextContent(
      '导出完成',
    )
    expect(screen.getAllByRole('listitem', { name: /导出任务/ })).toHaveLength(2)
  })

  test('catches the demo adapter resolving early or producing a non-project URL', async () => {
    vi.useFakeTimers()
    const progress: number[] = []
    const adapter = new DemoExportAdapter('project-preview', (value) =>
      progress.push(value),
    )
    const promise = adapter.start(
      {
        width: 1920,
        height: 1080,
        aspectRatio: '16:9',
        frameRate: 24,
        watermark: false,
      },
      new AbortController().signal,
    )
    let settled = false
    void promise.then(() => {
      settled = true
    })

    await vi.advanceTimersByTimeAsync(1500)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(300)

    await expect(promise).resolves.toMatchObject({
      exportJobId: 'demo-export-project-preview',
      downloadUrl: '/demo/exports/project-preview.mp4',
    })
    expect(progress).toEqual([17, 33, 50, 67, 83, 100])
  })
})
