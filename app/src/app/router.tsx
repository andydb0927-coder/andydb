import { createBrowserRouter, type RouteObject } from 'react-router-dom'

import { ProjectLauncherPage } from '../features/launcher/ProjectLauncherPage'
import { CanvasPage } from '../features/canvas/CanvasPage'
import { PreviewPage } from '../features/timeline/PreviewPage'
import { PlatformShell } from '../features/platform/PlatformShell'
import { AssetsHistoryPage } from '../features/platform/AssetsHistoryPage'
import { WorkflowsPage } from '../features/platform/WorkflowsPage'
import { DiscoverPage } from '../features/platform/DiscoverPage'
import { ModelsPage } from '../features/platform/ModelsPage'
import { AccountPage } from '../features/platform/AccountPage'
import { MyWorksPage } from '../features/community/MyWorksPage'
import { WorkDetailPage } from '../features/community/WorkDetailPage'

export const routes: RouteObject[] = [
  {
    element: <PlatformShell />,
    children: [
      { index: true, element: <ProjectLauncherPage /> },
      { path: '/assets', element: <AssetsHistoryPage /> },
      { path: '/workflows', element: <WorkflowsPage /> },
      { path: '/discover', element: <DiscoverPage /> },
      { path: '/discover/mine', element: <MyWorksPage /> },
      { path: '/discover/:workId', element: <WorkDetailPage /> },
      { path: '/models', element: <ModelsPage /> },
      { path: '/account', element: <AccountPage /> },
    ],
  },
  {
    element: <PlatformShell mode="workspace" />,
    children: [
      { path: '/project/:projectId', element: <CanvasPage /> },
      { path: '/project/:projectId/preview', element: <PreviewPage /> },
    ],
  },
]

export function createAppRouter(): ReturnType<typeof createBrowserRouter> {
  return createBrowserRouter(routes)
}
