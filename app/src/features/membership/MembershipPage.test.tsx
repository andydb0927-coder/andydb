import { render, screen, within } from '@testing-library/react'
import { expect, test } from 'vitest'

import { makeProjectFixture } from '../../test/fixtures'
import { createFreeSubscription } from './membership-model'
import { MembershipPage } from './MembershipPage'

test('summarizes the local credit balance and real project job ledger', async () => {
  const project = makeProjectFixture()
  project.jobs[0] = {
    ...project.jobs[0],
    providerName: 'Mock Studio',
    modelName: 'Lib Image',
    creditsSpent: 18,
  }

  render(
    <MembershipPage
      projectRepository={{ listAll: async () => [project] }}
      membershipStore={{ get: async () => createFreeSubscription(() => '2026-08-27T00:00:00.000Z') }}
    />,
  )

  expect(await screen.findByRole('heading', { name: '积分与会员' })).toBeVisible()
  expect(screen.getByText('102')).toBeVisible()
  expect(screen.getByText('累计消耗 18 积分')).toBeVisible()

  const ledger = screen.getByRole('table', { name: '积分消耗流水' })
  expect(within(ledger).getByText('霜河渡')).toBeVisible()
  expect(within(ledger).getByText('Mock Studio · Lib Image')).toBeVisible()
  expect(within(ledger).getByText('-18')).toBeVisible()
})

test('shows the free, basic, and professional plans without faking payment', async () => {
  render(
    <MembershipPage
      projectRepository={{ listAll: async () => [] }}
      membershipStore={{ get: async () => createFreeSubscription(() => '2026-08-27T00:00:00.000Z') }}
    />,
  )

  expect(await screen.findByRole('heading', { name: '积分与会员' })).toBeVisible()
  for (const plan of ['免费版', '基础版', '专业版']) {
    expect(screen.getByRole('heading', { name: plan })).toBeVisible()
  }
  expect(screen.getByRole('button', { name: '当前套餐' })).toBeDisabled()
  const pendingPayments = screen.getAllByRole('button', { name: '支付待接入' })
  expect(pendingPayments).toHaveLength(2)
  pendingPayments.forEach((button) => expect(button).toBeDisabled())
})
