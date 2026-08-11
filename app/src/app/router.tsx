import { createBrowserRouter, type RouteObject } from 'react-router-dom'

import { ProjectLauncherPage } from '../features/launcher/ProjectLauncherPage'
import { CanvasPage } from '../features/canvas/CanvasPage'
import { PreviewPage } from '../features/timeline/PreviewPage'
import { PlatformShell } from '../features/platform/PlatformShell'

export const routes: RouteObject[] = [
  {
    element: <PlatformShell />,
    children: [{ index: true, element: <ProjectLauncherPage /> }],
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
