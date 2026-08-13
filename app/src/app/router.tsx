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
const AssetsHistoryPage = lazy(() =>
  import('../features/platform/AssetsHistoryPage').then((m) => ({ default: m.AssetsHistoryPage })),
)
const StoryBiblePage = lazy(() =>
  import('../features/platform/StoryBiblePage').then((m) => ({ default: m.StoryBiblePage })),
)
const EditorProjectsPage = lazy(() =>
  import('../features/platform/EditorProjectsPage').then((m) => ({ default: m.EditorProjectsPage })),
)
const DeliveryCenterPage = lazy(() =>
  import('../features/platform/DeliveryCenterPage').then((m) => ({ default: m.DeliveryCenterPage })),
)
const WorkflowsPage = lazy(() =>
  import('../features/platform/WorkflowsPage').then((m) => ({ default: m.WorkflowsPage })),
)
const DiscoverPage = lazy(() =>
  import('../features/platform/DiscoverPage').then((m) => ({ default: m.DiscoverPage })),
)
const ModelsPage = lazy(() =>
  import('../features/platform/ModelsPage').then((m) => ({ default: m.ModelsPage })),
)
const AccountPage = lazy(() =>
  import('../features/platform/AccountPage').then((m) => ({ default: m.AccountPage })),
)
const MyWorksPage = lazy(() =>
  import('../features/community/MyWorksPage').then((m) => ({ default: m.MyWorksPage })),
)
const WorkDetailPage = lazy(() =>
  import('../features/community/WorkDetailPage').then((m) => ({ default: m.WorkDetailPage })),
)
const CreatorProfilePage = lazy(() =>
  import('../features/community/CreatorProfilePage').then((m) => ({ default: m.CreatorProfilePage })),
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
      { path: '/assets', element: withSuspense(<AssetsHistoryPage />) },
      { path: '/story', element: withSuspense(<StoryBiblePage />) },
      { path: '/editor', element: withSuspense(<EditorProjectsPage />) },
      { path: '/delivery', element: withSuspense(<DeliveryCenterPage />) },
      { path: '/workflows', element: withSuspense(<WorkflowsPage />) },
      { path: '/discover', element: withSuspense(<DiscoverPage />) },
      { path: '/discover/mine', element: withSuspense(<MyWorksPage />) },
      { path: '/discover/creator/:author', element: withSuspense(<CreatorProfilePage />) },
      { path: '/discover/:workId', element: withSuspense(<WorkDetailPage />) },
      { path: '/models', element: withSuspense(<ModelsPage />) },
      { path: '/agents', element: withSuspense(<AgentsPage />) },
      { path: '/challenges', element: withSuspense(<ChallengesPage />) },
      { path: '/challenges/:challengeId', element: withSuspense(<ChallengeDetailPage />) },
      { path: '/account', element: withSuspense(<AccountPage />) },
    ],
  },
  {
    element: <PlatformShell mode="workspace" />,
    children: [
      { path: '/project/:projectId', element: withSuspense(<CanvasPage />) },
      { path: '/project/:projectId/preview', element: withSuspense(<PreviewPage />) },
    ],
  },
]

export function createAppRouter(): ReturnType<typeof createBrowserRouter> {
  return createBrowserRouter(routes)
}
