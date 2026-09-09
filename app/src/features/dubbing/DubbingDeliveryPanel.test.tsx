import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { DubbingDeliveryPanel } from './DubbingDeliveryPanel'
import { approvedDeliveryFixture } from './__fixtures__/dubbing-delivery.fixture'

test('红色阻塞原因可读、未通过禁止导出、Esc关闭', async () => {
  const state = approvedDeliveryFixture(); delete state.shots[0].deliveryEvidence
  const close = vi.fn(), exportPackage = vi.fn()
  render(<DubbingDeliveryPanel workspace={state} selectedId="shot-1" onClose={close} saveEvidence={vi.fn()} exportPackage={exportPackage} />)
  expect(screen.getByRole('alert')).toHaveTextContent('外部检测报告缺失')
  await userEvent.type(screen.getByLabelText('交付包名称或引用'), '交付-1')
  expect(screen.getByRole('button', { name: '生成交付清单并记录交付' })).toBeDisabled()
  await userEvent.keyboard('{Escape}')
  expect(close).toHaveBeenCalledOnce(); expect(exportPackage).not.toHaveBeenCalled()
})
test('全部通过后提交整集范围和总集数，保存失败保留面板并报中文原因', async () => {
  const state = approvedDeliveryFixture(), exportPackage = vi.fn().mockRejectedValue(new Error('工作台已在另一处更新，请刷新后重试。'))
  render(<DubbingDeliveryPanel workspace={state} selectedId="shot-1" onClose={vi.fn()} saveEvidence={vi.fn()} exportPackage={exportPackage} />)
  await userEvent.selectOptions(screen.getByLabelText('交付范围'), 'episode')
  await userEvent.type(screen.getByLabelText('交付包名称或引用'), 'EP001-final')
  await userEvent.click(screen.getByRole('button', { name: '生成交付清单并记录交付' }))
  expect(exportPackage).toHaveBeenCalledWith({ type: 'episode', episodeNumber: 1 }, 1, 'EP001-final')
  expect(await screen.findByRole('alert')).toHaveTextContent('另一处更新')
  expect(within(screen.getByRole('dialog')).getByText(/不含媒体文件/)).toBeVisible()
})
