import { describe, expect, test } from 'vitest'

import {
  canUseFeature,
  cancelSubscription,
  createFreeSubscription,
  membershipPlans,
  renewSubscription,
  subscribe,
} from './membership-model'

const now = () => '2026-08-13T08:00:00.000Z'

describe('membership model', () => {
  test('publishes one stable feature matrix for all three local plans', () => {
    expect(membershipPlans.map(({ id }) => id)).toEqual([
      'free',
      'creator',
      'professional',
    ])
    expect(canUseFeature('free', 'advanced-export')).toBe(false)
    expect(canUseFeature('creator', 'advanced-export')).toBe(true)
    expect(canUseFeature('creator', 'batch-workflow')).toBe(false)
    expect(canUseFeature('professional', 'batch-workflow')).toBe(true)
  })

  test('subscribes, cancels to free, and renews the last paid plan locally', () => {
    const free = createFreeSubscription(now)
    const creator = subscribe(free, 'creator', now)

    expect(creator).toMatchObject({ plan: 'creator', status: 'active' })
    expect(creator.renewsAt).toBe('2026-09-13T08:00:00.000Z')

    const cancelled = cancelSubscription(creator, now)
    expect(cancelled).toMatchObject({
      plan: 'free',
      status: 'cancelled',
      previousPaidPlan: 'creator',
    })

    expect(renewSubscription(cancelled, now)).toMatchObject({
      plan: 'creator',
      status: 'active',
    })
  })
})
