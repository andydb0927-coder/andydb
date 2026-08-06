import { createBrowserRouter, type RouteObject } from 'react-router-dom'

const Stub = ({ title }: { title: string }) => (
  <main>
    <h1>{title}</h1>
  </main>
)

export const routes: RouteObject[] = [
  { path: '/', element: <Stub title="创建你的第一部短片" /> },
  { path: '/project/:projectId', element: <Stub title="项目画布" /> },
  { path: '/project/:projectId/preview', element: <Stub title="成片预览" /> },
]

export function createAppRouter(): ReturnType<typeof createBrowserRouter> {
  return createBrowserRouter(routes)
}
