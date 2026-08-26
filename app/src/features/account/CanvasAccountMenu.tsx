import {
  Bell,
  ChevronRight,
  Code2,
  Moon,
  ShieldCheck,
  Stamp,
  Sun,
  UserRound,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import type { GenerationJob } from '../project/model'
import { deriveGenerationNotifications } from './generation-notifications'
import {
  createLocalAccountPreferenceStore,
  type LocalAccountPreferences,
  type LocalAccountPreferenceStore,
} from './local-account-preferences'

type AccountPanel =
  | 'profile'
  | 'watermark'
  | 'cli'
  | 'notifications'

interface CanvasAccountMenuProps {
  creditBalance?: number
  generationJobs?: GenerationJob[]
  preferenceStore?: LocalAccountPreferenceStore
}

interface MenuActionProps {
  icon: ReactNode
  label: string
  onClick(): void
  trailing?: ReactNode
}

const panelTitles: Record<AccountPanel, string> = {
  profile: '个人中心',
  watermark: 'AI 水印设置',
  cli: 'CLI 与 Skill',
  notifications: '通知中心',
}

function MenuAction({ icon, label, onClick, trailing = <ChevronRight aria-hidden="true" /> }: MenuActionProps) {
  return (
    <button type="button" className="canvas-account-menu__action" onClick={onClick}>
      <span className="canvas-account-menu__action-icon" aria-hidden="true">{icon}</span>
      <span>{label}</span>
      <span className="canvas-account-menu__action-trailing" aria-hidden="true">{trailing}</span>
    </button>
  )
}

function formatNotificationTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '时间未知'
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function CanvasAccountMenu({ generationJobs = [], preferenceStore }: CanvasAccountMenuProps) {
  const store = useMemo(
    () => preferenceStore ?? createLocalAccountPreferenceStore(),
    [preferenceStore],
  )
  const [preferences, setPreferences] = useState<LocalAccountPreferences>(() => store.read())
  const [open, setOpen] = useState(false)
  const [activePanel, setActivePanel] = useState<AccountPanel>()
  const [displayNameDraft, setDisplayNameDraft] = useState(preferences.displayName)
  const rootRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const notifications = useMemo(
    () => deriveGenerationNotifications(generationJobs),
    [generationJobs],
  )
  const readNotificationIds = useMemo(
    () => new Set(preferences.readNotificationIds),
    [preferences.readNotificationIds],
  )
  const unreadCount = notifications.filter(({ id }) => !readNotificationIds.has(id)).length

  const persist = (patch: Partial<LocalAccountPreferences>) => {
    setPreferences((current) => store.write({ ...current, ...patch }))
  }

  useEffect(() => {
    document.documentElement.dataset.canvasTheme = preferences.themeMode
  }, [preferences.themeMode])

  useEffect(() => {
    if (!open && !activePanel) return
    const handlePointerDown = (event: PointerEvent) => {
      if (
        !open ||
        rootRef.current?.contains(event.target as Node) ||
        popoverRef.current?.contains(event.target as Node)
      ) return
      setOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setOpen(false)
      setActivePanel(undefined)
      window.requestAnimationFrame(() => triggerRef.current?.focus())
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [activePanel, open])

  const showPanel = (panel: AccountPanel) => {
    setOpen(false)
    setActivePanel(panel)
    if (panel === 'profile') setDisplayNameDraft(preferences.displayName)
  }

  const closePanel = () => {
    setActivePanel(undefined)
    window.requestAnimationFrame(() => triggerRef.current?.focus())
  }

  const notificationLabel = unreadCount > 0
    ? `通知 ${unreadCount} 条未读`
    : '通知'

  return (
    <div className="canvas-account-menu" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="canvas-top-bar__avatar"
        aria-label={`本地设置，${preferences.displayName}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {preferences.displayName.slice(0, 1)}
        {unreadCount > 0 ? (
          <span className="canvas-account-menu__avatar-dot" aria-hidden="true" />
        ) : null}
      </button>

      {open && typeof document !== 'undefined' ? createPortal((
        <section ref={popoverRef} className="canvas-account-menu__popover" role="dialog" aria-label="本地设置">
          <div className="canvas-account-menu__profile">
            <span className="canvas-account-menu__profile-avatar" aria-hidden="true">
              {preferences.displayName.slice(0, 1)}
            </span>
            <div>
              <strong>{preferences.displayName}</strong>
              <small>本地创作偏好 · 仅保存在当前浏览器</small>
            </div>
          </div>

          <nav className="canvas-account-menu__actions" aria-label="本地设置功能">
            <MenuAction icon={<UserRound />} label="个人中心" onClick={() => showPanel('profile')} />
            <button
              type="button"
              className="canvas-account-menu__action"
              aria-label={preferences.themeMode === 'dark' ? '切换为浅色模式' : '切换为深色模式'}
              onClick={() => persist({ themeMode: preferences.themeMode === 'dark' ? 'light' : 'dark' })}
            >
              <span className="canvas-account-menu__action-icon" aria-hidden="true">
                {preferences.themeMode === 'dark' ? <Moon /> : <Sun />}
              </span>
              <span>模式切换</span>
              <span className="canvas-account-menu__theme" aria-hidden="true">
                <Sun /><Moon /><i data-active={preferences.themeMode} />
              </span>
            </button>
            <MenuAction icon={<Stamp />} label="AI 水印设置" onClick={() => showPanel('watermark')} />
            <MenuAction icon={<Code2 />} label="CLI & Skill" onClick={() => showPanel('cli')} />
            <MenuAction
              icon={<Bell />}
              label={notificationLabel}
              onClick={() => showPanel('notifications')}
              trailing={unreadCount > 0 ? (
                <b className="canvas-account-menu__notification-badge">{unreadCount}</b>
              ) : <ChevronRight />}
            />
          </nav>

          <p className="canvas-account-menu__honesty">会员与积分为本地统计；支付和云端团队服务尚未接入。</p>
        </section>
      ), document.body) : null}

      {activePanel && typeof document !== 'undefined' ? createPortal((
        <div className="canvas-account-detail__backdrop" onPointerDown={(event) => {
          if (event.target === event.currentTarget) closePanel()
        }}>
          <section className="canvas-account-detail" role="dialog" aria-modal="true" aria-label={panelTitles[activePanel]}>
            <header>
              <div>
                <span>本地设置</span>
                <h2>{panelTitles[activePanel]}</h2>
              </div>
              <button type="button" aria-label={`关闭${panelTitles[activePanel]}`} onClick={closePanel}><X aria-hidden="true" /></button>
            </header>
            <div className="canvas-account-detail__body">
              {activePanel === 'profile' ? (
                <>
                  <label>显示名称<input aria-label="显示名称" maxLength={24} value={displayNameDraft} onChange={(event) => setDisplayNameDraft(event.target.value)} /></label>
                  <p>名称仅用于当前设备上的画布演示。</p>
                  <button type="button" className="canvas-account-detail__primary" onClick={() => {
                    persist({ displayName: displayNameDraft })
                    closePanel()
                  }}>保存个人资料</button>
                </>
              ) : null}
              {activePanel === 'watermark' ? (
                <>
                  <label className="canvas-account-detail__switch"><span><strong>导出时添加 AI 水印</strong><small>本地记录偏好，真实导出能力接入后沿用。</small></span><input type="checkbox" role="switch" aria-label="导出时添加 AI 水印" checked={preferences.aiWatermark} onChange={(event) => persist({ aiWatermark: event.target.checked })} /></label>
                  <label className="canvas-account-detail__switch"><span><strong>应用内通知</strong><small>控制本地任务完成提醒。</small></span><input type="checkbox" role="switch" aria-label="应用内通知" checked={preferences.inAppNotifications} onChange={(event) => persist({ inAppNotifications: event.target.checked })} /></label>
                </>
              ) : null}
              {activePanel === 'cli' ? (
                <>
                  <div className="canvas-account-detail__hero"><Code2 aria-hidden="true" /><div><strong>CLI 与 Skill</strong><span>本地开发与创作能力入口</span></div></div>
                  <article><h3>本地 CLI</h3><code>npm run dev</code><p>启动当前演示工作台，不连接 Liblib 账户。</p></article>
                  <article><h3>Skills</h3><p>前往平台 Skills 页查看已配置的本地技能与模型能力。</p></article>
                </>
              ) : null}
              {activePanel === 'notifications' ? (
                <>
                  <div className="canvas-account-detail__section-heading"><strong>{unreadCount} 条未读</strong><button type="button" disabled={unreadCount === 0} onClick={() => persist({ readNotificationIds: notifications.map(({ id }) => id) })}>全部标为已读</button></div>
                  {notifications.length ? (
                    <div className="canvas-account-notifications" aria-label="生成任务通知列表">
                      {notifications.map((notification) => {
                        const isRead = readNotificationIds.has(notification.id)
                        return (
                          <article key={notification.id} data-status={notification.status} data-read={isRead || undefined}>
                            <div>
                              <h3>{notification.title}</h3>
                              <time dateTime={notification.timestamp}>{formatNotificationTime(notification.timestamp)}</time>
                            </div>
                            <p>{notification.detail}</p>
                            {isRead ? <span>已读</span> : (
                              <button type="button" onClick={() => persist({ readNotificationIds: [...preferences.readNotificationIds, notification.id] })}>标为已读</button>
                            )}
                          </article>
                        )
                      })}
                    </div>
                  ) : <div className="canvas-account-notifications__empty"><Bell aria-hidden="true" /><strong>暂无生成任务通知</strong><p>任务提交、运行、完成或失败后会显示在这里。</p></div>}
                </>
              ) : null}
            </div>
            <footer><span><ShieldCheck aria-hidden="true" />仅本机保存</span><button type="button" onClick={closePanel}>完成</button></footer>
          </section>
        </div>
      ), document.body) : null}
    </div>
  )
}
