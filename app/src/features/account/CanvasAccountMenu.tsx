import {
  Bell,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Code2,
  Copy,
  ExternalLink,
  FileText,
  LogOut,
  Moon,
  ReceiptText,
  ShieldCheck,
  Stamp,
  Sun,
  UserPlus,
  UserRound,
  Users,
  WalletCards,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import {
  createLocalAccountPreferenceStore,
  type LocalAccountPreferences,
  type LocalAccountPreferenceStore,
} from './local-account-preferences'

type AccountPanel =
  | 'team'
  | 'invite'
  | 'profile'
  | 'subscription'
  | 'watermark'
  | 'cli'
  | 'notifications'
  | 'logout'
  | 'quota-order'
  | 'recharge'

interface CanvasAccountMenuProps {
  creditBalance: number
  preferenceStore?: LocalAccountPreferenceStore
}

interface MenuActionProps {
  icon: ReactNode
  label: string
  onClick(): void
  trailing?: ReactNode
}

const panelTitles: Record<AccountPanel, string> = {
  team: '团队设置',
  invite: '邀请成员',
  profile: '个人中心',
  subscription: '订阅与发票',
  watermark: 'AI 水印设置',
  cli: 'CLI 与 Skill',
  notifications: '通知中心',
  logout: '退出演示账户',
  'quota-order': '设置消耗顺序',
  recharge: '额度充值',
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

export function CanvasAccountMenu({ creditBalance, preferenceStore }: CanvasAccountMenuProps) {
  const store = useMemo(
    () => preferenceStore ?? createLocalAccountPreferenceStore(),
    [preferenceStore],
  )
  const [preferences, setPreferences] = useState<LocalAccountPreferences>(() => store.read())
  const [open, setOpen] = useState(false)
  const [activePanel, setActivePanel] = useState<AccountPanel>()
  const [displayNameDraft, setDisplayNameDraft] = useState(preferences.displayName)
  const [inviteAddress, setInviteAddress] = useState('')
  const [inviteFeedback, setInviteFeedback] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

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
    if (panel === 'invite') {
      setInviteAddress('')
      setInviteFeedback('')
    }
  }

  const closePanel = () => {
    setActivePanel(undefined)
    window.requestAnimationFrame(() => triggerRef.current?.focus())
  }

  const notificationLabel = preferences.notificationUnreadCount > 0
    ? `通知 ${preferences.notificationUnreadCount} 条未读`
    : '通知'

  return (
    <div className="canvas-account-menu" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="canvas-top-bar__avatar"
        aria-label={`用户头像，${preferences.displayName}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {preferences.displayName.slice(0, 1)}
        {preferences.notificationUnreadCount > 0 ? (
          <span className="canvas-account-menu__avatar-dot" aria-hidden="true" />
        ) : null}
      </button>

      {open && typeof document !== 'undefined' ? createPortal((
        <section ref={popoverRef} className="canvas-account-menu__popover" role="dialog" aria-label="账户与团队">
          <div className="canvas-account-menu__profile">
            <span className="canvas-account-menu__profile-avatar" aria-hidden="true">
              {preferences.displayName.slice(0, 1)}
            </span>
            <div>
              <strong>{preferences.displayName}</strong>
              <span className="canvas-account-menu__badges">
                <em>团队</em><em>管理员</em>
              </span>
              <small>本地创作团队 · 演示 ID</small>
            </div>
            <button
              type="button"
              className="canvas-account-menu__scope"
              onClick={() => persist({ accountScope: preferences.accountScope === 'team' ? 'personal' : 'team' })}
            >
              {preferences.accountScope === 'team' ? '切换个人账户' : '切换团队账户'}
            </button>
          </div>

          <section className="canvas-account-menu__membership" aria-label="团队会员权益">
            <div>
              <strong>标准版团队 VIP</strong>
              <span>2026-09-26 到期</span>
              <button type="button" onClick={() => showPanel('team')}>查看团队</button>
            </div>
            <div className="canvas-account-menu__progress" aria-label="会员有效期进度">
              <span />
            </div>
            <p>活动权益：本地演示模型限时折扣 · 有效期 18 天</p>
          </section>

          <section className="canvas-account-menu__quota" aria-label="本月额度">
            <div>
              <strong>我的本月额度：4216/10000</strong>
              <span>
                <button type="button" onClick={() => showPanel('recharge')}>充值</button>
                <button type="button" onClick={() => showPanel('quota-order')}>设置消耗顺序</button>
              </span>
            </div>
            <p>团队积分余额 {creditBalance} 点</p>
          </section>

          <nav className="canvas-account-menu__actions" aria-label="账户功能">
            <MenuAction icon={<Users />} label="团队设置" onClick={() => showPanel('team')} />
            <MenuAction icon={<UserPlus />} label="邀请成员" onClick={() => showPanel('invite')} />
            <MenuAction icon={<UserRound />} label="个人中心" onClick={() => showPanel('profile')} />
            <MenuAction icon={<ReceiptText />} label="订阅与发票" onClick={() => showPanel('subscription')} />
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
              trailing={preferences.notificationUnreadCount > 0 ? (
                <b className="canvas-account-menu__notification-badge">{preferences.notificationUnreadCount}</b>
              ) : <ChevronRight />}
            />
            <a
              className="canvas-account-menu__action"
              href="https://www.liblib.tv/"
              target="_blank"
              rel="noreferrer"
            >
              <span className="canvas-account-menu__action-icon" aria-hidden="true"><ExternalLink /></span>
              <span>前往 Liblib</span>
              <span className="canvas-account-menu__action-trailing" aria-hidden="true"><ExternalLink /></span>
            </a>
            <MenuAction icon={<LogOut />} label="退出演示账户" onClick={() => showPanel('logout')} />
          </nav>

          <p className="canvas-account-menu__honesty">账户、会员、额度与发票均为本地演示数据。</p>
        </section>
      ), document.body) : null}

      {activePanel && typeof document !== 'undefined' ? createPortal((
        <div className="canvas-account-detail__backdrop" onPointerDown={(event) => {
          if (event.target === event.currentTarget) closePanel()
        }}>
          <section className="canvas-account-detail" role="dialog" aria-modal="true" aria-label={panelTitles[activePanel]}>
            <header>
              <div>
                <span>账户与团队</span>
                <h2>{panelTitles[activePanel]}</h2>
              </div>
              <button type="button" aria-label={`关闭${panelTitles[activePanel]}`} onClick={closePanel}><X aria-hidden="true" /></button>
            </header>
            <div className="canvas-account-detail__body">
              {activePanel === 'team' ? (
                <>
                  <div className="canvas-account-detail__hero"><Users aria-hidden="true" /><div><strong>本地创作团队</strong><span>1 名成员 · 当前设备管理员</span></div></div>
                  <dl><div><dt>团队版本</dt><dd>标准版团队 VIP</dd></div><div><dt>团队 ID</dt><dd>LOCAL-DEMO</dd></div><div><dt>数据范围</dt><dd>仅保存在当前浏览器</dd></div></dl>
                </>
              ) : null}
              {activePanel === 'invite' ? (
                <>
                  <p>生成本地邀请说明，不会发送邮件或创建真实团队成员。</p>
                  <label>成员邮箱<input type="email" value={inviteAddress} placeholder="name@example.com" onChange={(event) => setInviteAddress(event.target.value)} /></label>
                  <button type="button" className="canvas-account-detail__primary" disabled={!inviteAddress.trim()} onClick={() => setInviteFeedback('本地邀请说明已准备，可复制后自行发送。')}><Copy aria-hidden="true" />生成邀请说明</button>
                  {inviteFeedback ? <p role="status" className="canvas-account-detail__success"><CheckCircle2 aria-hidden="true" />{inviteFeedback}</p> : null}
                </>
              ) : null}
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
              {activePanel === 'subscription' ? (
                <>
                  <div className="canvas-account-detail__hero"><WalletCards aria-hidden="true" /><div><strong>标准版团队 VIP</strong><span>演示有效期至 2026-09-26</span></div></div>
                  <p>当前项目未连接真实支付、订单或发票服务，因此不会展示或创建真实账单。</p>
                  <button type="button" className="canvas-account-detail__secondary" disabled><FileText aria-hidden="true" />暂无本地发票</button>
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
                  <div className="canvas-account-detail__section-heading"><strong>{preferences.notificationUnreadCount} 条未读</strong><button type="button" disabled={preferences.notificationUnreadCount === 0} onClick={() => persist({ notificationUnreadCount: 0 })}>全部标为已读</button></div>
                  <article><h3>画布功能已更新</h3><p>账户与团队功能现已支持本地偏好保存。</p></article>
                  <article><h3>演示额度提醒</h3><p>额度与会员信息均为本地演示，不会产生费用。</p></article>
                </>
              ) : null}
              {activePanel === 'logout' ? (
                <>
                  <div className="canvas-account-detail__hero"><LogOut aria-hidden="true" /><div><strong>当前没有真实登录会话</strong><span>这是本地演示账户</span></div></div>
                  <p>退出不会影响项目数据。为避免误导，这里不会伪造服务器登出。</p>
                </>
              ) : null}
              {activePanel === 'quota-order' ? (
                <fieldset>
                  <legend>选择本地任务的额度提示顺序</legend>
                  {([
                    ['balanced', '均衡消耗'],
                    ['image-first', '图片额度优先'],
                    ['video-first', '视频额度优先'],
                  ] as const).map(([value, label]) => (
                    <label key={value}><input type="radio" name="consume-order" value={value} checked={preferences.consumeOrder === value} onChange={() => persist({ consumeOrder: value })} />{label}</label>
                  ))}
                </fieldset>
              ) : null}
              {activePanel === 'recharge' ? (
                <>
                  <div className="canvas-account-detail__hero"><CircleDollarSign aria-hidden="true" /><div><strong>本地演示额度</strong><span>4216 / 10000</span></div></div>
                  <p>尚未接入真实支付服务，此处不会发起充值或扣款。</p>
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
