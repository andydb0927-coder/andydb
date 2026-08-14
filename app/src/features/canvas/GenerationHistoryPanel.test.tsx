import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import type { Project } from '../project/model'
import { GenerationHistoryPanel } from './GenerationHistoryPanel'

const now = new Date('2026-08-15T12:00:00.000Z')

function historyProject(): Project {
  return {
    id: 'history-project',
    title: '生成历史验收',
    intent: '验证生成历史完整交互',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: now.toISOString(),
    assets: [
      { id: 'asset-image', kind: 'image', url: '/demo/image.png', mimeType: 'image/png' },
      { id: 'asset-video', kind: 'video', url: '/demo/video.mp4', mimeType: 'video/mp4' },
      { id: 'asset-audio', kind: 'audio', url: '/demo/audio.mp3', mimeType: 'audio/mpeg' },
    ],
    nodes: [
      {
        id: 'image-node',
        kind: 'image',
        title: '角色定妆',
        position: { x: 0, y: 0 },
        versions: [{ id: 'image-v1', createdAt: now.toISOString(), prompt: '雨夜角色', assetId: 'asset-image' }],
        activeVersionId: 'image-v1',
        sourceChanged: false,
      },
      {
        id: 'video-node',
        kind: 'video',
        title: '追逐镜头',
        position: { x: 300, y: 0 },
        versions: [{ id: 'video-v1', createdAt: now.toISOString(), prompt: '镜头推进', assetId: 'asset-video' }],
        activeVersionId: 'video-v1',
        sourceChanged: false,
      },
      {
        id: 'audio-node',
        kind: 'text',
        title: '雨声音效',
        position: { x: 600, y: 0 },
        versions: [{ id: 'audio-v1', createdAt: now.toISOString(), prompt: '雨声', assetId: 'asset-audio' }],
        activeVersionId: 'audio-v1',
        sourceChanged: false,
      },
    ],
    edges: [],
    timeline: [],
    jobs: [
      {
        id: 'job-image-today',
        projectId: 'history-project',
        nodeId: 'image-node',
        status: 'succeeded',
        prompt: '电影感雨夜角色，蓝绿调',
        createdAt: '2026-08-15T08:00:00.000Z',
        updatedAt: '2026-08-15T08:01:00.000Z',
        assetId: 'asset-image',
        providerId: 'mock-mj-image',
        providerName: 'Mock Studio',
        modelName: 'MJ 风格图片',
        generationConfig: {
          targetKind: 'image',
          providerId: 'mock-mj-image',
          parameters: { aspectRatio: '16:9', resolution: '1920×1080' },
          referenceAssets: [{ url: '/demo/reference.png', kind: 'image', mimeType: 'image/png' }],
        },
      },
      {
        id: 'job-image-older',
        projectId: 'history-project',
        nodeId: 'image-node',
        status: 'failed',
        prompt: '失败的图片任务',
        createdAt: '2026-08-10T08:00:00.000Z',
        updatedAt: '2026-08-10T08:01:00.000Z',
        generationConfig: {
          targetKind: 'image',
          referenceAssets: [],
        },
      },
      {
        id: 'job-video-yesterday',
        projectId: 'history-project',
        nodeId: 'video-node',
        status: 'succeeded',
        prompt: '雨夜追逐镜头',
        createdAt: '2026-08-14T08:00:00.000Z',
        updatedAt: '2026-08-14T08:01:00.000Z',
        assetId: 'asset-video',
        modelName: '可灵风格视频',
        generationConfig: {
          targetKind: 'video',
          parameters: { duration: 5, quality: '高清', sound: true },
          referenceAssets: [],
        },
      },
      {
        id: 'job-audio-specific',
        projectId: 'history-project',
        nodeId: 'audio-node',
        status: 'succeeded',
        prompt: '持续雨声与远处雷声',
        createdAt: '2026-07-20T08:00:00.000Z',
        updatedAt: '2026-07-20T08:01:00.000Z',
        assetId: 'asset-audio',
        generationConfig: {
          targetKind: 'audio',
          referenceAssets: [],
        },
      },
    ],
    exportJobs: [],
  }
}

