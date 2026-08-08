import { createBrowserRouter, type RouteObject } from 'react-router-dom'

import { ProjectLauncherPage } from '../features/launcher/ProjectLauncherPage'
import { CanvasPage } from '../features/canvas/CanvasPage'
import { PreviewPage } from '../features/timeline/PreviewPage'

export const routes: RouteObject[] = [
  { path: '/', element: <ProjectLauncherPage /> },
  { path: '/project/:projectId', element: <CanvasPage /> },
  { path: '/project/:projectId/preview', element: <PreviewPage /> },
]

export function createAppRouter(): ReturnType<typeof createBrowserRouter> {
  return createBrowserRouter(routes)
}
