import { BookOpenText, Bot, Clapperboard, ClipboardList, Compass, Cpu, Film, FolderOpen, PackageCheck, PanelsTopLeft, Sparkles, UserRound } from 'lucide-react'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useParams } from 'react-router-dom'

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
  { to: '/account', label: '本地工作区', icon: UserRound, end: false },
] as const

export function PlatformShell({ mode = 'standard' }: { mode?: PlatformShellMode }) {
  const { projectId } = useParams<{ projectId: string }>()
  const [collapsed, setCollapsed] = useState(false)
  const [tasksOpen, setTasksOpen] = useState(false)
  const taskTriggerRef = useRef<HTMLButtonElement>(null)
  const canvasPath = projectId ? `/project/${projectId}` : '/'

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

  return (
    <div
      className={`platform-shell platform-shell--${mode}${collapsed ? ' platform-shell--collapsed' : ''}${tasksOpen ? ' platform-shell--tasks-open' : ''}`}
    >
      <aside className="platform-shell__rail">
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
      </aside>
      <div className="platform-shell__content">
        <Outlet />
      </div>
      {tasksOpen ? <PlatformTaskDrawer onRequestClose={closeTasks} /> : null}
    </div>
  )
}
