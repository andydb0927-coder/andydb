import { createBrowserRouter, type RouteObject } from 'react-router-dom'

import { ProjectLauncherPage } from '../features/launcher/ProjectLauncherPage'
import { CanvasPage } from '../features/canvas/CanvasPage'

const Stub = ({ title }: { title: string }) => (
  <main>
    <h1>{title}</h1>
  </main>
)

export const routes: RouteObject[] = [
  { path: '/', element: <ProjectLauncherPage /> },
  { path: '/project/:projectId', element: <CanvasPage /> },
  { path: '/project/:projectId/preview', element: <Stub title="成片预览" /> },
]

export function createAppRouter(): ReturnType<typeof createBrowserRouter> {
  return createBrowserRouter(routes)
}
