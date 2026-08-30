import type {
  AccountProfile,
  AccountRepository,
  AccountUsage,
  InviteRecord,
  RegisterAccountResult,
  UsageModality,
} from './account-repository'

interface InviteDatabaseRow {
  code: string
  enabled: number
  user_id: string | null
  image_limit: number
  video_seconds_limit: number
  text_tokens_limit: number
  audio_characters_limit: number
  created_at: string
  updated_at: string
}

interface AccountDatabaseRow extends InviteDatabaseRow {
  resolved_user_id: string
  invite_code: string
  user_created_at: string
  image_count: number
  video_seconds: number
  text_tokens: number
  audio_characters: number
}

const usageColumns: Record<UsageModality, string> = {
  imageCount: 'image_count',
  videoSeconds: 'video_seconds',
  textTokens: 'text_tokens',
  audioCharacters: 'audio_characters',
}

const quotaColumns: Record<UsageModality, string> = {
  imageCount: 'image_limit',
  videoSeconds: 'video_seconds_limit',
  textTokens: 'text_tokens_limit',
  audioCharacters: 'audio_characters_limit',
}

function quota(row: InviteDatabaseRow): AccountUsage {
  return {
    imageCount: row.image_limit,
    videoSeconds: row.video_seconds_limit,
    textTokens: row.text_tokens_limit,
    audioCharacters: row.audio_characters_limit,
  }
}

