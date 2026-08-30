import {
  emptyAccountUsage,
  type AccountProfile,
  type AccountRepository,
  type AccountUsage,
  type InviteRecord,
  type RegisterAccountResult,
  type UsageModality,
} from './account-repository'
import {
  EdgeKvMutationQueue,
  edgeKvJson,
  edgeKvKeyPart,
  edgeKvKeys,
  putEdgeKvJson,
  type EdgeKvNamespace,
} from '../data/edgekv-namespace'

interface StoredInvite {
  version: number
  record: InviteRecord
}

interface StoredAccount {
  version: number
  userId: string
  inviteCode: string
  createdAt: string
}

interface StoredUsage {
  version: number
  usage: AccountUsage
  updatedAt: string
}

interface StoredDevice {
  version: number
  userId: string
  inviteCode: string
  createdAt: string
  lastSeenAt: string
}

function invitePrefix() {
  return 'v1:invite:'
}

function inviteKey(code: string) {
  return `${invitePrefix()}${edgeKvKeyPart(code)}`
}

function userKey(userId: string, suffix: 'account' | 'usage') {
  return `v1:user:${edgeKvKeyPart(userId)}:${suffix}`
}

function deviceKey(deviceId: string) {
  return `v1:device:${edgeKvKeyPart(deviceId)}`
}

export class EdgeKvAccountRepository implements AccountRepository {
  private readonly mutations = new EdgeKvMutationQueue()

  constructor(private readonly namespace: EdgeKvNamespace) {}

  async listInvites() {
    const values = await Promise.all(
      (await edgeKvKeys(this.namespace, invitePrefix()))
        .map((key) => edgeKvJson<StoredInvite>(this.namespace, key)),
    )
    return values
      .filter((value): value is StoredInvite => value !== undefined)
      .map((value) => value.record)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  }

  async getInvite(code: string) {
    return (await edgeKvJson<StoredInvite>(this.namespace, inviteKey(code)))?.record
  }

  async createInvite(invite: InviteRecord) {
    const key = inviteKey(invite.code)
    return this.mutations.run(key, async () => {
      if (await edgeKvJson<StoredInvite>(this.namespace, key)) return false
      await putEdgeKvJson(this.namespace, key, { version: 1, record: invite } satisfies StoredInvite)
      return true
    })
  }

  async updateInvite(invite: InviteRecord) {
    const key = inviteKey(invite.code)
    return this.mutations.run(key, async () => {
      const current = await edgeKvJson<StoredInvite>(this.namespace, key)
      if (!current) return false
      await putEdgeKvJson(this.namespace, key, {
        version: current.version + 1,
        record: { ...invite, ...(current.record.userId ? { userId: current.record.userId } : {}) },
      } satisfies StoredInvite)
      return true
    })
  }

  async disableInvite(code: string, updatedAt: string) {
    const key = inviteKey(code)
    return this.mutations.run(key, async () => {
      const current = await edgeKvJson<StoredInvite>(this.namespace, key)
      if (!current) return false
      await putEdgeKvJson(this.namespace, key, {
        version: current.version + 1,
        record: { ...current.record, enabled: false, updatedAt },
      } satisfies StoredInvite)
      return true
    })
  }

  private async account(userId: string): Promise<AccountProfile | undefined> {
    const stored = await edgeKvJson<StoredAccount>(this.namespace, userKey(userId, 'account'))
    const usage = await edgeKvJson<StoredUsage>(this.namespace, userKey(userId, 'usage'))
    if (!stored || !usage) return undefined
    const invite = await this.getInvite(stored.inviteCode)
    if (!invite) return undefined
    return {
      userId: stored.userId,
      inviteCode: stored.inviteCode,
      quota: invite.quota,
      usage: usage.usage,
      createdAt: stored.createdAt,
    }
  }

  async registerDevice(
    code: string,
    deviceId: string,
    proposedUserId: string,
    now: string,
  ): Promise<RegisterAccountResult> {
    return this.mutations.run('v1:account-registration', async () => {
      const existingDevice = await edgeKvJson<StoredDevice>(this.namespace, deviceKey(deviceId))
      if (existingDevice) {
        if (existingDevice.inviteCode !== code) return { status: 'device-conflict' }
        const existingAccount = await this.account(existingDevice.userId)
        return existingAccount
          ? { status: 'registered', account: existingAccount }
          : { status: 'invalid-invite' }
      }
      const storedInvite = await edgeKvJson<StoredInvite>(this.namespace, inviteKey(code))
      if (!storedInvite?.record.enabled) return { status: 'invalid-invite' }
      const userId = storedInvite.record.userId ?? proposedUserId
      if (!storedInvite.record.userId) {
        await putEdgeKvJson(this.namespace, inviteKey(code), {
          version: storedInvite.version + 1,
          record: { ...storedInvite.record, userId, updatedAt: now },
        } satisfies StoredInvite)
      }
      const accountKey = userKey(userId, 'account')
      if (!await edgeKvJson<StoredAccount>(this.namespace, accountKey)) {
        await putEdgeKvJson(this.namespace, accountKey, {
          version: 1, userId, inviteCode: code, createdAt: now,
        } satisfies StoredAccount)
      }
      const usageKey = userKey(userId, 'usage')
      if (!await edgeKvJson<StoredUsage>(this.namespace, usageKey)) {
        await putEdgeKvJson(this.namespace, usageKey, {
          version: 1, usage: emptyAccountUsage(), updatedAt: now,
        } satisfies StoredUsage)
      }
      await putEdgeKvJson(this.namespace, deviceKey(deviceId), {
        version: 1, userId, inviteCode: code, createdAt: now, lastSeenAt: now,
      } satisfies StoredDevice)
      const registered = await this.account(userId)
      return registered
        ? { status: 'registered', account: registered }
        : { status: 'invalid-invite' }
    })
  }

  async getAccountByDevice(deviceId: string) {
    const device = await edgeKvJson<StoredDevice>(this.namespace, deviceKey(deviceId))
    return device ? this.account(device.userId) : undefined
  }

  async reserveUsage(userId: string, modality: UsageModality, amount: number) {
    const key = userKey(userId, 'usage')
    return this.mutations.run(key, async () => {
      const account = await edgeKvJson<StoredAccount>(this.namespace, userKey(userId, 'account'))
      const current = await edgeKvJson<StoredUsage>(this.namespace, key)
      const invite = account ? await this.getInvite(account.inviteCode) : undefined
      if (!current || !invite || amount < 0) return false
      if (current.usage[modality] + amount > invite.quota[modality]) return false
      await putEdgeKvJson(this.namespace, key, {
        version: current.version + 1,
        usage: { ...current.usage, [modality]: current.usage[modality] + amount },
        updatedAt: new Date().toISOString(),
      } satisfies StoredUsage)
      return true
    })
  }

  async releaseUsage(userId: string, modality: UsageModality, amount: number) {
    const key = userKey(userId, 'usage')
    await this.mutations.run(key, async () => {
      const current = await edgeKvJson<StoredUsage>(this.namespace, key)
      if (!current) return
      await putEdgeKvJson(this.namespace, key, {
        version: current.version + 1,
        usage: { ...current.usage, [modality]: Math.max(0, current.usage[modality] - amount) },
        updatedAt: new Date().toISOString(),
      } satisfies StoredUsage)
    })
  }
}
