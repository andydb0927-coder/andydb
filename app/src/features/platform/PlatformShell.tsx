import {
  CircleHelp,
  Clapperboard,
  ClipboardList,
  FolderKanban,
  Home,
  Images,
  Plus,
  Sparkles,
  Trophy,
} from 'lucide-react'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'

import { PlatformTaskDrawer } from './PlatformTaskDrawer'

export type PlatformShellMode = 'standard' | 'workspace'

export const platformNavigation = [
  { to: '/', label: '首页', icon: Home, end: true },
  { to: '/projects', label: '项目', icon: FolderKanban, end: true },
  { to: '/works', label: '作品', icon: Images, end: true },
  { to: '/agents', label: 'Skills', icon: Sparkles, end: false },
  {
    to: '/challenges',
    label: '创作者挑战赛',
    icon: Trophy,
    end: false,
  },
] as const

export function PlatformShell({ mode = 'standard' }: { mode?: PlatformShellMode }) {
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)
  const [tasksOpen, setTasksOpen] = useState(false)
  const taskTriggerRef = useRef<HTMLButtonElement>(null)
  const isHomepage = mode === 'standard' && location.pathname === '/'

  const closeTasks = useCallback(() => {
    setTasksOpen(false)
    taskTriggerRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!tasksOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeTasks()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [closeTasks, tasksOpen])

  useEffect(() => {
    if (isHomepage && tasksOpen) setTasksOpen(false)
  }, [isHomepage, tasksOpen])

  return (
    <div
      className={`platform-shell platform-shell--${mode}${isHomepage ? ' platform-shell--home' : ''}${collapsed ? ' platform-shell--collapsed' : ''}${tasksOpen && !isHomepage ? ' platform-shell--tasks-open' : ''}`}
    >
      <aside className="platform-shell__rail" aria-label={isHomepage ? '侧边导航' : undefined}>
        <button
          aria-label={collapsed ? '展开平台导航' : '收起平台导航'}
          className="platform-shell__collapse focus-visible"
          type="button"
          onClick={() => setCollapsed((value) => !value)}
        >
          {collapsed ? <PanelLeftOpen aria-hidden="true" /> : <PanelLeftClose aria-hidden="true" />}
        </button>
        <div className="platform-shell__brand">
          <Clapperboard aria-hidden="true" />
          <span>无线画布</span>
        </div>
        <Link className="platform-shell__new-project focus-visible" to="/projects/new">
          <Plus aria-hidden="true" />
          <span>新建项目</span>
        </Link>
        <nav
          aria-label={isHomepage ? '首页导航' : '平台导航'}
          className="platform-shell__navigation"
          data-collapsed={collapsed}
        >
          {platformNavigation.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              className={({ isActive }) =>
                `platform-shell__link${isActive ? ' platform-shell__link--active' : ''}`
              }
              end={end}
              to={to}
            >
              <Icon aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <Link className="platform-shell__help focus-visible" to="/#help">
          <CircleHelp aria-hidden="true" />
          <span>帮助</span>
        </Link>
        {isHomepage ? null : (
          <button
            ref={taskTriggerRef}
            aria-controls="platform-task-drawer"
            aria-expanded={tasksOpen}
            aria-label={tasksOpen ? '关闭阶段任务' : '打开阶段任务'}
            className="platform-shell__task-trigger focus-visible"
            type="button"
            onClick={() => (tasksOpen ? closeTasks() : setTasksOpen(true))}
          >
            <ClipboardList aria-hidden="true" />
            <span>阶段任务</span>
          </button>
        )}
      </aside>
      <div className="platform-shell__content">
        {mode === 'standard' ? (
          <header className="platform-shell__topbar">
            <Link className="launcher-brand focus-visible" to="/">无线画布</Link>
            <nav className="launcher-header__actions" aria-label="本地工作区快捷入口">
              <span className="launcher-header__link">本地模式</span>
              <Link className="launcher-header__link focus-visible" to="/projects">项目</Link>
              <Link className="launcher-header__membership focus-visible" to="/projects/new">
                新建画布
              </Link>
            </nav>
          </header>
        ) : null}
        <Outlet />
      </div>
      {tasksOpen && !isHomepage ? <PlatformTaskDrawer onRequestClose={closeTasks} /> : null}
    </div>
  )
}
