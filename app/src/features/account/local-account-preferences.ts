export const LOCAL_ACCOUNT_PREFERENCES_KEY = 'wireless-canvas:local-account-preferences:v1'

export interface LocalAccountPreferences {
  version: 1
  displayName: string
  aiWatermark: boolean
  inAppNotifications: boolean
  themeMode: 'dark' | 'light'
  notificationUnreadCount: number
  consumeOrder: 'balanced' | 'image-first' | 'video-first'
  accountScope: 'team' | 'personal'
  updatedAt?: string
}

export interface LocalAccountPreferenceInput {
  displayName: string
  aiWatermark: boolean
  inAppNotifications: boolean
  themeMode?: 'dark' | 'light'
  notificationUnreadCount?: number
  consumeOrder?: 'balanced' | 'image-first' | 'video-first'
  accountScope?: 'team' | 'personal'
  [key: string]: unknown
}

export interface LocalAccountPreferenceStore {
  read(): LocalAccountPreferences
  write(value: LocalAccountPreferenceInput): LocalAccountPreferences
}

const defaultPreferences: LocalAccountPreferences = {
  version: 1,
  displayName: '本机创作者',
  aiWatermark: true,
  inAppNotifications: true,
  themeMode: 'dark',
  notificationUnreadCount: 2,
  consumeOrder: 'balanced',
  accountScope: 'team',
}

function normalizeDisplayName(value: unknown): string {
  if (typeof value !== 'string') return defaultPreferences.displayName
  return value.trim() || defaultPreferences.displayName
}

function normalizePreferences(value: unknown): LocalAccountPreferences {
  if (!value || typeof value !== 'object') return { ...defaultPreferences }
  const candidate = value as {
    version?: unknown
    displayName?: unknown
    aiWatermark?: unknown
    inAppNotifications?: unknown
    themeMode?: unknown
    notificationUnreadCount?: unknown
    consumeOrder?: unknown
    accountScope?: unknown
    updatedAt?: unknown
  }
  if (
    candidate.version !== 1 ||
    typeof candidate.displayName !== 'string' ||
    typeof candidate.aiWatermark !== 'boolean' ||
    typeof candidate.inAppNotifications !== 'boolean'
  ) {
    return { ...defaultPreferences }
  }

  return {
    version: 1,
    displayName: normalizeDisplayName(candidate.displayName),
    aiWatermark: candidate.aiWatermark,
    inAppNotifications: candidate.inAppNotifications,
    themeMode: candidate.themeMode === 'light' ? 'light' : 'dark',
    notificationUnreadCount:
      typeof candidate.notificationUnreadCount === 'number' &&
      Number.isFinite(candidate.notificationUnreadCount)
        ? Math.max(0, Math.floor(candidate.notificationUnreadCount))
        : defaultPreferences.notificationUnreadCount,
    consumeOrder:
      candidate.consumeOrder === 'image-first' || candidate.consumeOrder === 'video-first'
        ? candidate.consumeOrder
        : 'balanced',
    accountScope: candidate.accountScope === 'personal' ? 'personal' : 'team',
    ...(typeof candidate.updatedAt === 'string'
      ? { updatedAt: candidate.updatedAt }
      : {}),
  }
}

class BrowserLocalAccountPreferenceStore implements LocalAccountPreferenceStore {
  private readonly storage: Storage | undefined
  private readonly now: () => Date

  constructor(storage: Storage | undefined, now: () => Date) {
    this.storage = storage
    this.now = now
  }

  read(): LocalAccountPreferences {
    try {
      const serialized = this.storage?.getItem(LOCAL_ACCOUNT_PREFERENCES_KEY)
      return serialized
        ? normalizePreferences(JSON.parse(serialized))
        : { ...defaultPreferences }
    } catch {
      return { ...defaultPreferences }
    }
  }

  write(value: LocalAccountPreferenceInput): LocalAccountPreferences {
    const preferences: LocalAccountPreferences = {
      version: 1,
      displayName: normalizeDisplayName(value.displayName),
      aiWatermark: value.aiWatermark,
      inAppNotifications: value.inAppNotifications,
      themeMode: value.themeMode === 'light' ? 'light' : 'dark',
      notificationUnreadCount:
        typeof value.notificationUnreadCount === 'number' &&
        Number.isFinite(value.notificationUnreadCount)
          ? Math.max(0, Math.floor(value.notificationUnreadCount))
          : defaultPreferences.notificationUnreadCount,
      consumeOrder:
        value.consumeOrder === 'image-first' || value.consumeOrder === 'video-first'
          ? value.consumeOrder
          : 'balanced',
      accountScope: value.accountScope === 'personal' ? 'personal' : 'team',
      updatedAt: this.now().toISOString(),
    }
    try {
      this.storage?.setItem(
        LOCAL_ACCOUNT_PREFERENCES_KEY,
        JSON.stringify(preferences),
      )
    } catch {
      // Device preferences are optional and must never block the workspace.
    }
    return preferences
  }
}

export function createLocalAccountPreferenceStore(
  storage: Storage | undefined =
    typeof localStorage === 'undefined' ? undefined : localStorage,
  now: () => Date = () => new Date(),
): LocalAccountPreferenceStore {
  return new BrowserLocalAccountPreferenceStore(storage, now)
}
