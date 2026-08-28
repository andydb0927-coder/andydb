import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { expect, test, vi } from 'vitest'

import { CreateSubjectDialog } from './CreateSubjectDialog'

test('similar subjects require merge or explicit new save; cancel performs no write', async () => {
  const user = userEvent.setup(), onSubmit = vi.fn()
  const onFindSimilar = vi.fn(async () => [{ score: 0.9, sameSource: false, subject: { id: 'existing', name: '已有旅人', description: '短发黑衣', tags: [], coverUrl: '/image.png', sampleImages: [], createdAt: '', updatedAt: '' } }])
  render(<CreateSubjectDialog sourceTitle="图" coverUrl="/image.png" onCancel={vi.fn()} onSubmit={onSubmit} onFindSimilar={onFindSimilar} />)
  await user.click(screen.getByRole('button', { name: '保存到主体库' }))
  expect(await screen.findByRole('region', { name: '相似主体提示' })).toBeVisible()
  expect(onSubmit).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: '返回修改' }))
  expect(onSubmit).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: '保存到主体库' }))
  await user.click(await screen.findByRole('button', { name: '合并到已有旅人' }))
  expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: '图 主体' }), 'existing')
})

test('collects local subject metadata while keeping AI extraction explicitly disabled', async () => {
  const user = userEvent.setup()
  const onSubmit = vi.fn()
  render(
    <CreateSubjectDialog
      sourceTitle="雨夜角色图"
      coverUrl="data:image/png;base64,cover"
      onCancel={vi.fn()}
      onSubmit={onSubmit}
    />,
  )

  expect(screen.getByRole('img', { name: '雨夜角色图主体封面' })).toBeVisible()
  expect(screen.getByRole('button', { name: 'AI 身份提取' })).toBeDisabled()
  expect(screen.getByText('火山方舟主体提取开发验证配置未完成；可手动创建主体。')).toBeVisible()
  await user.clear(screen.getByLabelText('主体名称'))
  await user.type(screen.getByLabelText('主体名称'), '雨夜旅人')
  await user.type(screen.getByLabelText('主体描述'), '黑色风衣，冷色轮廓光')
  await user.type(screen.getByLabelText('主体标签'), '主角, 雨夜')
  await user.click(screen.getByRole('button', { name: '保存到主体库' }))

  expect(onSubmit).toHaveBeenCalledWith({
    name: '雨夜旅人',
    description: '黑色风衣，冷色轮廓光',
    tags: ['主角', '雨夜'],
  })
})

const draft = {
  name: '蓝衣旅人', appearance: '短发', clothing: '蓝色外套', tags: ['人物'],
  providerId: 'ai-subject-extraction', modelName: '豆包 Seed 2.1 Pro', extractedAt: '2026-08-27T08:00:00.000Z',
  usage: { providerId: 'ai-subject-extraction', providerName: '火山方舟', modelName: '豆包 Seed 2.1 Pro', cost: 1, currency: 'credits' as const, inputTokens: 2000, outputTokens: 300, estimatedCostCny: 0.021 },
}

test('a similarity lookup never submits stale values after the user edits the form', async () => {
  let finish!: (value: []) => void
  const onSubmit = vi.fn()
  render(<CreateSubjectDialog sourceTitle="图" coverUrl="/demo/image.png" onCancel={vi.fn()} onSubmit={onSubmit} onFindSimilar={() => new Promise(resolve => { finish = resolve })} />)
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: '保存到主体库' }))
  await user.type(screen.getByLabelText('主体描述'), '核对期间新写的特征')
  await act(async () => finish([]))
  expect(onSubmit).not.toHaveBeenCalled()
  expect(screen.getByRole('alert')).toHaveTextContent('资料已变更')
  expect(screen.getByRole('button', { name: '保存到主体库' })).toBeEnabled()
})

test('auto-extracts exactly once in StrictMode and only saves a reviewed draft on submission', async () => {
  const onExtract = vi.fn(async () => draft)
  const onSubmit = vi.fn()
  render(<StrictMode><CreateSubjectDialog sourceTitle="图" coverUrl="data:image/png;base64,YQ==" onCancel={vi.fn()} onSubmit={onSubmit} onExtract={onExtract} /></StrictMode>)
  await waitFor(() => expect(screen.getByLabelText('主体名称')).toHaveValue('蓝衣旅人'))
  expect(onExtract).toHaveBeenCalledTimes(1)
  expect(onSubmit).not.toHaveBeenCalled()
  expect(screen.getByLabelText('主体外貌')).toHaveValue('短发')
  expect(screen.getByLabelText('主体服装')).toHaveValue('蓝色外套')
  expect(screen.getByRole('status')).toHaveTextContent('0.021')
  const user = userEvent.setup()
  await user.clear(screen.getByLabelText('主体服装'))
  await user.type(screen.getByLabelText('主体服装'), '浅蓝大衣')
  await user.click(screen.getByRole('button', { name: '保存到主体库' }))
  expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: '蓝衣旅人', aiExtraction: expect.objectContaining({ appearance: '短发', clothing: '浅蓝大衣', usage: draft.usage }) }))
})

