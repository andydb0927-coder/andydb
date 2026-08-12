import type { WirelessCanvasDatabase } from '../project/project-repository'
import {
  cancelSubscription,
  createFreeSubscription,
  renewSubscription,
  subscribe,
  type MembershipPlanId,
  type MembershipSubscription,
} from './membership-model'

export interface MembershipStore {
  get(): Promise<MembershipSubscription>
  subscribe(plan: Exclude<MembershipPlanId, 'free'>): Promise<MembershipSubscription>
  cancel(): Promise<MembershipSubscription>
  renew(): Promise<MembershipSubscription>
}

export class MembershipRepository implements MembershipStore {
  private readonly database: WirelessCanvasDatabase
  private readonly now: () => string

  constructor(
    database: WirelessCanvasDatabase,
    now: () => string = () => new Date().toISOString(),
  ) {
    this.database = database
    this.now = now
  }

  async get(): Promise<MembershipSubscription> {
    return (
      (await this.database.membership.get('local-membership')) ??
      createFreeSubscription(this.now)
    )
  }

  private async update(
    transition: (current: MembershipSubscription) => MembershipSubscription,
  ) {
    return this.database.transaction('rw', this.database.membership, async () => {
      const next = transition(await this.get())
      await this.database.membership.put(next)
      return next
    })
  }

  subscribe(plan: Exclude<MembershipPlanId, 'free'>) {
    return this.update((current) => subscribe(current, plan, this.now))
  }

  cancel() {
    return this.update((current) => cancelSubscription(current, this.now))
  }

  renew() {
    return this.update((current) => renewSubscription(current, this.now))
  }
}