test('filters image, video and audio history and groups jobs by date', async () => {
  const user = userEvent.setup()
  render(
    <GenerationHistoryPanel
      project={historyProject()}
      now={now}
      onDeleteJobs={vi.fn()}
      onResend={vi.fn()}
      onUse={vi.fn()}
    />,
  )

  expect(screen.getByRole('tab', { name: '图片 2' })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('heading', { name: '今天' })).toBeVisible()
  expect(screen.getByRole('heading', { name: '更早 · 2026年8月10日' })).toBeVisible()
  expect(screen.getByText('电影感雨夜角色，蓝绿调')).toBeVisible()
  expect(screen.queryByText('雨夜追逐镜头')).not.toBeInTheDocument()

  await user.click(screen.getByRole('tab', { name: '视频 1' }))
  expect(screen.getByRole('heading', { name: '昨天' })).toBeVisible()
  expect(screen.getByText('雨夜追逐镜头')).toBeVisible()

  await user.click(screen.getByRole('tab', { name: '音频 1' }))
  expect(screen.getByRole('heading', { name: '更早 · 2026年7月20日' })).toBeVisible()
  expect(screen.getByText('持续雨声与远处雷声')).toBeVisible()
})

test('supports selection, inversion, bulk download and one bulk delete callback', async () => {
  const user = userEvent.setup()
  const onDeleteJobs = vi.fn()
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  render(
    <GenerationHistoryPanel
      project={historyProject()}
      now={now}
      onDeleteJobs={onDeleteJobs}
      onResend={vi.fn()}
      onUse={vi.fn()}
    />,
  )

  await user.click(screen.getByRole('button', { name: '全选当前页' }))
  expect(screen.getByRole('checkbox', { name: '选择历史任务 角色定妆' })).toBeChecked()
  expect(screen.getByRole('checkbox', { name: '选择历史任务 失败的图片任务' })).toBeChecked()
  await user.click(screen.getByRole('button', { name: '反选当前页' }))
  for (const checkbox of screen.getAllByRole('checkbox')) {
    expect(checkbox).not.toBeChecked()
  }

  await user.click(screen.getByRole('checkbox', { name: '选择历史任务 角色定妆' }))
  await user.click(screen.getByRole('button', { name: '批量下载' }))
  expect(click).toHaveBeenCalledOnce()
  await user.click(screen.getByRole('button', { name: '批量删除' }))
  expect(onDeleteJobs).toHaveBeenCalledWith(['job-image-today'])
})

test('changes thumbnail size and exposes preview, use, download and confirmed resend', async () => {
  const user = userEvent.setup()
  const onUse = vi.fn()
  const onResend = vi.fn()
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  render(
    <GenerationHistoryPanel
      project={historyProject()}
      now={now}
      onDeleteJobs={vi.fn()}
      onResend={onResend}
      onUse={onUse}
    />,
  )
  click.mockClear()
  const panel = screen.getByLabelText('生成历史内容')
  expect(panel).toHaveAttribute('data-thumbnail-size', 'large')
  await user.click(screen.getByRole('button', { name: '小缩略图' }))
  expect(panel).toHaveAttribute('data-thumbnail-size', 'small')

  const row = screen.getByRole('article', { name: '历史任务 角色定妆' })
  await user.click(within(row).getByRole('button', { name: '查看 角色定妆' }))
  expect(screen.getByRole('dialog', { name: '预览 角色定妆' })).toBeVisible()
  await user.keyboard('{Escape}')

  await user.click(within(row).getByRole('button', { name: '使用 角色定妆' }))
  expect(onUse).toHaveBeenCalledWith('job-image-today')
  await user.click(within(row).getByRole('button', { name: '下载 角色定妆' }))
  expect(click).toHaveBeenCalledOnce()

  await user.click(within(row).getByRole('button', { name: '重发画布 角色定妆' }))
  const resend = screen.getByRole('dialog', { name: '重发画布配置' })
  expect(resend).toHaveTextContent('电影感雨夜角色，蓝绿调')
  expect(resend).toHaveTextContent('MJ 风格图片')
  expect(resend).toHaveTextContent('aspectRatio：16:9')
  expect(resend).toHaveTextContent('引用 1 项')
  await user.click(within(resend).getByRole('button', { name: '确认重新生成' }))
  expect(onResend).toHaveBeenCalledWith('job-image-today')
})

test('renders explicit loading and filtered empty states', async () => {
  const user = userEvent.setup()
  const { rerender } = render(
    <GenerationHistoryPanel
      loading
      project={historyProject()}
      now={now}
      onDeleteJobs={vi.fn()}
      onResend={vi.fn()}
      onUse={vi.fn()}
    />,
  )
  expect(screen.getByRole('status')).toHaveTextContent('正在加载生成历史')

  const empty = historyProject()
  empty.jobs = empty.jobs.filter((job) => job.generationConfig?.targetKind !== 'audio')
  rerender(
    <GenerationHistoryPanel
      project={empty}
      now={now}
      onDeleteJobs={vi.fn()}
      onResend={vi.fn()}
      onUse={vi.fn()}
    />,
  )
  await user.click(screen.getByRole('tab', { name: '音频 0' }))
  expect(screen.getByText('暂无音频生成历史')).toBeVisible()
})
