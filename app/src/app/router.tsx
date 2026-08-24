import { lazy, Suspense, type ReactNode } from 'react'
import { createBrowserRouter, type RouteObject } from 'react-router-dom'

import { PlatformShell } from '../features/platform/PlatformShell'
import { quickCreateProjectLoader } from '../features/launcher/quick-create-project'
import '../styles/global.css'

// 路由级代码分割：每个页面独立 chunk，控制首屏主包体积
const ProjectLauncherPage = lazy(() =>
  import('../features/launcher/ProjectLauncherPage').then((m) => ({ default: m.ProjectLauncherPage })),
)
const ProjectsPage = lazy(() =>
  import('../features/projects/ProjectsPage').then((m) => ({ default: m.ProjectsPage })),
)
const CanvasPage = lazy(() =>
  import('../features/canvas/CanvasPage').then((m) => ({ default: m.CanvasPage })),
)
const PreviewPage = lazy(() =>
  import('../features/timeline/PreviewPage').then((m) => ({ default: m.PreviewPage })),
)
const AgentsPage = lazy(() =>
  import('../features/agent/AgentsPage').then((m) => ({ default: m.AgentsPage })),
)
const ChallengesPage = lazy(() =>
  import('../features/challenges/ChallengesPage').then((m) => ({ default: m.ChallengesPage })),
)
const ChallengeDetailPage = lazy(() =>
  import('../features/challenges/ChallengeDetailPage').then((m) => ({ default: m.ChallengeDetailPage })),
)
const WorkDetailPage = lazy(() =>
  import('../features/community/WorkDetailPage').then((m) => ({ default: m.WorkDetailPage })),
)
const CreationProcessPage = lazy(() =>
  import('../features/community/CreationProcessPage').then((m) => ({ default: m.CreationProcessPage })),
)

function RouteLoading() {
  return (
    <div className="route-loading" role="status">
      <p>正在加载页面…</p>
    </div>
  )
}

function withSuspense(node: ReactNode) {
  return <Suspense fallback={<RouteLoading />}>{node}</Suspense>
}

export const routes: RouteObject[] = [
  {
    element: <PlatformShell />,
    children: [
      { index: true, element: withSuspense(<ProjectLauncherPage />) },
      { path: '/projects/new', loader: quickCreateProjectLoader },
      { path: '/projects', element: withSuspense(<ProjectsPage />) },
      { path: '/agents', element: withSuspense(<AgentsPage />) },
      { path: '/challenges', element: withSuspense(<ChallengesPage />) },
      { path: '/activity/:challengeId', element: withSuspense(<ChallengeDetailPage />) },
    ],
  },
  {
    element: <PlatformShell mode="workspace" />,
    children: [
      { path: '/project/:projectId', element: withSuspense(<CanvasPage />) },
      { path: '/project/:projectId/preview', element: withSuspense(<PreviewPage />) },
    ],
  },
  { path: '/detail/:workId', element: withSuspense(<WorkDetailPage />) },
  { path: '/detail/:workId/process', element: withSuspense(<CreationProcessPage />) },
]

export function createAppRouter(): ReturnType<typeof createBrowserRouter> {
  return createBrowserRouter(routes, {
    basename: import.meta.env.BASE_URL,
  })
}
