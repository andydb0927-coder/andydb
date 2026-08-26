export type MembershipPlanId = 'free' | 'creator' | 'professional'
export type MembershipFeature =
  | 'local-projects'
  | 'collaboration'
  | 'advanced-export'
  | 'batch-workflow'

export interface MembershipPlanDefinition {
  id: MembershipPlanId
  name: string
  priceLabel: string
  description: string
  features: Record<MembershipFeature, boolean>
}

export interface MembershipSubscription {
  id: 'local-membership'
  plan: MembershipPlanId
  status: 'active' | 'cancelled'
  previousPaidPlan?: Exclude<MembershipPlanId, 'free'>
  startedAt: string
  updatedAt: string
  renewsAt?: string
}

export const membershipPlans: MembershipPlanDefinition[] = [
  {
    id: 'free',
    name: '免费版',
    priceLabel: '¥0 / 月',
    description: '本地项目、基础时间线与协作标记。',
    features: {
      'local-projects': true,
      collaboration: true,
      'advanced-export': false,
      'batch-workflow': false,
    },
  },
  {
    id: 'creator',
    name: '基础版',
    priceLabel: '¥39 / 月（模拟）',
    description: '增加 EDL 与预览录制等高级导出。',
    features: {
      'local-projects': true,
      collaboration: true,
      'advanced-export': true,
      'batch-workflow': false,
    },
  },
  {
    id: 'professional',
    name: '专业版',
    priceLabel: '¥99 / 月（模拟）',
    description: '开放高级导出与批量、并行工作流。',
    features: {
      'local-projects': true,
      collaboration: true,
      'advanced-export': true,
      'batch-workflow': true,
    },
  },
]

export function membershipPlan(plan: MembershipPlanId) {
  return membershipPlans.find(({ id }) => id === plan)!
}

export function canUseFeature(
  plan: MembershipPlanId,
  feature: MembershipFeature,
) {
  return membershipPlan(plan).features[feature]
}

function nextMonth(timestamp: string) {
  const date = new Date(timestamp)
  date.setUTCMonth(date.getUTCMonth() + 1)
  return date.toISOString()
}

export function createFreeSubscription(
  now: () => string = () => new Date().toISOString(),
): MembershipSubscription {
  const timestamp = now()
  return {
    id: 'local-membership',
    plan: 'free',
    status: 'active',
    startedAt: timestamp,
    updatedAt: timestamp,
  }
}

export function subscribe(
  current: MembershipSubscription,
  plan: Exclude<MembershipPlanId, 'free'>,
  now: () => string = () => new Date().toISOString(),
): MembershipSubscription {
  const timestamp = now()
  return {
    ...current,
    plan,
    status: 'active',
    previousPaidPlan: plan,
    startedAt: timestamp,
    updatedAt: timestamp,
    renewsAt: nextMonth(timestamp),
  }
}

export function cancelSubscription(
  current: MembershipSubscription,
  now: () => string = () => new Date().toISOString(),
): MembershipSubscription {
  const timestamp = now()
  const previousPaidPlan =
    current.plan === 'free' ? current.previousPaidPlan : current.plan
  return {
    ...current,
    plan: 'free',
    status: 'cancelled',
    previousPaidPlan,
    updatedAt: timestamp,
    renewsAt: undefined,
  }
}

export function renewSubscription(
  current: MembershipSubscription,
  now: () => string = () => new Date().toISOString(),
) {
  return subscribe(current, current.previousPaidPlan ?? 'creator', now)
}
