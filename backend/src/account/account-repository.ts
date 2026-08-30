export interface AccountUsage {
  imageCount: number
  videoSeconds: number
  textTokens: number
  audioCharacters: number
}

export type UsageModality = keyof AccountUsage

export interface InviteRecord {
  code: string
  enabled: boolean
  quota: AccountUsage
  userId?: string
  createdAt: string
  updatedAt: string
}

export interface AccountProfile {
  userId: string
  inviteCode: string
  quota: AccountUsage
  usage: AccountUsage
  createdAt: string
}

export type RegisterAccountResult =
  | { status: 'registered'; account: AccountProfile }
  | { status: 'invalid-invite' }
  | { status: 'device-conflict' }

export interface AccountRepository {
  listInvites(): Promise<InviteRecord[]>
  getInvite(code: string): Promise<InviteRecord | undefined>
  createInvite(invite: InviteRecord): Promise<boolean>
  updateInvite(invite: InviteRecord): Promise<boolean>
  disableInvite(code: string, updatedAt: string): Promise<boolean>
  registerDevice(
    code: string,
    deviceId: string,
    userId: string,
    now: string,
  ): Promise<RegisterAccountResult>
  getAccountByDevice(deviceId: string): Promise<AccountProfile | undefined>
  reserveUsage(userId: string, modality: UsageModality, amount: number): Promise<boolean>
  releaseUsage(userId: string, modality: UsageModality, amount: number): Promise<void>
}

export const defaultAccountQuota: AccountUsage = {
  imageCount: 100,
  videoSeconds: 300,
  textTokens: 100_000,
  audioCharacters: 50_000,
}

export function emptyAccountUsage(): AccountUsage {
  return { imageCount: 0, videoSeconds: 0, textTokens: 0, audioCharacters: 0 }
}
