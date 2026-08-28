import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { StyleGallery } from './StylePicker'
import { builtInStyles, styleSnapshot } from './style-model'
import { createFixtureProviderRegistry } from '../../test/provider-fixtures'

function setup(overrides = {}) {
  const repository = { load: vi.fn().mockResolvedValue({ cards: builtInStyles, preferences: [] }), setFavorite: vi.fn().mockResolvedValue(undefined), markUsed: vi.fn().mockResolvedValue(undefined), create: vi.fn().mockResolvedValue({ ...builtInStyles[0], id: 'custom-new', name: '自定义水墨', promptFragment: '黑白留白' }), ...overrides }
  const onSelect = vi.fn(), onClose = vi.fn()
  const view = render(<StyleGallery target="image" provider={createFixtureProviderRegistry().require('seedream-5-pro-api')} selected={styleSnapshot(builtInStyles[0])} repository={repository} onSelect={onSelect} onClose={onClose} />)
  return { repository, onSelect, onClose, view }
}

test('highlights selection, persists favorites and applies a full snapshot', async () => {
  const user = userEvent.setup(), { repository, onSelect } = setup()
  const article = await screen.findByRole('article', { name: builtInStyles[0].name })
  expect(article).toHaveAttribute('data-selected', 'true')
  await user.click(within(article).getByRole('button', { name: /收藏/ }))
  expect(repository.setFavorite).toHaveBeenCalledWith(builtInStyles[0].id, true)
  await user.click(screen.getByRole('tab', { name: '我的收藏' }))
  expect(screen.getAllByRole('article')).toHaveLength(1)
  await user.click(within(article).getByRole('button', { name: /应用风格/ }))
  expect(onSelect).toHaveBeenCalledWith(styleSnapshot(builtInStyles[0]))
  expect(repository.markUsed).toHaveBeenCalledWith(builtInStyles[0].id)
})

test('creates a real local style, exposes compatibility and disables AI training honestly', async () => {
  const user = userEvent.setup(), { repository } = setup()
  await user.click(screen.getByRole('button', { name: '自定义风格' }))
  await user.type(screen.getByRole('textbox', { name: '风格名称' }), '自定义水墨')
  await user.type(screen.getByRole('textbox', { name: '提示词片段' }), '黑白留白')
  await user.click(screen.getByRole('button', { name: '保存风格' }))
  expect(repository.create).toHaveBeenCalledWith({ name: '自定义水墨', promptFragment: '黑白留白' })
  expect(await screen.findByRole('article', { name: '自定义水墨' })).toBeVisible()
  expect(screen.getByRole('button', { name: 'AI训练' })).toBeDisabled()
  expect(screen.getByText('待接入风格训练服务')).toBeVisible()
})

test('failed database write does not claim favorite or apply success', async () => {
  const user = userEvent.setup(), { onSelect } = setup({ setFavorite: vi.fn().mockRejectedValue(new Error('private-db-error')), markUsed: vi.fn().mockRejectedValue(new Error('private-db-error')) })
  const article = await screen.findByRole('article', { name: builtInStyles[0].name })
  await user.click(within(article).getByRole('button', { name: /收藏/ }))
  expect(await screen.findByRole('alert')).toHaveTextContent('保存失败')
  expect(screen.queryByText('private-db-error')).not.toBeInTheDocument()
  await user.click(within(article).getByRole('button', { name: /应用风格/ }))
  expect(onSelect).not.toHaveBeenCalled()
})

test('Escape closes the gallery without selecting a style', async () => {
  const { onClose, onSelect } = setup()
  fireEvent.keyDown(screen.getByRole('dialog', { name: '风格广场' }), { key: 'Escape' })
  expect(onClose).toHaveBeenCalledOnce()
  expect(onSelect).not.toHaveBeenCalled()
})
