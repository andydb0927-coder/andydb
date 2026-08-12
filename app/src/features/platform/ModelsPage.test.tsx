import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'

import type { GenerationProviderPreferenceStore } from '../generation/generation-provider-preference'
import type { LibTvCatalog } from '../generation/libtv-contract'
import { ModelsPage } from './ModelsPage'

const selection = {
  projectUuid: '11111111-2222-3333-4444-555555555555',
  projectName: '低成本验收',
  imageModelName: 'Image Model',
  videoModelName: 'Video Model',
}

const catalog: LibTvCatalog = {
  cliInstalled: true,
  cliVersion: '1.1.1',
  authenticated: true,
  writesEnabled: true,
  projects: [
    { uuid: selection.projectUuid, name: selection.projectName },
    { uuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', name: '第二画布' },
  ],
  imageModels: [
    {
      modelKey: 'image-key',
      modelName: selection.imageModelName,
      description: '真实图片模型摘要',
    },
  ],
  videoModels: [
    {
      modelKey: 'video-key',
      modelName: selection.videoModelName,
      description: '真实视频模型摘要',
      pricingRule: '每次提交按服务端规则计费',
      estimatedTime: '约 2 分钟',
      vip: false,
    },
  ],
}

function createStore(
  initial: ReturnType<GenerationProviderPreferenceStore['read']> = {
    provider: 'demo',
  },
) {
  const write = vi.fn<GenerationProviderPreferenceStore['write']>()
  const store: GenerationProviderPreferenceStore = {
    read: () => initial,
    write,
  }
  return { store, write }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

async function chooseCompleteLibTvSelection(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('radio', { name: 'LibTV 实际生成' }))
  await user.selectOptions(
    screen.getByRole('combobox', { name: '远程画布' }),
    selection.projectUuid,
  )
  await user.selectOptions(
    screen.getByRole('combobox', { name: '图片模型' }),
    selection.imageModelName,
  )
  await user.selectOptions(
    screen.getByRole('combobox', { name: '视频模型' }),
    selection.videoModelName,
  )
}

describe('ModelsPage', () => {
  test('preserves the local Demo capability filters', async () => {
    const user = userEvent.setup()
    const { store } = createStore()
    render(
      <ModelsPage
        catalogLoader={() => Promise.resolve(catalog)}
        preferenceStore={store}
      />,
    )

    await user.click(screen.getByRole('radio', { name: '视频' }))

    expect(screen.getByText('演示视频草稿')).toBeVisible()
    expect(screen.queryByText('演示图像草稿')).not.toBeInTheDocument()
    expect(screen.getByText('本地演示适配器')).toBeVisible()
  })

  test('loads the catalog once, exposes an accessible loading status, and ignores rerenders', async () => {
    const pending = deferred<LibTvCatalog>()
    const loader = vi.fn(() => pending.promise)
    const { store } = createStore()
    const view = render(
      <ModelsPage catalogLoader={loader} preferenceStore={store} />,
    )

    expect(screen.getByRole('status')).toHaveTextContent('正在读取 LibTV 目录')
    expect(loader).toHaveBeenCalledTimes(1)
    view.rerender(<ModelsPage catalogLoader={loader} preferenceStore={store} />)
    expect(loader).toHaveBeenCalledTimes(1)

    pending.resolve(catalog)
    expect(await screen.findByRole('combobox', { name: '远程画布' })).toBeVisible()
    expect(loader).toHaveBeenCalledTimes(1)
  })

  test('shows a fixed alert on read failure and retries only after the explicit action', async () => {
    const user = userEvent.setup()
    const loader = vi
      .fn<() => Promise<LibTvCatalog>>()
      .mockRejectedValueOnce(new Error('PRIVATE_TOKEN account@example.test'))
      .mockResolvedValueOnce(catalog)
    const { store } = createStore()
    render(<ModelsPage catalogLoader={loader} preferenceStore={store} />)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('无法读取 LibTV 目录，请重试。')
    expect(alert).not.toHaveTextContent('PRIVATE_TOKEN')
    expect(loader).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: '重试 LibTV 目录' }))

    expect(await screen.findByText('LibTV CLI 1.1.1')).toBeVisible()
    expect(loader).toHaveBeenCalledTimes(2)
  })

  test.each([
    ['CLI unavailable', { cliInstalled: false }],
    ['unauthenticated', { authenticated: false }],
    ['writes disabled', { writesEnabled: false }],
  ])('keeps LibTV enable disabled when %s', async (_case, catalogPatch) => {
    const user = userEvent.setup()
    const { store } = createStore()
    render(
      <ModelsPage
        catalogLoader={() => Promise.resolve({ ...catalog, ...catalogPatch })}
        preferenceStore={store}
      />,
    )
    await screen.findByRole('combobox', { name: '远程画布' })

    await chooseCompleteLibTvSelection(user)

    expect(
      screen.getByRole('button', { name: '启用 LibTV 实际生成' }),
    ).toBeDisabled()
  })

  test('persists only a complete catalog-member selection on explicit enable', async () => {
    const user = userEvent.setup()
    const { store, write } = createStore()
    render(
      <ModelsPage
        catalogLoader={() => Promise.resolve(catalog)}
        preferenceStore={store}
      />,
    )
    await screen.findByRole('combobox', { name: '远程画布' })

    await chooseCompleteLibTvSelection(user)

    expect(write).not.toHaveBeenCalled()
    expect(screen.getByText('真实图片模型摘要')).toBeVisible()
    expect(screen.getByText('费用以 LibTV 提交时为准')).toBeVisible()
    expect(screen.getByText('每次提交按服务端规则计费')).toBeVisible()
    const enable = screen.getByRole('button', { name: '启用 LibTV 实际生成' })
    expect(enable).toBeEnabled()

    await user.click(enable)

    expect(write).toHaveBeenCalledWith({ provider: 'libtv', selection })
    expect(screen.getByRole('status')).toHaveTextContent('已启用 LibTV 实际生成')
    expect(enable).toHaveFocus()
  })

  test('switches back to Demo only through its explicit persisted action', async () => {
    const user = userEvent.setup()
    const { store, write } = createStore({ provider: 'libtv', selection })
    render(
      <ModelsPage
        catalogLoader={() => Promise.resolve(catalog)}
        preferenceStore={store}
      />,
    )
    await screen.findByRole('combobox', { name: '远程画布' })

    await user.click(screen.getByRole('radio', { name: 'Demo 本地演示' }))
    expect(write).not.toHaveBeenCalled()
    const enableDemo = screen.getByRole('button', { name: '启用 Demo 本地演示' })

    await user.click(enableDemo)

    expect(write).toHaveBeenCalledWith({ provider: 'demo' })
    expect(screen.getByRole('status')).toHaveTextContent('已启用 Demo 本地演示')
    expect(enableDemo).toHaveFocus()
  })

  test('does not auto-write when a refresh removes persisted catalog members', async () => {
    const user = userEvent.setup()
    const loader = vi
      .fn<() => Promise<LibTvCatalog>>()
      .mockResolvedValueOnce(catalog)
      .mockResolvedValueOnce({ ...catalog, imageModels: [] })
    const { store, write } = createStore({ provider: 'libtv', selection })
    render(<ModelsPage catalogLoader={loader} preferenceStore={store} />)
    expect(
      await screen.findByRole('button', { name: '启用 LibTV 实际生成' }),
    ).toBeEnabled()

    await user.click(screen.getByRole('button', { name: '刷新 LibTV 目录' }))

    expect(loader).toHaveBeenCalledTimes(2)
    expect(
      await screen.findByRole('button', { name: '启用 LibTV 实际生成' }),
    ).toBeDisabled()
    expect(write).not.toHaveBeenCalled()
  })

  test('never renders or persists non-contract account and token fields', async () => {
    const { store, write } = createStore()
    const privateCatalog = {
      ...catalog,
      token: 'PRIVATE_TOKEN',
      account: 'private@example.test',
    }
    render(
      <ModelsPage
        catalogLoader={() => Promise.resolve(privateCatalog)}
        preferenceStore={store}
      />,
    )

    await screen.findByText('LibTV CLI 1.1.1')

    expect(screen.queryByText('PRIVATE_TOKEN')).not.toBeInTheDocument()
    expect(screen.queryByText('private@example.test')).not.toBeInTheDocument()
    expect(write).not.toHaveBeenCalled()
  })
})