test('does not overwrite fields edited while extraction is pending', async () => {
  let finish!: (value: typeof draft) => void
  const onExtract = vi.fn(() => new Promise<typeof draft>(resolve => { finish = resolve }))
  render(<CreateSubjectDialog sourceTitle="图" coverUrl="data:image/png;base64,YQ==" onCancel={vi.fn()} onSubmit={vi.fn()} onExtract={onExtract} />)
  await waitFor(() => expect(onExtract).toHaveBeenCalledTimes(1))
  const user = userEvent.setup()
  await user.clear(screen.getByLabelText('主体名称'))
  await user.type(screen.getByLabelText('主体名称'), '我自己的角色')
  await user.type(screen.getByLabelText('主体描述'), '我写的描述')
  await act(async () => finish(draft))
  expect(screen.getByLabelText('主体名称')).toHaveValue('我自己的角色')
  expect(screen.getByLabelText('主体描述')).toHaveValue('我写的描述')
  expect(screen.getByLabelText('主体标签')).toHaveValue('人物')
})

test('cancels in-flight extraction on Escape without saving or applying a late response', async () => {
  let signal!: AbortSignal
  let finish!: (value: typeof draft) => void
  const onExtract = vi.fn((value: AbortSignal) => { signal = value; return new Promise<typeof draft>(resolve => { finish = resolve }) })
  const onSubmit = vi.fn(), onCancel = vi.fn()
  const { unmount } = render(<CreateSubjectDialog sourceTitle="图" coverUrl="data:image/png;base64,YQ==" onCancel={onCancel} onSubmit={onSubmit} onExtract={onExtract} />)
  await waitFor(() => expect(onExtract).toHaveBeenCalledTimes(1))
  await userEvent.setup().keyboard('{Escape}')
  expect(onCancel).toHaveBeenCalledTimes(1)
  expect(signal.aborted).toBe(true)
  await act(async () => finish(draft))
  expect(screen.getByLabelText('主体名称')).toHaveValue('图 主体')
  unmount()
  expect(onSubmit).not.toHaveBeenCalled()
})

test('keeps manual save available after sanitized extraction failure and retries only on request', async () => {
  const onExtract = vi.fn().mockRejectedValueOnce(new Error('private-key')).mockResolvedValueOnce(draft)
  const onSubmit = vi.fn()
  render(<CreateSubjectDialog sourceTitle="图" coverUrl="data:image/png;base64,YQ==" onCancel={vi.fn()} onSubmit={onSubmit} onExtract={onExtract} />)
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('主体提取失败'))
  expect(screen.queryByText('private-key')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '保存到主体库' })).toBeEnabled()
  await userEvent.setup().click(screen.getByRole('button', { name: 'AI 身份提取' }))
  await waitFor(() => expect(screen.getByLabelText('主体名称')).toHaveValue('蓝衣旅人'))
  expect(onExtract).toHaveBeenCalledTimes(2)
})

test('shows the safe image validation reason so the user can correct the source', async () => {
  const message = '主体图片需小于10MB，请先压缩。'
  render(<CreateSubjectDialog sourceTitle="图" coverUrl="data:image/png;base64,YQ==" onCancel={vi.fn()} onSubmit={vi.fn()} onExtract={vi.fn().mockRejectedValue(new Error(message))} />)
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(message))
  expect(screen.getByRole('button', { name: '保存到主体库' })).toBeEnabled()
})

test('releases pending extraction when manual save leaves the dialog open after a storage failure', async () => {
  let firstSignal!: AbortSignal
  let finish!: (value: typeof draft) => void
  const onExtract = vi.fn()
    .mockImplementationOnce((signal: AbortSignal) => {
      firstSignal = signal
      return new Promise<typeof draft>(resolve => { finish = resolve })
    })
    .mockResolvedValueOnce(draft)
  const onSubmit = vi.fn()
  const props = { sourceTitle: '图', coverUrl: 'data:image/png;base64,YQ==', onCancel: vi.fn(), onSubmit, onExtract }
  const { rerender } = render(<CreateSubjectDialog {...props} />)
  await waitFor(() => expect(onExtract).toHaveBeenCalledTimes(1))
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: '保存到主体库' }))
  expect(firstSignal.aborted).toBe(true)
  expect(onSubmit).toHaveBeenCalledWith({ name: '图 主体', description: '', tags: [] })
  rerender(<CreateSubjectDialog {...props} error="本地存储不可用，请重试。" />)
  expect(screen.queryByText('正在提取主体描述，可继续编辑或取消。')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'AI 身份提取' })).toBeEnabled()
  await user.click(screen.getByRole('button', { name: 'AI 身份提取' }))
  await waitFor(() => expect(screen.getByLabelText('主体名称')).toHaveValue('蓝衣旅人'))
  await act(async () => finish({ ...draft, name: '过期响应' }))
  expect(screen.getByLabelText('主体名称')).toHaveValue('蓝衣旅人')
  expect(onExtract).toHaveBeenCalledTimes(2)
})
