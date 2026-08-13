import {
  BookOpenText,
  Bot,
  CircleHelp,
  Clapperboard,
  ClipboardList,
  Compass,
  Cpu,
  Film,
  FolderKanban,
  FolderOpen,
  Home,
  PackageCheck,
  PanelsTopLeft,
  Plus,
  Sparkles,
  Trophy,
  UserRound,
} from 'lucide-react'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useParams } from 'react-router-dom'

import { PlatformTaskDrawer } from './PlatformTaskDrawer'

export type PlatformShellMode = 'standard' | 'workspace'

export const platformNavigation = [
  { to: '/projects', label: '项目空间', icon: PanelsTopLeft, end: true },
  { to: '/assets', label: '素材与历史', icon: FolderOpen, end: false },
  { to: '/story', label: '故事设定', icon: BookOpenText, end: false },
  { to: '/workflows', label: '工作流与模板', icon: Sparkles, end: false },
  { to: '/editor', label: '剪辑项目', icon: Film, end: false },
  { to: '/delivery', label: '交付与发布', icon: PackageCheck, end: false },
  { to: '/discover', label: '发现与作品', icon: Compass, end: false },
  { to: '/models', label: '模型能力', icon: Cpu, end: false },
  { to: '/agents', label: 'Agent 技能', icon: Bot, end: false },
  { to: '/challenges', label: '创作者挑战赛', icon: Trophy, end: false },
  { to: '/account', label: '本地工作区', icon: UserRound, end: false },
] as const

const homeNavigation = [
  { to: '/', label: '首页', icon: Home, end: true },
  { to: '/projects', label: '项目', icon: FolderKanban, end: true },
  { to: '/agents', label: 'Skills', icon: Sparkles, end: false },
  {
    to: '/challenges',
    label: '创作者挑战赛',
    icon: Trophy,
    end: false,
  },
] as const

export function PlatformShell({ mode = 'standard' }: { mode?: PlatformShellMode }) {
  const { projectId } = useParams<{ projectId: string }>()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)
  const [tasksOpen, setTasksOpen] = useState(false)
  const taskTriggerRef = useRef<HTMLButtonElement>(null)
  const canvasPath = projectId ? `/project/${projectId}` : '/'
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
        {isHomepage ? (
          <>
            <Link
              className="platform-shell__new-project focus-visible"
              to="/projects/new"
            >
              <Plus aria-hidden="true" />
              <span>新建项目</span>
            </Link>
            <nav
              aria-label="首页导航"
              className="platform-shell__navigation"
              data-collapsed={collapsed}
            >
              {homeNavigation.map(({ to, label, icon: Icon, end }) => (
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
          </>
        ) : (
          <nav
            aria-label="平台导航"
            className="platform-shell__navigation"
            data-collapsed={collapsed}
          >
            <NavLink
              className={({ isActive }) =>
                `platform-shell__link${isActive ? ' platform-shell__link--active' : ''}`
              }
              end
              to={canvasPath}
            >
              <Clapperboard aria-hidden="true" />
              <span>创作画布</span>
            </NavLink>
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
        )}
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
        <Outlet />
      </div>
      {tasksOpen && !isHomepage ? <PlatformTaskDrawer onRequestClose={closeTasks} /> : null}
    </div>
  )
}
