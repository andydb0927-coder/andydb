import { Clapperboard, Compass, Cpu, FolderOpen, PanelsTopLeft, Sparkles, UserRound } from 'lucide-react'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet, useParams } from 'react-router-dom'

export type PlatformShellMode = 'standard' | 'workspace'

export const platformNavigation = [
  { to: '/', label: '项目空间', icon: PanelsTopLeft, end: true },
  { to: '/assets', label: '素材与历史', icon: FolderOpen },
  { to: '/workflows', label: '工作流与模板', icon: Sparkles },
  { to: '/discover', label: '发现与作品', icon: Compass },
  { to: '/models', label: '模型能力', icon: Cpu },
  { to: '/account', label: '本地工作区', icon: UserRound },
] as const

export function PlatformShell({ mode = 'standard' }: { mode?: PlatformShellMode }) {
  const { projectId } = useParams<{ projectId: string }>()
  const [collapsed, setCollapsed] = useState(false)
  const canvasPath = projectId ? `/project/${projectId}` : '/'

  return (
    <div
      className={`platform-shell platform-shell--${mode}${collapsed ? ' platform-shell--collapsed' : ''}`}
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
      </aside>
      <div className="platform-shell__content">
        <Outlet />
      </div>
    </div>
  )
}
