import { lazy } from 'react'
import { createBrowserRouter, type RouteObject } from 'react-router-dom'

import { PlatformShell } from '../features/platform/PlatformShell'
import { quickCreateProjectLoader } from '../features/launcher/quick-create-project'
import { RouteNotFoundPage } from './RouteErrorPage'
import { RouteLoading, withSuspense, withRouteRecovery } from './route-boundaries'
import '../styles/global.css'
import '../styles/deployed-ui-polish.css'
import '../styles/liblib-web-design.css'

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
const PublishedWorksPage = lazy(() =>
  import('../features/community/PublishedWorksPage').then((m) => ({ default: m.PublishedWorksPage })),
)
const PublishedWorkViewPage = lazy(() =>
  import('../features/community/PublishedWorkViewPage').then((m) => ({ default: m.PublishedWorkViewPage })),
)
const TutorialCenterPage = lazy(() =>
  import('../features/tutorials/TutorialCenterPage').then((m) => ({ default: m.TutorialCenterPage })),
)
const TutorialDetailPage = lazy(() =>
  import('../features/tutorials/TutorialDetailPage').then((m) => ({ default: m.TutorialDetailPage })),
)
const CreationProcessPage = lazy(() =>
  import('../features/community/CreationProcessPage').then((m) => ({ default: m.CreationProcessPage })),
)
const MembershipPage = lazy(() =>
  import('../features/membership/MembershipPage').then((m) => ({ default: m.MembershipPage })),
)
const HelpCenterPage = lazy(() =>
  import('../features/help/HelpCenterPage').then((m) => ({ default: m.HelpCenterPage })),
)
const SubjectDetailsPage = lazy(() => import('../features/subjects/SubjectDetailsPage').then(m => ({ default: m.SubjectDetailsPage })))
const CloudLoginPage = lazy(() => import('../features/account/CloudLoginPage').then(m => ({ default: m.CloudLoginPage })))

export const routes: RouteObject[] = withRouteRecovery([
  {
    element: <PlatformShell />,
    hydrateFallbackElement: <RouteLoading />,
    children: [
      { index: true, element: withSuspense(<ProjectLauncherPage />) },
      { path: '/projects/new', loader: quickCreateProjectLoader, element: <RouteLoading /> },
      { path: '/projects', element: withSuspense(<ProjectsPage />) },
      { path: '/works', element: withSuspense(<PublishedWorksPage />) },
      { path: '/tutorials', element: withSuspense(<TutorialCenterPage />) },
      { path: '/tutorials/:tutorialId', element: withSuspense(<TutorialDetailPage />) },
      { path: '/agents', element: withSuspense(<AgentsPage />) },
      { path: '/challenges', element: withSuspense(<ChallengesPage />) },
      { path: '/activity/:challengeId', element: withSuspense(<ChallengeDetailPage />) },
      { path: '/membership', element: withSuspense(<MembershipPage />) },
      { path: '/help', element: withSuspense(<HelpCenterPage />) },
      { path: '/login', element: withSuspense(<CloudLoginPage />) },
      { path: '/subjects/:subjectId', element: withSuspense(<SubjectDetailsPage />) },
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
  { path: '/view/:workId', element: withSuspense(<PublishedWorkViewPage />) },
  { path: '*', element: <RouteNotFoundPage /> },
])

export function createAppRouter(): ReturnType<typeof createBrowserRouter> {
  return createBrowserRouter(routes, {
    basename: import.meta.env.BASE_URL,
  })
}