function invite(row: InviteDatabaseRow): InviteRecord {
  return {
    code: row.code,
    enabled: row.enabled === 1,
    quota: quota(row),
    ...(row.user_id ? { userId: row.user_id } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function account(row: AccountDatabaseRow): AccountProfile {
  return {
    userId: row.resolved_user_id,
    inviteCode: row.invite_code,
    quota: quota(row),
    usage: {
      imageCount: row.image_count,
      videoSeconds: row.video_seconds,
      textTokens: row.text_tokens,
      audioCharacters: row.audio_characters,
    },
    createdAt: row.user_created_at,
  }
}

export class D1AccountRepository implements AccountRepository {
  constructor(private readonly database: D1Database) {}

  async listInvites() {
    const result = await this.database.prepare(`
      SELECT code, enabled, user_id, image_limit, video_seconds_limit,
        text_tokens_limit, audio_characters_limit, created_at, updated_at
      FROM account_invites
      ORDER BY created_at DESC
    `).all<InviteDatabaseRow>()
    return result.results.map(invite)
  }

  async getInvite(code: string) {
    const row = await this.database.prepare(`
      SELECT code, enabled, user_id, image_limit, video_seconds_limit,
        text_tokens_limit, audio_characters_limit, created_at, updated_at
      FROM account_invites
      WHERE code = ?
      LIMIT 1
    `).bind(code).first<InviteDatabaseRow>()
    return row ? invite(row) : undefined
  }

  async createInvite(record: InviteRecord) {
    const result = await this.database.prepare(`
      INSERT INTO account_invites (
        code, enabled, user_id, image_limit, video_seconds_limit,
        text_tokens_limit, audio_characters_limit, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(code) DO NOTHING
    `).bind(
      record.code,
      record.enabled ? 1 : 0,
      record.userId ?? null,
      record.quota.imageCount,
      record.quota.videoSeconds,
      record.quota.textTokens,
      record.quota.audioCharacters,
      record.createdAt,
      record.updatedAt,
    ).run()
    return (result.meta.changes ?? 0) > 0
  }

  async updateInvite(record: InviteRecord) {
    const result = await this.database.prepare(`
      UPDATE account_invites
      SET enabled = ?, image_limit = ?, video_seconds_limit = ?,
        text_tokens_limit = ?, audio_characters_limit = ?, updated_at = ?
      WHERE code = ?
    `).bind(
      record.enabled ? 1 : 0,
      record.quota.imageCount,
      record.quota.videoSeconds,
      record.quota.textTokens,
      record.quota.audioCharacters,
      record.updatedAt,
      record.code,
    ).run()
    return (result.meta.changes ?? 0) > 0
  }

  async disableInvite(code: string, updatedAt: string) {
    const result = await this.database.prepare(
      'UPDATE account_invites SET enabled = 0, updated_at = ? WHERE code = ?',
    ).bind(updatedAt, code).run()
    return (result.meta.changes ?? 0) > 0
  }

  async getAccountByDevice(deviceId: string) {
    const row = await this.database.prepare(`
      SELECT i.code, i.enabled, i.user_id, i.image_limit, i.video_seconds_limit,
        i.text_tokens_limit, i.audio_characters_limit, i.created_at, i.updated_at,
        u.id AS resolved_user_id, u.invite_code, u.created_at AS user_created_at,
        g.image_count, g.video_seconds, g.text_tokens, g.audio_characters
      FROM account_devices d
      JOIN account_users u ON u.id = d.user_id
      JOIN account_invites i ON i.code = u.invite_code
      JOIN account_usage g ON g.user_id = u.id
      WHERE d.device_id = ?
      LIMIT 1
    `).bind(deviceId).first<AccountDatabaseRow>()
    return row ? account(row) : undefined
  }

  async registerDevice(
    code: string,
    deviceId: string,
    proposedUserId: string,
    now: string,
  ): Promise<RegisterAccountResult> {
    const existing = await this.getAccountByDevice(deviceId)
    if (existing) {
      return existing.inviteCode === code
        ? { status: 'registered', account: existing }
        : { status: 'device-conflict' }
    }
    const currentInvite = await this.getInvite(code)
    if (!currentInvite?.enabled) return { status: 'invalid-invite' }
    if (!currentInvite.userId) {
      await this.database.prepare(`
        INSERT INTO account_users (id, invite_code, created_at, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(invite_code) DO NOTHING
      `).bind(proposedUserId, code, now, now).run()
      const claimedUser = await this.database.prepare(`
        SELECT id
        FROM account_users
        WHERE invite_code = ?
        LIMIT 1
      `).bind(code).first<{ id: string }>()
      if (!claimedUser?.id) return { status: 'invalid-invite' }
      await this.database.prepare(`
        UPDATE account_invites
        SET user_id = COALESCE(user_id, ?), updated_at = ?
        WHERE code = ? AND enabled = 1
      `).bind(claimedUser.id, now, code).run()
    }
    const claimedInvite = await this.getInvite(code)
    if (!claimedInvite?.enabled || !claimedInvite.userId) return { status: 'invalid-invite' }
    await this.database.prepare(`
      INSERT INTO account_usage (
        user_id, image_count, video_seconds, text_tokens, audio_characters, updated_at
      ) VALUES (?, 0, 0, 0, 0, ?)
      ON CONFLICT(user_id) DO NOTHING
    `).bind(claimedInvite.userId, now).run()
    const deviceResult = await this.database.prepare(`
      INSERT INTO account_devices (device_id, user_id, created_at, last_seen_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(device_id) DO NOTHING
    `).bind(deviceId, claimedInvite.userId, now, now).run()
    if ((deviceResult.meta.changes ?? 0) === 0) {
      const conflicted = await this.getAccountByDevice(deviceId)
      if (!conflicted || conflicted.userId !== claimedInvite.userId) {
        return { status: 'device-conflict' }
      }
    }
    const registered = await this.getAccountByDevice(deviceId)
    return registered
      ? { status: 'registered', account: registered }
      : { status: 'invalid-invite' }
  }

  async reserveUsage(userId: string, modality: UsageModality, amount: number) {
    const usageColumn = usageColumns[modality]
    const quotaColumn = quotaColumns[modality]
    const result = await this.database.prepare(`
      UPDATE account_usage
      SET ${usageColumn} = ${usageColumn} + ?, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
        AND ${usageColumn} + ? <= (
          SELECT i.${quotaColumn}
          FROM account_users u
          JOIN account_invites i ON i.code = u.invite_code
          WHERE u.id = ?
        )
    `).bind(amount, userId, amount, userId).run()
    return (result.meta.changes ?? 0) > 0
  }

  async releaseUsage(userId: string, modality: UsageModality, amount: number) {
    const usageColumn = usageColumns[modality]
    await this.database.prepare(`
      UPDATE account_usage
      SET ${usageColumn} = MAX(0, ${usageColumn} - ?), updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `).bind(amount, userId).run()
  }
}
